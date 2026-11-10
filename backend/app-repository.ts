
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { appSessions, portfolioStates, users } from "./drizzle/schema";
import { getDb } from "./db";
import type { PortfolioState, RiskProfile } from "../shared/portfolio";

export type AppUserRow = typeof users.$inferSelect;
export type SessionRow = typeof appSessions.$inferSelect;
export type PublicUser = { id: number; name: string; email: string };
export type ActiveSession = SessionRow & { user: AppUserRow };

export type SessionView = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  userAgent: string;
};

export interface AppRepository {
  getUserByEmail(email: string): Promise<AppUserRow | null>;
  getUserById(id: number): Promise<AppUserRow | null>;
  createUser(values: {
    openId: string;
    name: string;
    email: string;
    loginMethod: string;
    passwordHash: string;
  }): Promise<AppUserRow>;
  touchUser(userId: number): Promise<void>;
  createSession(
    userId: number,
    id: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void>;
  findActiveSession(
    tokenHash: string,
    now: Date
  ): Promise<ActiveSession | null>;
  revokeSession(id: string, userId: number, now: Date): Promise<boolean>;
  revokeOtherSessions(
    userId: number,
    keepId: string,
    now: Date
  ): Promise<void>;
  revokeAllSessions(userId: number, now: Date): Promise<void>;
  listSessions(userId: number): Promise<SessionRow[]>;
  getState(userId: number): Promise<PortfolioState | null>;
  saveState(userId: number, state: PortfolioState): Promise<void>;
  deleteUser(userId: number): Promise<void>;
}

/**
 * Reads only the requested owner's record.
 * Callers must pass the authenticated user ID.
 */
export function readAccountState(
  repository: Pick<AppRepository, "getState">,
  authenticatedUserId: number
) {
  return repository.getState(authenticatedUserId);
}

async function database() {
  const db = await getDb();

  if (!db) {
    throw new Error("Database is not available");
  }

  return db;
}

/**
 * Parses persisted preference tags defensively.
 * Invalid optional metadata falls back to an empty list.
 */
function parsePreferenceTags(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);

    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item): item is string => typeof item === "string"
      )
    ) {
      return parsed;
    }
  } catch {
    // Keep the rest of the saved portfolio available.
  }

  return [];
}

function parseRiskProfile(value: string | null): RiskProfile | null {
  if (
    value === "Conservative" ||
    value === "Moderately Conservative" ||
    value === "Moderate" ||
    value === "Growth" ||
    value === "Aggressive"
  ) {
    return value;
  }

  return null;
}

export const appRepository: AppRepository = {
  async getUserByEmail(email) {
    const db = await database();

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return rows[0] ?? null;
  },

  async getUserById(id) {
    const db = await database();

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return rows[0] ?? null;
  },

  async createUser(values) {
    const db = await database();

    const result = await db
      .insert(users)
      .values({
        ...values,
        role: "user",
        lastSignedIn: new Date(),
      });

    const id = Number(result[0].insertId);

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!rows[0]) {
      throw new Error("Could not load created user");
    }

    return rows[0];
  },

  async touchUser(userId) {
    const db = await database();

    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, userId));
  },

  async createSession(userId, id, tokenHash, expiresAt) {
    const db = await database();

    await db.insert(appSessions).values({
      id,
      userId,
      tokenHash,
      expiresAt,
    });
  },

  async findActiveSession(tokenHash, now) {
    const db = await database();

    const rows = await db
      .select({
        session: appSessions,
        user: users,
      })
      .from(appSessions)
      .innerJoin(users, eq(appSessions.userId, users.id))
      .where(
        and(
          eq(appSessions.tokenHash, tokenHash),
          isNull(appSessions.revokedAt),
          gt(appSessions.expiresAt, now)
        )
      )
      .limit(1);

    const row = rows[0];

    return row ? { ...row.session, user: row.user } : null;
  },

  async revokeSession(id, userId, now) {
    const db = await database();

    const result = await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appSessions.id, id),
          eq(appSessions.userId, userId),
          isNull(appSessions.revokedAt)
        )
      );

    return Number(result[0].affectedRows ?? 0) > 0;
  },

  async revokeOtherSessions(userId, keepId, now) {
    const db = await database();

    await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appSessions.userId, userId),
          ne(appSessions.id, keepId),
          isNull(appSessions.revokedAt)
        )
      );
  },

  async revokeAllSessions(userId, now) {
    const db = await database();

    await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appSessions.userId, userId),
          isNull(appSessions.revokedAt)
        )
      );
  },

  async listSessions(userId) {
    const db = await database();

    return db
      .select()
      .from(appSessions)
      .where(
        and(
          eq(appSessions.userId, userId),
          isNull(appSessions.revokedAt),
          gt(appSessions.expiresAt, new Date())
        )
      )
      .orderBy(appSessions.createdAt);
  },

  async getState(userId) {
    const db = await database();

    const rows = await db
      .select()
      .from(portfolioStates)
      .where(eq(portfolioStates.userId, userId))
      .limit(1);

    if (!rows[0]) {
      return null;
    }

    const row = rows[0];

    let parsedState: unknown;

    try {
      parsedState = JSON.parse(row.stateJson);
    } catch {
      throw new Error("Saved portfolio state contains invalid JSON");
    }

    const { validatePortfolioState } = await import("./app-security");
    const validation = validatePortfolioState(parsedState);

    if (!validation.success) {
      throw new Error("Saved portfolio state is invalid");
    }

    const state = validation.data;

    // Preserve the complete profile stored in stateJson, including
    // riskAssessment, questionnaire answers, scoring details and overrides.
    //
    // The dedicated database columns below remain backward-compatible
    // overrides for fields previously stored separately.
    const savedTags = parsePreferenceTags(row.preferencesJson);

    const hasSeparateProfileFields =
      row.riskProfile !== null ||
      row.riskScore !== null ||
      row.riskTier !== null ||
      row.archetype !== null ||
      row.preferencesJson !== null;

    if (hasSeparateProfileFields) {
      const existingProfile = state.profile;
      const savedRiskProfile = parseRiskProfile(row.riskProfile);
      const savedRiskTier = parseRiskProfile(row.riskTier);

      state.profile = {
        ...existingProfile,

        ...(savedRiskProfile !== null && {
          riskProfile: savedRiskProfile,
        }),

        ...(row.riskScore !== null && {
          riskScore: row.riskScore,
        }),

        ...(savedRiskTier !== null && {
          riskTier: savedRiskTier,
        }),

        ...(row.archetype !== null && {
          archetype: row.archetype,
        }),

        ...(row.preferencesJson !== null && {
          preferences: {
            ...existingProfile.preferences,
            tags: savedTags,
          },
        }),
      };
    }

    return state;
  },

  async saveState(userId, state) {
    const db = await database();
    const profile = state.profile;

    // The full state is authoritative for the detailed risk assessment.
    // This JSON includes assessment answers, version, timestamps, component
    // scores and override explanations when those fields are present.
    const stateJson = JSON.stringify(state);

    const riskProfile = profile.riskProfile ?? null;

    const riskScore =
      typeof profile.riskScore === "number"
        ? profile.riskScore
        : null;

    const riskTier = profile.riskTier ?? null;
    const archetype = profile.archetype ?? null;

    const preferencesJson = profile.preferences
      ? JSON.stringify(profile.preferences.tags)
      : null;

    const valuesToSet = {
      userId,
      stateJson,
      riskProfile,
      riskScore,
      riskTier,
      archetype,
      preferencesJson,
      updatedAt: new Date(),
    };

    await db
      .insert(portfolioStates)
      .values(valuesToSet)
      .onDuplicateKeyUpdate({
        set: {
          stateJson: valuesToSet.stateJson,
          riskProfile: valuesToSet.riskProfile,
          riskScore: valuesToSet.riskScore,
          riskTier: valuesToSet.riskTier,
          archetype: valuesToSet.archetype,
          preferencesJson: valuesToSet.preferencesJson,
          updatedAt: new Date(),
        },
      });
  },

  async deleteUser(userId) {
    const db = await database();

    await db.delete(users).where(eq(users.id, userId));
  },
};

export const publicUser = (user: AppUserRow): PublicUser => ({
  id: user.id,
  name: user.name ?? "",
  email: user.email ?? "",
});

export function toSessionView(
  row: SessionRow,
  currentId: string,
  userAgent = "Browser session"
): SessionView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.createdAt.toISOString(),
    current: row.id === currentId,
    userAgent,
  };
}
