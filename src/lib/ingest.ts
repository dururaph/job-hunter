import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db, ingestRuns, jobs, type NewJob } from "@/db";
import { createMatcher } from "./match";
import { getResume } from "./profile";
import { getCompanies } from "./companies";
import { type Company, fetchers } from "./sources";

const CONCURRENCY = 8;
const TIMEOUT_MS = 30_000;

export interface IngestSummary {
  companies: number;
  jobsSeen: number;
  jobsNew: number;
  errors: string[];
  durationMs: number;
}

/** Pulls every configured company's board, upserts postings, and marks removed ones inactive. */
export async function ingestAll(only?: Company[], log = console.log): Promise<IngestSummary> {
  const companies = only ?? (await getCompanies());
  const started = new Date();
  const [run] = await db.insert(ingestRuns).values({ startedAt: started }).returning({ id: ingestRuns.id });
  const match = createMatcher(await getResume());
  const errors: string[] = [];
  let jobsSeen = 0;
  let jobsNew = 0;

  const queue = [...companies];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const { seen, added } = await ingestCompany(c, started, match);
        jobsSeen += seen;
        jobsNew += added;
        log(`✓ ${c.name.padEnd(14)} ${String(seen).padStart(4)} jobs  (+${added} new)`);
      } catch (err) {
        const msg = `${c.name} (${c.source}/${c.slug}): ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        log(`✗ ${msg}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await db
    .update(ingestRuns)
    .set({ finishedAt: new Date(), jobsSeen, jobsNew, errors })
    .where(eq(ingestRuns.id, run.id));

  return { companies: companies.length, jobsSeen, jobsNew, errors, durationMs: Date.now() - started.getTime() };
}

async function ingestCompany(c: Company, runStart: Date, match: ReturnType<typeof createMatcher>) {
  const postings = await fetchers[c.source](c.slug, AbortSignal.timeout(TIMEOUT_MS));
  const now = new Date();

  const rows: NewJob[] = postings.map((p) => {
    const m = match(p);
    return {
      id: `${c.source}:${c.slug}:${p.externalId}`,
      source: c.source,
      companySlug: c.slug,
      company: c.name,
      title: p.title,
      location: p.location,
      remote: p.remote,
      department: p.department,
      url: p.url,
      description: p.description,
      salary: p.salary,
      postedAt: p.postedAt && !Number.isNaN(p.postedAt.getTime()) ? p.postedAt : null,
      firstSeenAt: now,
      lastSeenAt: now,
      active: true,
      matchScore: m.score,
      matchedSkills: m.matched,
      missingSkills: m.missing,
    };
  });

  let added = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(inArray(jobs.id, chunk.map((r) => r.id)));
    added += chunk.length - existing.length;

    // Refresh posting fields but keep firstSeenAt and the user's status.
    await db
      .insert(jobs)
      .values(chunk)
      .onConflictDoUpdate({
        target: jobs.id,
        set: {
          title: sql`excluded.title`,
          location: sql`excluded.location`,
          remote: sql`excluded.remote`,
          department: sql`excluded.department`,
          url: sql`excluded.url`,
          description: sql`excluded.description`,
          salary: sql`excluded.salary`,
          postedAt: sql`excluded.posted_at`,
          lastSeenAt: sql`excluded.last_seen_at`,
          active: true,
          matchScore: sql`excluded.match_score`,
          matchedSkills: sql`excluded.matched_skills`,
          missingSkills: sql`excluded.missing_skills`,
        },
      });
  }

  // Anything from this board we didn't see in this run has been taken down.
  await db
    .update(jobs)
    .set({ active: false })
    .where(and(eq(jobs.source, c.source), eq(jobs.companySlug, c.slug), lt(jobs.lastSeenAt, runStart)));

  return { seen: rows.length, added };
}
