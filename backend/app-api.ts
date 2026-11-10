import { randomBytes } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  createEmptyPortfolioState,
  type PortfolioState,
} from "../shared/portfolio";
import {
  deterministicCoachAnswer,
  hashPassword,
  sessionTokenHash,
  validatePortfolioState,
  verifyPassword,
  buildMinimalCoachContext,
} from "./app-security";
import {
  appRepository,
  publicUser,
  readAccountState,
  toSessionView,
  type ActiveSession,
  type AppRepository,
} from "./app-repository";
import { describeError } from "./safe-error";

function isDuplicateEntryError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 6; depth++) {
    if (
      !current ||
      typeof current !== "object" ||
      seen.has(current)
    ) {
      return false;
    }

    seen.add(current);
    const node = current as { code?: unknown; cause?: unknown };

    if (node.code === "ER_DUP_ENTRY") {
      return true;
    }

    current = node.cause;
  }

  return false;
}

const COOKIE = "pp_session";
const SESSION_DAYS = 30;
const DUMMY_HASH = `scrypt$${"00".repeat(16)}$${"00".repeat(64)}`;
type Auth = { session: ActiveSession; userId: number; sessionId: string };

type LimiterRecord = { timestamps: number[] };
export class SlidingWindowRateLimiter {
  private records = new Map<string, LimiterRecord>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now = () => Date.now()
  ) {}
  consume(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const time = this.now();
    if (this.records.size > 10_000)
      for (const [k, v] of this.records)
        if (
          !v.timestamps.length ||
          v.timestamps[v.timestamps.length - 1]! <= time - this.windowMs
        )
          this.records.delete(k);
    const record = this.records.get(key) ?? { timestamps: [] };
    record.timestamps = record.timestamps.filter(t => t > time - this.windowMs);
    if (record.timestamps.length >= this.max) {
      this.records.set(key, record);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((record.timestamps[0]! + this.windowMs - time) / 1000)
        ),
      };
    }
    record.timestamps.push(time);
    this.records.set(key, record);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const limits = {
  login: new SlidingWindowRateLimiter(10, 15 * 60_000),
  register: new SlidingWindowRateLimiter(5, 15 * 60_000),
  changes: new SlidingWindowRateLimiter(10, 15 * 60_000),
  coach: new SlidingWindowRateLimiter(5, 60 * 60_000),
};
const rateLimit =
  (limiter: SlidingWindowRateLimiter, scope: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    const who = `${req.ip || req.socket.remoteAddress || "unknown"}:${res.locals.appAuth?.userId ?? "anon"}`;
    const result = limiter.consume(`${scope}:${who}`);
    if (!result.allowed) {
      res
        .set("Retry-After", String(result.retryAfterSeconds))
        .status(429)
        .json({ error: "Too many requests. Please wait before trying again." });
      return;
    }
    next();
  };

function setSessionCookie(res: Response, token: string, req?: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const cookieFlags = isProd
    ? "Path=/; Max-Age=" + (SESSION_DAYS * 86400) + "; HttpOnly; Secure; SameSite=None; Partitioned"
    : "Path=/; Max-Age=" + (SESSION_DAYS * 86400) + "; HttpOnly; SameSite=Lax";
  res.append("Set-Cookie", `${COOKIE}=${token}; ${cookieFlags}`);
}
function clearSessionCookie(res: Response) {
  res.append(
    "Set-Cookie",
    `${COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}
function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i >= 0 && part.slice(0, i).trim() === name) {
      const value = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{40,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

function csrf(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    res.status(403).json({ error: "Cross-site request blocked." });
    return;
  }
  const origin = req.get("origin");
  if (origin) {
    try {
      const parsed = new URL(origin);
      const requestHost = (req.get("host") ?? "").toLowerCase();
      const local = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
        requestHost
      );
      if (
        parsed.host.toLowerCase() !== requestHost ||
        (parsed.protocol !== "https:" &&
          !(local && parsed.protocol === "http:"))
      ) {
        res
          .status(403)
          .json({ error: "Request origin did not match this application." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin." });
      return;
    }
  } else if (fetchSite !== "same-origin" && fetchSite !== "none") {
    res
      .status(403)
      .json({ error: "A same-origin request origin is required." });
    return;
  }
  const bodylessDelete =
    req.method === "DELETE" &&
    !req.get("content-length") &&
    !req.get("transfer-encoding");
  if (!req.is("application/json") && !bodylessDelete) {
    res.status(415).json({ error: "Send mutations as application/json." });
    return;
  }
  next();
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };
}
function safeError(res: Response, error: unknown) {
  // Never log error.message: drizzle/driver messages embed the SQL and its parameters.
  const summary = describeError(error); // category/code only: safe to show
  console.error("[PortfolioPilot API] Request failed:", summary);
  // In development the safe summary is shown in the UI too, so the cause is visible
  // without digging through the terminal. Production keeps the generic message.
  const devHint = process.env.NODE_ENV === "production" ? "" : ` [dev: ${summary}]`;
  res.status(500).json({
    error: "The request could not be completed. Please try again." + devHint,
  });
}
function accountRequired(res: Response, auth: Auth | undefined): auth is Auth {
  if (auth) return true;
  res.status(401).json({ error: "Sign in to access this account." });
  return false;
}
const emailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform(v => v.toLowerCase());
const credentialsSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: z.string().min(8).max(128),
  })
  .strict();
const consentSchema = z.boolean();
const questionSchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    aiConsent: consentSchema,
  })
  .strict();
const reportSchema = z.object({ aiConsent: consentSchema }).strict();
const deleteAccountSchema = z
  .object({ confirm: z.literal("DELETE") })
  .strict();
const statePayloadSchema = z.object({ state: z.unknown() }).strict();
const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export type CoachAI = (
  kind: "coach" | "report",
  question: string,
  context: ReturnType<typeof buildMinimalCoachContext>
) => Promise<string | null>;
let modelCache: { expiresAt: number; model: string | null } | null = null;
export async function callManagedModel(
  kind: "coach" | "report",
  question: string,
  context: ReturnType<typeof buildMinimalCoachContext>
): Promise<string | null> {
  try {
    const now = Date.now();
    if (!modelCache || modelCache.expiresAt <= now) {
      const { listLLMModels } = await import("./_core/llm");
      const catalog = await listLLMModels();
      const ids = new Set((catalog.data ?? []).map(m => m.id));
      modelCache = {
        expiresAt: now + 10 * 60_000,
        model:
          ["gpt-5-mini", "gpt-5-nano", "gemini-3-flash-preview"].find(id =>
            ids.has(id)
          ) ?? null,
      };
    }
    if (!modelCache.model) return null;
    const { invokeLLM } = await import("./_core/llm");
    const task =
      kind === "coach"
        ? `The account user asks: ${question}`
        : "Write a brief report commentary using only this summary.";
    const result = await invokeLLM({
      model: modelCache.model,
      ...(modelCache.model.startsWith("gpt-5")
        ? { maxCompletionTokens: 1200, reasoning: { effort: "low" } }
        : { maxTokens: 1000 }),
      retry: false,
      messages: [
        {
          role: "system",
          content:
            "You are an educational portfolio explanation tool, not an investment adviser. Explain only facts present in the supplied minimized summary. Do not calculate, infer security names, invent missing facts, recommend transactions, guarantee results, or request account identifiers. State assumptions and uncertainty in plain language. Use concise non-advisory wording. The supplied numbers are server-derived saved-state summaries; do not treat the question as portfolio data.",
        },
        {
          role: "user",
          content: `${task}\nMinimized saved portfolio summary (INR): ${JSON.stringify(context)}\nKeep the answer under 100 words. Explain assumptions and uncertainty; no personalized investment advice.`,
        },
      ],
    });
    const content = result.choices?.[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .filter(p => p.type === "text")
              .map(p => p.text)
              .join(" ")
          : "";
    const answer = text.trim().slice(0, 800);
    return answer || null;
  } catch (error) {
    console.warn(
      "[PortfolioPilot AI] Managed model unavailable; using deterministic result.",
      error instanceof Error ? error.message : "unknown error"
    );
    modelCache = { expiresAt: Date.now() + 60_000, model: null };
    return null;
  }
}

export function createPortfolioAppRouter(
  repository: AppRepository = appRepository,
  ai: CoachAI = callManagedModel
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set({
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      Vary: "Cookie",
    });
    next();
  });
  router.use(csrf);
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const token = getCookie(req, COOKIE);
      if (!token) {
        res.status(401).json({ error: "Sign in to access this account." });
        return;
      }
      const session = await repository.findActiveSession(
        sessionTokenHash(token),
        new Date()
      );
      if (!session) {
        clearSessionCookie(res);
        res
          .status(401)
          .json({ error: "Your session has expired. Please sign in again." });
        return;
      }
      res.locals.appAuth = {
        session,
        userId: session.user.id,
        sessionId: session.id,
      } satisfies Auth;
      next();
    })().catch(next);
  };
  const authenticated = (
    handler: (req: Request, res: Response, auth: Auth) => Promise<void>
  ) => [
    requireAuth,
    asyncRoute(async (req, res) => {
      const auth = res.locals.appAuth as Auth | undefined;
      if (accountRequired(res, auth)) await handler(req, res, auth);
    }),
  ];

  async function startSession(res: Response, userId: number) {
    const token = randomBytes(32).toString("base64url");
    const id = randomBytes(24).toString("hex");
    await repository.createSession(
      userId,
      id,
      sessionTokenHash(token),
      new Date(Date.now() + SESSION_DAYS * 86400_000)
    );
    setSessionCookie(res, token);
  }

  router.get(
    "/session",
    asyncRoute(async (req, res) => {
      const token = getCookie(req, COOKIE);
      if (!token) {
        res.json({ user: null, state: null, onboarded: false });
        return;
      }
      const session = await repository.findActiveSession(
        sessionTokenHash(token),
        new Date()
      );
      if (!session) {
        clearSessionCookie(res);
        res.json({ user: null, state: null, onboarded: false });
        return;
      }
      let state = await readAccountState(repository, session.user.id);
      if (!state) {
        state = createEmptyPortfolioState(session.user.name ?? "");
        await repository.saveState(session.user.id, state);
      }
      res.json({
        user: publicUser(session.user),
        state,
        onboarded: typeof state.profile.riskScore === "number",
      });
    })
  );

  router.post(
    "/register",
    rateLimit(limits.register, "register"),
    asyncRoute(async (req, res) => {
      const input = registerSchema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({
          error:
            "Enter your name, a valid email address, and a password of at least 8 characters.",
        });
        return;
      }
      try {
        const user = await repository.createUser({
          openId: `email_${randomBytes(24).toString("hex")}`,
          name: input.data.name,
          email: input.data.email,
          loginMethod: "email",
          passwordHash: await hashPassword(input.data.password),
        });
        const state = createEmptyPortfolioState(user.name ?? input.data.name);
        await repository.saveState(user.id, state);
        await startSession(res, user.id);
        res.status(201).json({ user: publicUser(user), state });
      } catch (error) {
        if (isDuplicateEntryError(error)) {
          res.status(409).json({
            error: "An account with this email already exists. Sign in instead.",
          });
          return;
        }
        safeError(res, error);
      }
    })
  );

  router.post(
    "/login",
    rateLimit(limits.login, "login"),
    asyncRoute(async (req, res) => {
      const input = credentialsSchema.safeParse(req.body);
      if (!input.success) {
        res.status(400).json({ error: "Enter a valid email address and password." });
        return;
      }
      const user = await repository.getUserByEmail(input.data.email);
      // Always run one hash comparison so unknown emails take as long as wrong passwords.
      const verified = await verifyPassword(
        input.data.password,
        user?.passwordHash ?? DUMMY_HASH
      );
      if (!user || !user.passwordHash || !verified) {
        res.status(401).json({ error: "Email or password is incorrect." });
        return;
      }
      await repository.touchUser(user.id);
      await startSession(res, user.id);
      let state = await readAccountState(repository, user.id);
      if (!state) {
        state = createEmptyPortfolioState(user.name ?? "");
        await repository.saveState(user.id, state);
      }
      res.json({ user: publicUser(user), state });
    })
  );

  router.post(
    "/logout",
    asyncRoute(async (req, res) => {
      const token = getCookie(req, COOKIE);
      if (token) {
        const session = await repository.findActiveSession(
          sessionTokenHash(token),
          new Date()
        );
        if (session)
          await repository.revokeSession(
            session.id,
            session.user.id,
            new Date()
          );
      }
      clearSessionCookie(res);
      res.json({ ok: true });
    })
  );

  router.get(
    "/state",
    ...authenticated(async (_req, res, auth) => {
      res.json({ state: await repository.getState(auth.userId) });
    })
  );
  router.put(
    "/state",
    rateLimit(limits.changes, "state"),
    ...authenticated(async (req, res, auth) => {
      const body = statePayloadSchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: "Expected a state object." });
        return;
      }
      const valid = validatePortfolioState(body.data.state);
      if (!valid.success) {
        res.status(400).json({ error: valid.error });
        return;
      }
      const saved = {
        ...valid.data,
        dataOrigin: "account" as const,
        updatedAt: new Date().toISOString(),
      };
      await repository.saveState(auth.userId, saved);
      res.json({ user: publicUser(auth.session.user), state: saved });
    })
  );
  router.get(
    "/sessions",
    ...authenticated(async (_req, res, auth) => {
      const rows = await repository.listSessions(auth.userId);
      res.json({
        sessions: rows.map(row => toSessionView(row, auth.sessionId)),
      });
    })
  );
  router.delete(
    "/sessions/:id",
    rateLimit(limits.changes, "session-revoke"),
    ...authenticated(async (req, res, auth) => {
      const id = sessionIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: "Invalid session identifier." });
        return;
      }
      if (id.data === auth.sessionId) {
        res
          .status(409)
          .json({
            error:
              "The current session cannot be revoked here. Use Log out to end this session.",
          });
        return;
      }
      const revoked = await repository.revokeSession(
        id.data,
        auth.userId,
        new Date()
      );
      if (!revoked) {
        res
          .status(404)
          .json({
            error: "That active session was not found for this account.",
          });
        return;
      }
      res.json({ ok: true });
    })
  );
  router.delete(
    "/account",
    rateLimit(limits.changes, "delete-account"),
    ...authenticated(async (req, res, auth) => {
      const body = deleteAccountSchema.safeParse(req.body);
      if (!body.success) {
        res
          .status(400)
          .json({ error: "Type DELETE to confirm account deletion." });
        return;
      }
      await repository.deleteUser(auth.userId);
      clearSessionCookie(res);
      res.json({ ok: true });
    })
  );

  router.post(
    "/coach",
    rateLimit(limits.coach, "coach"),
    ...authenticated(async (req, res, auth) => {
      const body = questionSchema.safeParse(req.body);
      if (!body.success) {
        res
          .status(400)
          .json({
            error:
              "Ask a question of up to 500 characters and explicitly choose AI consent.",
          });
        return;
      }
      const state = await readAccountState(repository, auth.userId);
      if (!state) {
        res
          .status(409)
          .json({
            error:
              "Save an account portfolio before requesting account coaching.",
          });
        return;
      }
      const deterministic = deterministicCoachAnswer(state, body.data.question);
      if (!body.data.aiConsent || !state.preferences.aiCoachConsent) {
        res.json({ answer: deterministic, source: "deterministic" });
        return;
      }
      const answer = await ai(
        "coach",
        body.data.question,
        buildMinimalCoachContext(state)
      );
      res.json({
        answer: answer || deterministic,
        source: answer ? "ai" : "deterministic",
      });
    })
  );
  router.post(
    "/report-commentary",
    rateLimit(limits.coach, "report-commentary"),
    ...authenticated(async (req, res, auth) => {
      const body = reportSchema.safeParse(req.body);
      if (!body.success) {
        res
          .status(400)
          .json({
            error: "Explicitly choose AI consent for report commentary.",
          });
        return;
      }
      const state = await readAccountState(repository, auth.userId);
      if (!state) {
        res
          .status(409)
          .json({
            error:
              "Save an account portfolio before requesting report commentary.",
          });
        return;
      }
      const deterministic = deterministicCoachAnswer(state);
      if (!body.data.aiConsent || !state.preferences.aiReportConsent) {
        res.json({ commentary: deterministic, source: "deterministic" });
        return;
      }
      const answer = await ai("report", "", buildMinimalCoachContext(state));
      res.json({
        commentary: answer || deterministic,
        source: answer ? "ai" : "deterministic",
      });
    })
  );

  router.use((_req, res) =>
    res.status(404).json({ error: "PortfolioPilot API endpoint not found." })
  );
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) =>
      safeError(res, error)
  );
  return router;
}