import { htmlToText } from "../html";
import { type Fetcher, getJson, looksRemote } from "./types";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  departments?: { name: string }[];
  first_published?: string;
  updated_at?: string;
}

export const fetchGreenhouse: Fetcher = async (slug, signal) => {
  const data = await getJson<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    signal,
  );
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    const published = j.first_published ?? j.updated_at;
    return {
      externalId: String(j.id),
      title: j.title.trim(),
      location,
      remote: looksRemote(location, j.title),
      department: j.departments?.[0]?.name ?? null,
      url: j.absolute_url,
      description: htmlToText(j.content ?? ""),
      salary: null,
      postedAt: published ? new Date(published) : null,
    };
  });
};
