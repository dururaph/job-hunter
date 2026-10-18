import { z } from "zod";

const Bullets = z.array(z.string().min(1));

export const ResumeSchema = z.object({
  name: z.string().min(1),
  email: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  summary: z.string().default(""),
  /** Role titles you're looking for; used to boost match scores and filter the job feed. */
  targetRoles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        location: z.string().optional(),
        start: z.string(),
        end: z.string(),
        bullets: Bullets,
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        name: z.string(),
        link: z.string().optional(),
        tech: z.array(z.string()).default([]),
        bullets: Bullets,
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string(),
        start: z.string().optional(),
        end: z.string().optional(),
        details: z.string().optional(),
      }),
    )
    .default([]),
  certifications: z.array(z.string()).default([]),
});

export type Resume = z.infer<typeof ResumeSchema>;

/** Stable ids for every section and bullet, so tailored output can be traced back to the source. */
export const expId = (i: number) => `e${i + 1}`;
export const projId = (i: number) => `p${i + 1}`;
export const bulletId = (sectionId: string, j: number) => `${sectionId}.b${j + 1}`;

/** Renders the resume as compact text with ids, for the model to reference. */
export function resumeToPromptText(r: Resume): string {
  const lines: string[] = [`NAME: ${r.name}`, `SUMMARY: ${r.summary}`, `SKILLS: ${r.skills.join(", ")}`, "", "EXPERIENCE:"];
  r.experience.forEach((e, i) => {
    const id = expId(i);
    lines.push(`[${id}] ${e.title} @ ${e.company} (${e.start} – ${e.end})`);
    e.bullets.forEach((b, j) => lines.push(`  [${bulletId(id, j)}] ${b}`));
  });
  lines.push("", "PROJECTS:");
  r.projects.forEach((p, i) => {
    const id = projId(i);
    lines.push(`[${id}] ${p.name}${p.tech.length ? ` (${p.tech.join(", ")})` : ""}`);
    p.bullets.forEach((b, j) => lines.push(`  [${bulletId(id, j)}] ${b}`));
  });
  lines.push("", "EDUCATION:", ...r.education.map((e) => `- ${e.degree}, ${e.school}${e.details ? ` — ${e.details}` : ""}`));
  if (r.certifications.length) lines.push("", "CERTIFICATIONS:", ...r.certifications.map((c) => `- ${c}`));
  return lines.join("\n");
}

/** All the free text in a resume, used for keyword matching. */
export function resumeCorpus(r: Resume): string {
  return [
    r.summary,
    r.skills.join(" , "),
    ...r.experience.flatMap((e) => [e.title, ...e.bullets]),
    ...r.projects.flatMap((p) => [p.name, p.tech.join(" , "), ...p.bullets]),
    ...r.certifications,
  ].join("\n");
}
