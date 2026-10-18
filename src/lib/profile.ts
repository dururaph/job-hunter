import { eq } from "drizzle-orm";
import example from "../../data/resume.example.json";
import { db, jobs, profile } from "@/db";
import { createMatcher } from "./match";
import { type Resume, ResumeSchema } from "./resume";

export async function getResume(): Promise<Resume> {
  const row = await db.query.profile.findFirst({ where: eq(profile.id, 1) });
  return ResumeSchema.parse(row?.resume ?? example);
}

export async function saveResume(input: unknown): Promise<Resume> {
  const resume = ResumeSchema.parse(input);
  await db
    .insert(profile)
    .values({ id: 1, resume, updatedAt: new Date() })
    .onConflictDoUpdate({ target: profile.id, set: { resume, updatedAt: new Date() } });
  await rescoreAllJobs(resume);
  return resume;
}

/** Recomputes keyword match scores for every active job (runs locally, no API cost). */
export async function rescoreAllJobs(resume: Resume) {
  const match = createMatcher(resume);
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      description: jobs.description,
      matchScore: jobs.matchScore,
      matchedSkills: jobs.matchedSkills,
      missingSkills: jobs.missingSkills,
    })
    .from(jobs)
    .where(eq(jobs.active, true));
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const updates = rows.flatMap((j) => {
    const m = match(j);
    if (m.score === j.matchScore && same(m.matched, j.matchedSkills) && same(m.missing, j.missingSkills)) return [];
    return db
      .update(jobs)
      .set({ matchScore: m.score, matchedSkills: m.matched, missingSkills: m.missing })
      .where(eq(jobs.id, j.id));
  });
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    if (chunk.length) await db.batch(chunk as [(typeof chunk)[0], ...typeof chunk]);
  }
}
