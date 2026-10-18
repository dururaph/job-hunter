import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusSelect } from "@/components/status-select";
import { Chip, ScoreBadge, timeAgo } from "@/components/ui";
import { db, jobs, tailoredResumes } from "@/db";
import type { TailoredResume } from "@/lib/tailor";
import { TailorButton } from "./tailor-button";

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <JobDetail params={params} />
    </Suspense>
  );
}

async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = decodeURIComponent((await params).id);
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, id) });
  if (!job) notFound();
  const versions = await db
    .select()
    .from(tailoredResumes)
    .where(eq(tailoredResumes.jobId, id))
    .orderBy(desc(tailoredResumes.createdAt));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <article className="min-w-0 space-y-4">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← All jobs
        </Link>
        <div className="flex items-start gap-4">
          <ScoreBadge score={job.matchScore} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
            <p className="text-muted">
              {job.company} · {job.location || "Location not listed"}
              {job.remote && " · Remote"}
              {job.department && ` · ${job.department}`}
            </p>
            <p className="text-sm text-muted">
              {job.salary && `${job.salary} · `}
              {job.postedAt && `Posted ${timeAgo(job.postedAt)} · `}via {job.source}
              {!job.active && " · No longer listed"}
            </p>
          </div>
        </div>
        <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface p-5 text-sm leading-relaxed">
          {job.description || "No description provided."}
        </div>
      </article>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-md bg-foreground px-4 py-2 text-center text-sm font-medium text-background"
          >
            Open posting & apply ↗
          </a>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Status</span>
            <StatusSelect jobId={job.id} status={job.status} />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Keyword match</h2>
          <div className="flex flex-wrap gap-1">
            {job.matchedSkills.map((s) => (
              <Chip key={s} tone="good">
                {s}
              </Chip>
            ))}
            {job.missingSkills.map((s) => (
              <Chip key={s} tone="bad">
                {s}
              </Chip>
            ))}
            {job.matchedSkills.length + job.missingSkills.length === 0 && (
              <span className="text-sm text-muted">No known skills detected in this posting.</span>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Tailored resume</h2>
          <p className="text-xs text-muted">
            Claude rewrites and reorders your existing bullets for this posting. It can&apos;t add experience you don&apos;t have.
          </p>
          <TailorButton jobId={job.id} />
          {versions.length > 0 && (
            <ul className="space-y-1 text-sm">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/tailored/${v.id}`} className="text-accent hover:underline">
                    Version from {timeAgo(v.createdAt)} · fit {(v.result as TailoredResume).analysis.matchScore}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
