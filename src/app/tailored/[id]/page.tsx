import { eq } from "drizzle-orm";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Chip } from "@/components/ui";
import { db, jobs, tailoredResumes } from "@/db";
import { getResume } from "@/lib/profile";
import type { TailoredResume } from "@/lib/tailor";
import { PrintButton } from "./print-button";

export default function TailoredPage({ params }: PageProps<"/tailored/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Tailored params={params} />
    </Suspense>
  );
}

async function Tailored({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const row = await db.query.tailoredResumes.findFirst({ where: eq(tailoredResumes.id, id) });
  if (!row) notFound();
  const [job, resume] = await Promise.all([db.query.jobs.findFirst({ where: eq(jobs.id, row.jobId) }), getResume()]);
  const t = row.result as TailoredResume;
  const changed = [...t.experience, ...t.projects].flatMap((s) => s.tailored).filter((b) => b.text !== b.original);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/jobs/${encodeURIComponent(row.jobId)}`} className="text-sm text-muted hover:text-foreground">
            ← Back to job
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tailored for {job?.title ?? "job"} <span className="text-muted">at {job?.company}</span>
          </h1>
        </div>
        <PrintButton />
      </div>

      <section className="no-print grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-sm text-muted">Estimated fit</p>
          <p className="text-4xl font-semibold">{t.analysis.matchScore}</p>
          <p className="mt-2 text-sm">{t.analysis.notes}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">You match</p>
          <div className="flex flex-wrap gap-1">
            {t.analysis.matchedRequirements.map((r) => (
              <Chip key={r} tone="good">
                {r}
              </Chip>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">Gaps to address</p>
          <div className="flex flex-wrap gap-1">
            {t.analysis.gaps.length ? (
              t.analysis.gaps.map((r) => (
                <Chip key={r} tone="bad">
                  {r}
                </Chip>
              ))
            ) : (
              <span className="text-sm text-muted">None found</span>
            )}
          </div>
        </div>
      </section>

      {t.warnings.length > 0 && (
        <section className="no-print rounded-lg border border-warn/40 bg-surface p-4 text-sm">
          <p className="font-semibold text-warn">Guardrails corrected {t.warnings.length} issue(s)</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            {t.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {changed.length > 0 && (
        <details className="no-print rounded-lg border border-line bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Review {changed.length} rewritten bullets</summary>
          <ul className="mt-3 space-y-3">
            {changed.map((b) => (
              <li key={b.sourceId} className="grid gap-1 md:grid-cols-2 md:gap-4">
                <p className="text-muted line-through decoration-bad/50">{b.original}</p>
                <p>{b.text}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* The resume sheet: this is the only part that prints. */}
      <article className="print-sheet mx-auto max-w-[8.5in] space-y-4 rounded-lg border border-line bg-white p-10 text-[13px] leading-snug text-zinc-900 shadow-sm">
        <header className="text-center">
          <h2 className="text-2xl font-bold">{resume.name}</h2>
          <p>
            {[resume.location, resume.email, resume.phone, ...resume.links.map((l) => l.url.replace(/^https?:\/\//, ""))]
              .filter(Boolean)
              .join("  |  ")}
          </p>
        </header>

        {t.summary && <p>{t.summary}</p>}

        <ResumeSection title="Experience">
          {t.experience.map((e) => (
            <div key={e.id} className="break-inside-avoid">
              <div className="flex justify-between font-semibold">
                <span>
                  {e.title}, {e.company}
                </span>
                <span className="font-normal">
                  {e.start} – {e.end}
                </span>
              </div>
              <ul className="list-disc pl-5">
                {e.tailored.map((b) => (
                  <li key={b.sourceId}>{b.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </ResumeSection>

        {t.projects.length > 0 && (
          <ResumeSection title="Projects">
            {t.projects.map((p) => (
              <div key={p.id} className="break-inside-avoid">
                <div className="font-semibold">
                  {p.name}
                  {p.tech.length > 0 && <span className="font-normal italic"> — {p.tech.join(", ")}</span>}
                </div>
                <ul className="list-disc pl-5">
                  {p.tailored.map((b) => (
                    <li key={b.sourceId}>{b.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </ResumeSection>
        )}

        <ResumeSection title="Skills">
          <p>{t.skills.join(", ")}</p>
        </ResumeSection>

        {resume.education.length > 0 && (
          <ResumeSection title="Education">
            {resume.education.map((e) => (
              <div key={e.school} className="flex justify-between">
                <span>
                  <span className="font-semibold">{e.school}</span> — {e.degree}
                  {e.details && `, ${e.details}`}
                </span>
                <span>{[e.start, e.end].filter(Boolean).join(" – ")}</span>
              </div>
            ))}
          </ResumeSection>
        )}

        {resume.certifications.length > 0 && (
          <ResumeSection title="Certifications">
            <p>{resume.certifications.join(", ")}</p>
          </ResumeSection>
        )}
      </article>
    </div>
  );
}

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-zinc-300 text-sm font-bold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}
