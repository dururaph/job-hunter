"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db, JOB_STATUSES, type JobStatus, jobs, tailoredResumes } from "@/db";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { describeError } from "@/lib/claude";
import { addCompanies, findBoard, getCompanies, removeCompany } from "@/lib/companies";
import { discoverCompanies } from "@/lib/discover";
import { ingestAll } from "@/lib/ingest";
import { parseResumeFile } from "@/lib/parse-resume";
import { getResume, saveResume } from "@/lib/profile";
import type { Source } from "@/lib/sources/types";
import { tailorResume } from "@/lib/tailor";

// The proxy already gates pages; this also protects actions called directly.
async function requireAuth() {
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) throw new Error("Not signed in.");
}

export async function setJobStatus(jobId: string, status: JobStatus) {
  await requireAuth();
  if (!JOB_STATUSES.includes(status)) throw new Error(`Unknown status ${status}`);
  await db.update(jobs).set({ status }).where(eq(jobs.id, jobId));
  revalidatePath("/", "layout");
}

export async function refreshJobs() {
  await requireAuth();
  const summary = await ingestAll(undefined, () => {});
  revalidatePath("/", "layout");
  return { jobsSeen: summary.jobsSeen, jobsNew: summary.jobsNew, errors: summary.errors };
}

export type TailorState = { error?: string; tailoredId?: number };

export async function tailorJob(jobId: string): Promise<TailorState> {
  await requireAuth();
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) return { error: "Job not found." };
  try {
    const result = await tailorResume(await getResume(), job);
    const [row] = await db
      .insert(tailoredResumes)
      .values({ jobId, createdAt: new Date(), result })
      .returning({ id: tailoredResumes.id });
    revalidatePath(`/jobs/${encodeURIComponent(jobId)}`);
    return { tailoredId: row.id };
  } catch (err) {
    console.error("Tailoring failed", err);
    return { error: describeError(err) };
  }
}

export type SaveResumeState = { ok?: boolean; error?: string };

const zodMessage = (err: z.ZodError) =>
  err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");

export async function saveResumeAction(_prev: SaveResumeState, formData: FormData): Promise<SaveResumeState> {
  await requireAuth();
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("resume") ?? ""));
  } catch (err) {
    return { error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    await saveResume(parsed);
  } catch (err) {
    if (err instanceof z.ZodError) return { error: zodMessage(err) };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type UploadResumeState = { ok?: boolean; error?: string };

export async function uploadResumeAction(_prev: UploadResumeState, formData: FormData): Promise<UploadResumeState> {
  await requireAuth();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a resume file first." };
  try {
    await saveResume(await parseResumeFile(file));
  } catch (err) {
    console.error("Resume upload failed", err);
    return { error: err instanceof z.ZodError ? zodMessage(err) : describeError(err) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type DiscoverState = {
  error?: string;
  added?: { name: string; source: Source; reason: string }[];
  notFound?: string[];
  jobsNew?: number;
};

export async function discoverCompaniesAction(): Promise<DiscoverState> {
  await requireAuth();
  try {
    const { added, notFound } = await discoverCompanies(await getResume());
    // Pull the new companies' jobs right away so they show up in the feed.
    const summary = added.length ? await ingestAll(added, () => {}) : { jobsNew: 0 };
    revalidatePath("/", "layout");
    return { added, notFound, jobsNew: summary.jobsNew };
  } catch (err) {
    console.error("Discovery failed", err);
    return { error: describeError(err) };
  }
}

export type AddCompanyState = { error?: string; message?: string };

export async function addCompanyAction(_prev: AddCompanyState, formData: FormData): Promise<AddCompanyState> {
  await requireAuth();
  const input = String(formData.get("company") ?? "").trim();
  if (!input) return { error: "Enter a company name or careers-page URL." };
  // Accept a careers URL (boards.greenhouse.io/x, jobs.lever.co/x, jobs.ashbyhq.com/x) or a plain name.
  const fromUrl = input.match(/(?:greenhouse\.io|lever\.co|ashbyhq\.com)\/(?:embed\/job_board\?for=)?([\w.-]+)/i)?.[1];
  const guesses = fromUrl ? [fromUrl] : [input.replace(/[^a-z0-9]/gi, ""), input.replace(/\s+/g, "-"), input.replace(/\s+/g, "")];
  const board = await findBoard(guesses);
  if (!board) {
    return { error: `Couldn't find a Greenhouse, Lever, or Ashby board with open jobs for "${input}". Try pasting their careers-page URL.` };
  }
  const tracked = await getCompanies();
  if (tracked.some((c) => c.source === board.source && c.slug === board.slug)) {
    return { error: `Already tracking ${board.slug}.` };
  }
  const name = fromUrl ? board.slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : input;
  const company = { name, ...board };
  await addCompanies([company], "manual");
  const summary = await ingestAll([company], () => {});
  revalidatePath("/", "layout");
  return { message: `Added ${name} (${board.source}) with ${summary.jobsSeen} open jobs.` };
}

export async function removeCompanyAction(source: Source, slug: string) {
  await requireAuth();
  await removeCompany(source, slug);
  revalidatePath("/", "layout");
}
