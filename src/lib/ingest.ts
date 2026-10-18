import { createHash } from "node:crypto";
import { and, eq, inArray, lt, notInArray } from "drizzle-orm";
import { db, ingestRuns, jobs, type NewJob, tailoredResumes } from "@/db";
import { getCompanies } from "./companies";
import { createMatcher } from "./match";
import { getResume } from "./profile";
import { type Company, fetchers, type NormalizedJob } from "./sources";

const CONCURRENCY = 8;
const TIMEOUT_MS = 30_000;
const PURGE_AFTER_DAYS = 30;

export interface IngestSummary {
  companies: number;
  jobsSeen: number;
  jobsNew: number;
  /** Rows inserted, updated, or deactivated. Most runs only touch a few dozen. */
  rowsWritten: number;
  purged: number;
  errors: string[];
  durationMs: number;
}

/**
 * Pulls each company's board and writes only what changed: new postings, edited postings,
 * and postings that disappeared. A full run also purges long-gone postings you never acted on.
 */
export async function ingestAll(only?: Company[], log = console.log): Promise<IngestSummary> {
  const companies = only ?? (await getCompanies());
  const started = new Date();
  const [run] = await db.insert(ingestRuns).values({ startedAt: started }).returning({ id: ingestRuns.id });
  const match = createMatcher(await getResume());
  const errors: string[] = [];
  let jobsSeen = 0;
  let jobsNew = 0;
  let rowsWritten = 0;

  const queue = [...companies];
  const worker = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const r = await ingestCompany(c, match);
        jobsSeen += r.seen;
        jobsNew += r.added;
        rowsWritten += r.written;
        log(`✓ ${c.name.padEnd(14)} ${String(r.seen).padStart(4)} jobs  (+${r.added} new, ${r.written} writes)`);
      } catch (err) {
        const msg = `${c.name} (${c.source}/${c.slug}): ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        log(`✗ ${msg}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const purged = only ? 0 : await purgeOldJobs();

  await db
    .update(ingestRuns)
    .set({ finishedAt: new Date(), jobsSeen, jobsNew, errors })
    .where(eq(ingestRuns.id, run.id));

  return {
    companies: companies.length,
    jobsSeen,
    jobsNew,
    rowsWritten,
    purged,
    errors,
    durationMs: Date.now() - started.getTime(),
  };
}

/** Fingerprint of everything we store about a posting, to detect edits without rewriting rows. */
function hashPosting(p: NormalizedJob): string {
  return createHash("sha1")
    .update(JSON.stringify([p.title, p.location, p.remote, p.department, p.url, p.description, p.salary, p.postedAt?.getTime() ?? null]))
    .digest("hex");
}

async function ingestCompany(c: Company, match: ReturnType<typeof createMatcher>) {
  const postings = await fetchers[c.source](c.slug, AbortSignal.timeout(TIMEOUT_MS));
  const now = new Date();

  const existing = await db
    .select({ id: jobs.id, contentHash: jobs.contentHash, active: jobs.active })
    .from(jobs)
    .where(and(eq(jobs.source, c.source), eq(jobs.companySlug, c.slug)));
  const known = new Map(existing.map((e) => [e.id, e]));

  const seen = new Set<string>();
  const inserts: NewJob[] = [];
  const updates = [];
  for (const p of postings) {
    const id = `${c.source}:${c.slug}:${p.externalId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const contentHash = hashPosting(p);
    const prev = known.get(id);
    if (prev && prev.contentHash === contentHash && prev.active) continue; // unchanged: no write

    const m = match(p);
    const fields = {
      title: p.title,
      location: p.location,
      remote: p.remote,
      department: p.department,
      url: p.url,
      description: p.description,
      salary: p.salary,
      postedAt: p.postedAt && !Number.isNaN(p.postedAt.getTime()) ? p.postedAt : null,
      contentHash,
      lastSeenAt: now,
      active: true,
      matchScore: m.score,
      matchedSkills: m.matched,
      missingSkills: m.missing,
    };
    if (prev) {
      // Keeps firstSeenAt and the user's status.
      updates.push(db.update(jobs).set(fields).where(eq(jobs.id, id)));
    } else {
      inserts.push({ id, source: c.source, companySlug: c.slug, company: c.name, firstSeenAt: now, ...fields });
    }
  }

  for (let i = 0; i < inserts.length; i += 100) {
    await db.insert(jobs).values(inserts.slice(i, i + 100)).onConflictDoNothing();
  }
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    await db.batch(chunk as [(typeof chunk)[0], ...typeof chunk]);
  }

  // Postings no longer on the board were taken down. lastSeenAt records when, for purging.
  const removed = existing.filter((e) => e.active && !seen.has(e.id)).map((e) => e.id);
  for (let i = 0; i < removed.length; i += 500) {
    await db
      .update(jobs)
      .set({ active: false, lastSeenAt: now })
      .where(inArray(jobs.id, removed.slice(i, i + 500)));
  }

  return { seen: seen.size, added: inserts.length, written: inserts.length + updates.length + removed.length };
}

/** Deletes postings gone for 30+ days, unless you saved, applied, or tailored a resume for them. */
async function purgeOldJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000);
  const deleted = await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.active, false),
        lt(jobs.lastSeenAt, cutoff),
        inArray(jobs.status, ["new", "hidden"]),
        notInArray(jobs.id, db.select({ id: tailoredResumes.jobId }).from(tailoredResumes)),
      ),
    )
    .returning({ id: jobs.id });
  return deleted.length;
}
