import { and, count, desc, eq, gte, inArray, like, notInArray, or, type SQL, sql } from "drizzle-orm";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { StatusSelect } from "@/components/status-select";
import { Chip, daysAgo, ScoreBadge, timeAgo } from "@/components/ui";
import { db, ingestRuns, jobs } from "@/db";
import { getResume } from "@/lib/profile";
import { JOB_STATUSES, type JobStatus } from "@/lib/statuses";
import { RefreshButton } from "./refresh-button";

const PAGE_SIZE = 50;
const SENIOR = ["senior", "sr.", "sr ", "staff", "principal", "lead", "manager", "director", "head of", "vp", "vice president"];

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function JobsPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading jobs…</p>}>
      <JobsFeed searchParams={searchParams} />
    </Suspense>
  );
}

async function JobsFeed({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const remote = one(sp.remote) === "1";
  const hideSenior = one(sp.senior) === "hide";
  const rolesOnly = one(sp.roles) === "1";
  const source = one(sp.source);
  const posted = Number(one(sp.posted)) || 0;
  const minScore = Number(one(sp.min)) || 0;
  const sort = one(sp.sort) === "newest" ? "newest" : "score";
  const statusFilter = one(sp.status)
    .split(",")
    .filter((s): s is JobStatus => (JOB_STATUSES as readonly string[]).includes(s));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const resume = await getResume();
  const where: SQL[] = [eq(jobs.active, true)];
  if (statusFilter.length) where.push(inArray(jobs.status, statusFilter));
  else where.push(notInArray(jobs.status, ["hidden", "rejected"]));
  if (q) {
    const p = `%${q}%`;
    where.push(or(like(jobs.title, p), like(jobs.company, p), like(jobs.location, p), like(jobs.department, p))!);
  }
  if (remote) where.push(eq(jobs.remote, true));
  if (source === "greenhouse" || source === "lever" || source === "ashby") where.push(eq(jobs.source, source));
  if (minScore) where.push(gte(jobs.matchScore, minScore));
  if (posted) where.push(gte(jobs.postedAt, daysAgo(posted)));
  if (hideSenior) for (const w of SENIOR) where.push(sql`lower(${jobs.title}) not like ${`%${w}%`}`);
  if (rolesOnly && resume.targetRoles.length) {
    const roleClauses = resume.targetRoles.map((r) => {
      const words = r.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      return and(...words.map((w) => sql`lower(${jobs.title}) like ${`%${w}%`}`))!;
    });
    where.push(or(...roleClauses)!);
  }

  const filter = and(...where);
  const [rows, [{ total }], [lastRun]] = await Promise.all([
    db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: jobs.company,
        location: jobs.location,
        remote: jobs.remote,
        salary: jobs.salary,
        postedAt: jobs.postedAt,
        status: jobs.status,
        matchScore: jobs.matchScore,
        matchedSkills: jobs.matchedSkills,
        missingSkills: jobs.missingSkills,
      })
      .from(jobs)
      .where(filter)
      .orderBy(...(sort === "newest" ? [desc(jobs.postedAt)] : [desc(jobs.matchScore), desc(jobs.postedAt)]))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(jobs).where(filter),
    db.select().from(ingestRuns).orderBy(desc(ingestRuns.id)).limit(1),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const params = new URLSearchParams(Object.entries(sp).map(([k, v]) => [k, one(v)]));
    params.set("page", String(n));
    return `/?${params}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {statusFilter.length ? "Tracker" : "Jobs"}{" "}
            <span className="text-base font-normal text-muted">{total.toLocaleString()} matching</span>
          </h1>
          <p className="text-sm text-muted">
            {lastRun?.finishedAt
              ? `Last refreshed ${timeAgo(lastRun.finishedAt)} · ${lastRun.jobsSeen.toLocaleString()} live postings`
              : "No jobs fetched yet — click Refresh."}
          </p>
        </div>
        <RefreshButton />
      </div>

      <form method="get" className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, company, location…"
          className="rounded-md border border-line bg-background px-3 py-2 sm:col-span-2"
        />
        <select name="sort" defaultValue={sort} className="rounded-md border border-line bg-background px-3 py-2">
          <option value="score">Best match first</option>
          <option value="newest">Newest first</option>
        </select>
        <select name="posted" defaultValue={String(posted || "")} className="rounded-md border border-line bg-background px-3 py-2">
          <option value="">Posted any time</option>
          <option value="1">Past 24 hours</option>
          <option value="7">Past week</option>
          <option value="30">Past month</option>
        </select>
        <select name="source" defaultValue={source} className="rounded-md border border-line bg-background px-3 py-2">
          <option value="">All boards</option>
          <option value="greenhouse">Greenhouse</option>
          <option value="lever">Lever</option>
          <option value="ashby">Ashby</option>
        </select>
        <select name="min" defaultValue={String(minScore || "")} className="rounded-md border border-line bg-background px-3 py-2">
          <option value="">Any match score</option>
          <option value="40">Score 40+</option>
          <option value="60">Score 60+</option>
          <option value="80">Score 80+</option>
        </select>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="remote" value="1" defaultChecked={remote} /> Remote
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="senior" value="hide" defaultChecked={hideSenior} /> Hide senior+
          </label>
          <label className="flex items-center gap-2" title={resume.targetRoles.join(", ")}>
            <input type="checkbox" name="roles" value="1" defaultChecked={rolesOnly} /> My target roles
          </label>
          {statusFilter.length > 0 && <input type="hidden" name="status" value={statusFilter.join(",")} />}
          <button className="ml-auto rounded-md bg-foreground px-4 py-2 font-medium text-background">Apply</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-8 text-center text-muted">No jobs match these filters.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {rows.map((j) => (
            <li key={j.id} className="flex gap-4 p-4">
              <ScoreBadge score={j.matchScore} />
              <div className="min-w-0 flex-1">
                <Link href={`/jobs/${encodeURIComponent(j.id)}`} className="font-medium hover:text-accent">
                  {j.title}
                </Link>
                <p className="truncate text-sm text-muted">
                  {j.company} · {j.location || "Location not listed"}
                  {j.remote && " · Remote"}
                  {j.salary && ` · ${j.salary}`}
                  {j.postedAt && ` · ${timeAgo(j.postedAt)}`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {j.matchedSkills.slice(0, 6).map((s) => (
                    <Chip key={s} tone="good">
                      {s}
                    </Chip>
                  ))}
                  {j.missingSkills.slice(0, 3).map((s) => (
                    <Chip key={s} tone="bad">
                      {s}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                <StatusSelect jobId={j.id} status={j.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-4 text-sm">
          {page > 1 && <Link href={pageHref(page - 1)}>← Previous</Link>}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && <Link href={pageHref(page + 1)}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}
