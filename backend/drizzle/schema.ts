import {
  int,
  longtext,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Local password auth is opt-in; OAuth-created users keep this null. */
  passwordHash: text("passwordHash"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Existing opaque-token session table. Never store the browser token itself. */
export const appSessions = mysqlTable("app_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

/** Existing one-row-per-account JSON state store. Augmented with Task 3 Risk & Preferences. */
export const portfolioStates = mysqlTable("portfolio_states", {
  userId: int("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  riskProfile: varchar("riskProfile", { length: 64 }),
  riskScore: int("riskScore"),
  riskTier: varchar("riskTier", { length: 64 }),
  archetype: varchar("archetype", { length: 128 }),
  preferencesJson: text("preferencesJson"),
  stateJson: longtext("stateJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSession = typeof appSessions.$inferSelect;
export type PortfolioStateRow = typeof portfolioStates.$inferSelect;
export type InsertPortfolioStateRow = typeof portfolioStates.$inferInsert;
