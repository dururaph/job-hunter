import { htmlToText } from "../html";
import { type Fetcher, getJson, looksRemote } from "./types";

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; allLocations?: string[]; department?: string; team?: string };
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

function formatSalary(r: LeverPosting["salaryRange"]): string | null {
  if (!r?.min && !r?.max) return null;
  const fmt = (n?: number) => (n ? n.toLocaleString("en-US") : "?");
  return `${r.currency ?? ""} ${fmt(r.min)}–${fmt(r.max)}${r.interval ? ` ${r.interval}` : ""}`.trim();
}

export const fetchLever: Fetcher = async (slug, signal) => {
  const postings = await getJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    signal,
  );
  return postings.map((p) => {
    const location = p.categories?.allLocations?.join(" • ") || p.categories?.location || "";
    const lists = (p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    return {
      externalId: p.id,
      title: p.text.trim(),
      location,
      remote: p.workplaceType === "remote" || looksRemote(location, p.text),
      department: p.categories?.team ?? p.categories?.department ?? null,
      url: p.hostedUrl,
      description: [p.descriptionPlain, lists, p.additionalPlain].filter(Boolean).join("\n\n").trim(),
      salary: formatSalary(p.salaryRange),
      postedAt: p.createdAt ? new Date(p.createdAt) : null,
    };
  });
};
