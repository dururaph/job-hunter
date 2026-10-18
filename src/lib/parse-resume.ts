import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import mammoth from "mammoth";
import { z } from "zod";
import { assertCompleted, claude, MODEL } from "./claude";
import { type Resume, ResumeSchema } from "./resume";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Every field is required here (empty string / empty array when absent) so the model
// always returns the full shape; blanks are cleaned up before validation.
const Extracted = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  summary: z.string(),
  targetRoles: z
    .array(z.string())
    .describe("3-5 job titles this person is realistically qualified for now, based on their experience level"),
  skills: z.array(z.string()).describe("Individual skills, tools, and technologies, one per entry"),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string().describe('"Present" if current'),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({ name: z.string(), link: z.string(), tech: z.array(z.string()), bullets: z.array(z.string()) }),
  ),
  education: z.array(
    z.object({ school: z.string(), degree: z.string(), start: z.string(), end: z.string(), details: z.string() }),
  ),
  certifications: z.array(z.string()),
});

const SYSTEM = `You convert resumes into structured data.
- Copy bullets, titles, dates, and names exactly as written. Do not rewrite, summarize, or improve anything.
- Use an empty string or empty list for anything the resume doesn't contain. Never guess contact details.
- Split skill lists into individual skills.
- targetRoles is the one field you infer: realistic job titles for this person's current level.`;

type FileKind = "pdf" | "docx" | "text";

function kindOf(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (file.type.startsWith("text/") || /\.(txt|md)$/.test(name)) return "text";
  return null;
}

/** Reads an uploaded resume file (PDF, DOCX, TXT, MD) and returns it as structured data. */
export async function parseResumeFile(file: File): Promise<Resume> {
  const kind = kindOf(file);
  if (!kind) throw new Error("Upload a PDF, Word (.docx), or text file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("That file is over 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());

  let content: Anthropic.Beta.BetaContentBlockParam[];
  if (kind === "pdf") {
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
      { type: "text", text: "Extract this resume." },
    ];
  } else {
    const text = kind === "docx" ? (await mammoth.extractRawText({ buffer: bytes })).value : bytes.toString("utf8");
    if (!text.trim()) throw new Error("Couldn't find any text in that file.");
    content = [{ type: "text", text: `Extract this resume.\n\n<resume>\n${text}\n</resume>` }];
  }

  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: betaZodOutputFormat(Extracted) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  assertCompleted(response);
  const out = response.parsed_output;
  if (!out) throw new Error("Couldn't read that resume. Try a different file format.");

  const opt = (s: string) => s.trim() || undefined;
  return ResumeSchema.parse({
    ...out,
    name: out.name.trim() || "Your Name",
    phone: opt(out.phone),
    location: opt(out.location),
    links: out.links.filter((l) => l.url.trim()),
    experience: out.experience.map((e) => ({ ...e, location: opt(e.location), bullets: e.bullets.filter(Boolean) })),
    projects: out.projects.map((p) => ({ ...p, link: opt(p.link), bullets: p.bullets.filter(Boolean) })),
    education: out.education.map((e) => ({ ...e, start: opt(e.start), end: opt(e.end), details: opt(e.details) })),
  });
}
