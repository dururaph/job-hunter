import { type Fetcher, getJson, looksRemote } from "./types";

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  location?: string;
  secondaryLocations?: { location: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  department?: string;
  team?: string;
  isListed?: boolean;
  publishedAt?: string;
  descriptionPlain?: string;
  compensation?: { compensationTierSummary?: string | null };
}

export const fetchAshby: Fetcher = async (slug, signal) => {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
    signal,
  );
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]
        .filter(Boolean)
        .join(" • ");
      return {
        externalId: j.id,
        title: j.title.trim(),
        location,
        remote: j.workplaceType === "Remote" || looksRemote(location, j.title),
        department: j.department ?? j.team ?? null,
        url: j.jobUrl,
        description: (j.descriptionPlain ?? "").trim(),
        salary: j.compensation?.compensationTierSummary ?? null,
        postedAt: j.publishedAt ? new Date(j.publishedAt) : null,
      };
    });
};
