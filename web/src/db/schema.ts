import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  boolean,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Enums ─────────────────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "team"]);

// ─── Auth.js required tables ────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  plan: planEnum("plan").default("free").notNull(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// ─── Z10 application tables ────────────────────────────────────────

export const teamRoleEnum = pgEnum("team_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const teams = pgTable("team", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_member",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").default("editor").notNull(),
    joinedAt: timestamp("joined_at", { mode: "date" }).defaultNow().notNull(),
  },
  (tm) => [primaryKey({ columns: [tm.teamId, tm.userId] })]
);

export const projects = pgTable("project", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  // .z10.html content stored as text (simple for MVP; move to object store later)
  content: text("content"),
  thumbnail: text("thumbnail"),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── API keys (for MCP / CLI access) ────────────────────────────────

export const apiKeys = pgTable("api_key", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Claude Code", "Cursor"
  // Store a SHA-256 hash of the key; the raw key is shown once at creation
  keyHash: text("key_hash").notNull().unique(),
  // Optional: prefix for display (e.g. "z10_ak_abc1...")
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "date" }),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ─── Connect tokens (for one-click agent connection) ─────────────────

export const connectTokens = pgTable(
  "connect_token",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Stored in plain text so it can be re-displayed anytime
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (ct) => [unique("connect_token_user_project_unique").on(ct.userId, ct.projectId)]
);

// ─── Usage metering ──────────────────────────────────────────────────

export const dailyUsage = pgTable(
  "daily_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Date as YYYY-MM-DD string for easy grouping */
    date: text("date").notNull(),
    /** MCP tool calls made this day */
    mcpCalls: integer("mcp_calls").default(0).notNull(),
    /** Content bytes stored (snapshot, updated on save) */
    storageBytes: integer("storage_bytes").default(0).notNull(),
  },
  (du) => [primaryKey({ columns: [du.userId, du.date] })]
);

// ─── Relations ──────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  ownedTeams: many(teams),
  teamMemberships: many(teamMembers),
  projects: many(projects),
  apiKeys: many(apiKeys),
  connectTokens: many(connectTokens),
  dailyUsage: many(dailyUsage),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, { fields: [teams.ownerId], references: [users.id] }),
  members: many(teamMembers),
  projects: many(projects),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  connectTokens: many(connectTokens),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, { fields: [apiKeys.userId], references: [users.id] }),
}));

export const connectTokensRelations = relations(connectTokens, ({ one }) => ({
  user: one(users, { fields: [connectTokens.userId], references: [users.id] }),
  project: one(projects, {
    fields: [connectTokens.projectId],
    references: [projects.id],
  }),
}));

export const dailyUsageRelations = relations(dailyUsage, ({ one }) => ({
  user: one(users, { fields: [dailyUsage.userId], references: [users.id] }),
}));
