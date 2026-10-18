import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { JOB_STATUSES } from "../lib/statuses";

export { JOB_STATUSES, type JobStatus } from "../lib/statuses";

export const jobs = sqliteTable(
  "jobs",
  {
    // `${source}:${companySlug}:${externalId}` — stable across runs, so upserts dedupe.
    id: text("id").primaryKey(),
    source: text("source", { enum: ["greenhouse", "lever", "ashby"] }).notNull(),
    companySlug: text("company_slug").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    remote: integer("remote", { mode: "boolean" }).notNull().default(false),
    department: text("department"),
    url: text("url").notNull(),
    description: text("description").notNull().default(""),
    salary: text("salary"),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    /** Hash of the posting's content; ingestion skips the write when it hasn't changed. */
    contentHash: text("content_hash"),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("new"),
    matchScore: integer("match_score").notNull().default(0),
    matchedSkills: text("matched_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    missingSkills: text("missing_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  },
  (t) => [
    index("jobs_active_score_idx").on(t.active, t.matchScore),
    index("jobs_posted_idx").on(t.postedAt),
    index("jobs_company_idx").on(t.companySlug),
  ],
);

export const companies = sqliteTable("companies", {
  // `${source}:${slug}`
  id: text("id").primaryKey(),
  source: text("source", { enum: ["greenhouse", "lever", "ashby"] }).notNull(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  origin: text("origin", { enum: ["seed", "discovered", "manual"] }).notNull(),
  /** Why discovery suggested this company. */
  reason: text("reason"),
  addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
});

// Single-row table holding the master resume.
export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  resume: text("resume", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const tailoredResumes = sqliteTable("tailored_resumes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  result: text("result", { mode: "json" }).notNull(),
});

export const ingestRuns = sqliteTable("ingest_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  jobsSeen: integer("jobs_seen").notNull().default(0),
  jobsNew: integer("jobs_new").notNull().default(0),
  errors: text("errors", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
