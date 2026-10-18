import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { assertCompleted, claude, MODEL } from "./claude";
import { addCompanies, findBoard, getCompanies, mapLimit } from "./companies";
import { type Resume, resumeToPromptText } from "./resume";
import type { Company } from "./sources/types";

const Suggestions = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      slugGuesses: z
        .array(z.string())
        .describe(
          "1-3 likely job-board slugs, lowercase, as they'd appear in boards.greenhouse.io/<slug>, jobs.lever.co/<slug>, or jobs.ashbyhq.com/<slug>",
        ),
      reason: z.string().describe("One sentence on why this company fits the candidate"),
    }),
  ),
});

const SYSTEM = `You help a job seeker find companies to apply to. Suggest companies that:
- hire for the candidate's target roles at their experience level,
- value the candidate's actual skills and domain experience,
- are likely to post jobs on Greenhouse, Lever, or Ashby (most venture-backed tech companies and many public tech companies do).
Mix well-known companies with strong but less obvious ones (growth-stage startups, companies in the candidate's industry). Don't suggest companies the candidate already tracks.`;

export interface DiscoveryResult {
  added: (Company & { reason: string })[];
  notFound: string[];
}

/** Asks Claude for companies that fit the resume, keeps the ones with live boards, and tracks them. */
export async function discoverCompanies(resume: Resume, count = 40): Promise<DiscoveryResult> {
  const tracked = await getCompanies();
  const response = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(Suggestions) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Suggest ${count} companies for this candidate.\n\n<resume>\n${resumeToPromptText(resume)}\nTARGET ROLES: ${resume.targetRoles.join(", ")}\nLOCATION: ${resume.location ?? "not specified"}\n</resume>\n\n<already_tracked>\n${tracked.map((c) => c.name).join(", ")}\n</already_tracked>`,
      },
    ],
  });
  assertCompleted(response);
  if (!response.parsed_output) throw new Error("Couldn't get company suggestions. Try again.");

  const trackedNames = new Set(tracked.map((c) => c.name.toLowerCase()));
  const trackedIds = new Set(tracked.map((c) => `${c.source}:${c.slug}`));
  const candidates = response.parsed_output.companies.filter((c) => !trackedNames.has(c.name.toLowerCase()));

  // Claude's slug guesses can be stale or wrong, so only keep boards that answer with live jobs.
  const boards = await mapLimit(candidates, 8, (c) => findBoard([...c.slugGuesses, c.name.replace(/[^a-z0-9]/gi, "")]));
  const added: DiscoveryResult["added"] = [];
  const notFound: string[] = [];
  candidates.forEach((c, i) => {
    const b = boards[i];
    if (b && !trackedIds.has(`${b.source}:${b.slug}`)) {
      trackedIds.add(`${b.source}:${b.slug}`);
      added.push({ name: c.name, source: b.source, slug: b.slug, reason: c.reason });
    } else if (!b) {
      notFound.push(c.name);
    }
  });

  await addCompanies(added, "discovered");
  return { added, notFound };
}
