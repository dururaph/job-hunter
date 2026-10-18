import { and, asc, eq } from "drizzle-orm";
import seed from "../../data/companies.json";
import { companies, db, jobs } from "@/db";
import { type Company, getJson, type Source } from "./sources/types";

type Origin = (typeof companies.$inferInsert)["origin"];

/** All tracked companies. Seeds from data/companies.json the first time. */
export async function getCompanies(): Promise<(Company & { origin: Origin; reason: string | null })[]> {
  let rows = await db.select().from(companies).orderBy(asc(companies.name));
  if (rows.length === 0) {
    await addCompanies(seed as Company[], "seed");
    rows = await db.select().from(companies).orderBy(asc(companies.name));
  }
  return rows.map((r) => ({ name: r.name, slug: r.slug, source: r.source, origin: r.origin, reason: r.reason }));
}

export async function addCompanies(list: (Company & { reason?: string })[], origin: Origin) {
  if (list.length === 0) return;
  await db
    .insert(companies)
    .values(
      list.map((c) => ({
        id: `${c.source}:${c.slug}`,
        source: c.source,
        slug: c.slug,
        name: c.name,
        origin,
        reason: c.reason ?? null,
        addedAt: new Date(),
      })),
    )
    .onConflictDoNothing();
}

/** Stops tracking a company and hides its postings from the feed. */
export async function removeCompany(source: Source, slug: string) {
  await db.delete(companies).where(eq(companies.id, `${source}:${slug}`));
  await db.update(jobs).set({ active: false }).where(and(eq(jobs.source, source), eq(jobs.companySlug, slug)));
}

const PROBES: Record<Source, (slug: string) => string> = {
  // Lightweight endpoints: Greenhouse without descriptions, Lever capped at one posting.
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json&limit=1`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
};

/** Returns true if the board exists and has at least one open posting. */
async function boardHasJobs(source: Source, slug: string): Promise<boolean> {
  try {
    const data = await getJson<unknown>(PROBES[source](slug), AbortSignal.timeout(10_000));
    const list = Array.isArray(data) ? data : (data as { jobs?: unknown[] }).jobs;
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}

/** Tries each slug on each board and returns the first one with live postings. */
export async function findBoard(slugs: string[]): Promise<{ source: Source; slug: string } | null> {
  const clean = [...new Set(slugs.map((s) => s.trim().toLowerCase()).filter((s) => /^[a-z0-9][a-z0-9-_.]*$/.test(s)))];
  for (const slug of clean) {
    const sources: Source[] = ["greenhouse", "lever", "ashby"];
    const hits = await Promise.all(sources.map((src) => boardHasJobs(src, slug)));
    const i = hits.indexOf(true);
    if (i >= 0) return { source: sources[i], slug };
  }
  return null;
}

/** Runs async work over items with a fixed number of concurrent workers. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
