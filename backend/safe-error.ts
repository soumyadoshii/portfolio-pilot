/**
 * Safe descriptions of errors for server logs.
 *
 * Database drivers and drizzle build error messages that contain the raw SQL, the bound
 * parameters (email, name, password hash, tokens) or the connection details. Those must
 * never reach a log. `describeError` therefore NEVER copies any message text from an
 * error. It reports only a coarse category plus a few short, validated identifiers
 * (driver error code, errno, SQLSTATE, class name) that cannot carry user data.
 */

export const DB_UNAVAILABLE_MESSAGE = "Database is not available";

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EPIPE",
]);
// Class names: short identifiers only.
const SAFE_TOKEN = /^[A-Za-z0-9_]{1,64}$/;
// Driver error codes are upper-case by convention (ER_NO_SUCH_TABLE, PROTOCOL_CONNECTION_LOST,
// ECONNREFUSED). Anything else, such as a lower-case or mixed-case string, is not copied.
const DRIVER_CODE = /^(?:ER_[A-Z0-9_]{1,60}|PROTOCOL_[A-Z0-9_]{1,50}|E[A-Z0-9]{2,20})$/;
const SQL_STATE = /^[0-9A-Z]{5}$/;
const MAX_CAUSE_DEPTH = 6;

type Found = { code?: string; errno?: number; sqlState?: string; type?: string };

function inspect(error: unknown): Found {
  const found: Found = {};
  const seen = new Set<unknown>();
  let node: unknown = error;
  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && node && typeof node === "object" && !seen.has(node);
    depth++
  ) {
    seen.add(node);
    const n = node as Record<string, unknown>;
    if (!found.type) {
      const ctor = (Object.getPrototypeOf(node) as { constructor?: { name?: unknown } } | null)
        ?.constructor?.name;
      if (typeof ctor === "string" && SAFE_TOKEN.test(ctor)) found.type = ctor;
    }
    if (!found.code && typeof n.code === "string" && DRIVER_CODE.test(n.code)) found.code = n.code;
    if (found.errno === undefined && typeof n.errno === "number" && Number.isInteger(n.errno))
      found.errno = n.errno;
    if (!found.sqlState && typeof n.sqlState === "string" && SQL_STATE.test(n.sqlState))
      found.sqlState = n.sqlState;
    node = n.cause;
  }
  return found;
}

export function describeError(error: unknown): string {
  const found = inspect(error);
  const message = error instanceof Error ? error.message : undefined;
  let category: string;
  if (message === DB_UNAVAILABLE_MESSAGE) category = "database-unavailable";
  else if (found.code && (NETWORK_CODES.has(found.code) || found.code.startsWith("PROTOCOL_")))
    category = "database-connection";
  else if (
    (found.code && found.code.startsWith("ER_")) ||
    found.sqlState ||
    found.type === "DrizzleQueryError"
  )
    category = "database-query";
  else category = "unexpected";

  const parts = [`category=${category}`];
  if (found.code) parts.push(`code=${found.code}`);
  if (found.errno !== undefined) parts.push(`errno=${found.errno}`);
  if (found.sqlState) parts.push(`sqlState=${found.sqlState}`);
  parts.push(`type=${found.type ?? "unknown"}`);
  if (category === "database-unavailable")
    parts.push("(DATABASE_URL is missing or the pool could not start; restart the server after editing .env)");
  return parts.join(" ");
}
