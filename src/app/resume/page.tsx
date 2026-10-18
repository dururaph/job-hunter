import { eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Chip, timeAgo } from "@/components/ui";
import { db, profile } from "@/db";
import { getResume } from "@/lib/profile";
import { ResumeEditor } from "./resume-editor";
import { ResumeUpload } from "./resume-upload";

export default function ResumePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your resume</h1>
        <p className="text-sm text-muted">
          Upload your resume once. Every job gets scored against it, and tailoring picks and rephrases from it without adding
          anything new.
        </p>
      </div>
      <ResumeUpload />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CurrentResume />
      </Suspense>
    </div>
  );
}

async function CurrentResume() {
  await connection();
  const [resume, row] = await Promise.all([getResume(), db.query.profile.findFirst({ where: eq(profile.id, 1) })]);
  const isExample = !row;

  return (
    <>
      <section className="space-y-3 rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">
            {isExample ? "Example resume (upload yours above)" : resume.name}
          </h2>
          {row && <span className="text-xs text-muted">Updated {timeAgo(row.updatedAt)}</span>}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Experience</dt>
            <dd>{resume.experience.map((e) => `${e.title} @ ${e.company}`).join(" · ") || "None"}</dd>
          </div>
          <div>
            <dt className="text-muted">Projects</dt>
            <dd>{resume.projects.map((p) => p.name).join(" · ") || "None"}</dd>
          </div>
          <div>
            <dt className="text-muted">Education</dt>
            <dd>{resume.education.map((e) => `${e.degree}, ${e.school}`).join(" · ") || "None"}</dd>
          </div>
        </dl>
        <div>
          <p className="mb-1 text-sm text-muted">Target roles (used for the &quot;My target roles&quot; filter and scoring)</p>
          <div className="flex flex-wrap gap-1">
            {resume.targetRoles.map((r) => (
              <Chip key={r} tone="good">
                {r}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-sm text-muted">Skills ({resume.skills.length})</p>
          <div className="flex flex-wrap gap-1">
            {resume.skills.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
          </div>
        </div>
        {!isExample && (
          <p className="text-sm">
            Next step:{" "}
            <Link href="/companies" className="text-accent hover:underline">
              find companies that fit this resume →
            </Link>
          </p>
        )}
      </section>

      <details className="rounded-lg border border-line bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold">Edit details (fix anything the upload got wrong)</summary>
        <p className="my-3 text-xs text-muted">
          This is the structured version of your resume. Edit the text between the quotes, for example to add a target role
          or fix a date, then save.
        </p>
        <ResumeEditor key={row?.updatedAt.getTime() ?? 0} initial={JSON.stringify(resume, null, 2)} />
      </details>
    </>
  );
}
