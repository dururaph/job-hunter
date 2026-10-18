import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Job } from "@/db";
import { assertCompleted, claude, MODEL } from "./claude";
import { bulletId, expId, projId, type Resume, resumeToPromptText } from "./resume";

const Section = z.object({
  id: z.string().describe("Section id from the resume, e.g. e1 or p2"),
  bullets: z
    .array(
      z.object({
        sourceId: z.string().describe("Id of the original bullet this was rewritten from, e.g. e1.b2"),
        text: z.string(),
      }),
    )
    .describe("Most relevant bullets first. Omit bullets that are irrelevant to this job."),
});

const TailorOutput = z.object({
  matchScore: z.number().int().describe("0-100 honest estimate of fit"),
  keyRequirements: z.array(z.string()).describe("The 5-10 most important requirements in the posting"),
  matchedRequirements: z.array(z.string()).describe("Requirements the resume genuinely supports"),
  gaps: z.array(z.string()).describe("Requirements the resume does not support. Be honest."),
  summary: z.string().describe("Tailored 2-3 sentence professional summary"),
  skills: z.array(z.string()).describe("Skills from the original list only, most relevant first"),
  experience: z.array(Section),
  projects: z.array(Section),
  notes: z.string().describe("Short advice for the applicant, e.g. what to emphasize in a cover letter"),
});

const SYSTEM = `You tailor resumes to specific job postings. The applicant will send this resume to a real employer, so accuracy matters more than impressiveness.

Rules:
- Only use facts present in the original resume. Never invent employers, titles, dates, metrics, tools, or accomplishments.
- You may rephrase bullets to use the posting's terminology where it truthfully describes the same work, reorder bullets, and drop irrelevant ones.
- Every output bullet must cite the sourceId of the single original bullet it was rewritten from.
- Skills must come from the original skills list; reorder them by relevance and drop irrelevant ones.
- Keep each bullet to one line where possible: strong verb, what was done, measurable result if the original has one.
- Include every experience and project section id, even if you keep only one bullet for it.`;

export interface TailoredBullet {
  sourceId: string;
  original: string;
  text: string;
}

export interface TailoredResume {
  model: string;
  analysis: Pick<z.infer<typeof TailorOutput>, "matchScore" | "keyRequirements" | "matchedRequirements" | "gaps" | "notes">;
  summary: string;
  skills: string[];
  experience: (Resume["experience"][number] & { id: string; tailored: TailoredBullet[] })[];
  projects: (Resume["projects"][number] & { id: string; tailored: TailoredBullet[] })[];
  /** Problems the guardrails caught and corrected in the model's output. */
  warnings: string[];
}

export async function tailorResume(resume: Resume, job: Job): Promise<TailoredResume> {
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(TailorOutput) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<resume>\n${resumeToPromptText(resume)}\n</resume>\n\n<job_posting>\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\n${job.description}\n</job_posting>`,
      },
    ],
  });

  assertCompleted(response);
  if (!response.parsed_output) throw new Error("The model returned output that didn't match the schema.");

  return applyGuardrails(resume, response.parsed_output, response.model);
}

/**
 * Validates model output against the source resume: drops bullets that don't cite a real
 * source, restores sections the model dropped, and removes skills the applicant never listed.
 */
export function applyGuardrails(resume: Resume, out: z.infer<typeof TailorOutput>, model: string): TailoredResume {
  const warnings: string[] = [];

  const tailorSections = <T extends { bullets: string[] }>(sections: T[], idOf: (i: number) => string, outSections: z.infer<typeof Section>[], label: (s: T) => string) =>
    sections.map((section, i) => {
      const id = idOf(i);
      const sources = new Map(section.bullets.map((b, j) => [bulletId(id, j), b]));
      const used = new Set<string>();
      const tailored: TailoredBullet[] = [];
      for (const b of outSections.find((s) => s.id === id)?.bullets ?? []) {
        const original = sources.get(b.sourceId);
        if (!original) {
          warnings.push(`Dropped a bullet under "${label(section)}" that didn't trace to your resume: "${b.text}"`);
        } else if (used.has(b.sourceId)) {
          warnings.push(`Dropped a duplicate rewrite of ${b.sourceId}.`);
        } else {
          used.add(b.sourceId);
          tailored.push({ sourceId: b.sourceId, original, text: b.text.trim() });
        }
      }
      if (tailored.length === 0 && section.bullets.length > 0) {
        warnings.push(`"${label(section)}" came back empty, so the original bullets were kept.`);
        tailored.push(...[...sources].map(([sourceId, text]) => ({ sourceId, original: text, text })));
      }
      return { ...section, id, tailored };
    });

  const allowedSkills = new Map(resume.skills.map((s) => [s.toLowerCase(), s]));
  const skills: string[] = [];
  for (const s of out.skills) {
    const canonical = allowedSkills.get(s.trim().toLowerCase());
    if (canonical && !skills.includes(canonical)) skills.push(canonical);
    else if (!canonical) warnings.push(`Removed skill "${s}" because it isn't on your resume.`);
  }

  return {
    model,
    analysis: {
      matchScore: Math.max(0, Math.min(100, out.matchScore)),
      keyRequirements: out.keyRequirements,
      matchedRequirements: out.matchedRequirements,
      gaps: out.gaps,
      notes: out.notes,
    },
    summary: out.summary.trim() || resume.summary,
    skills: skills.length ? skills : resume.skills,
    experience: tailorSections(resume.experience, expId, out.experience, (e) => `${e.title} @ ${e.company}`),
    projects: tailorSections(resume.projects, projId, out.projects, (p) => p.name),
    warnings,
  };
}
