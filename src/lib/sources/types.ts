export type Source = "greenhouse" | "lever" | "ashby";

export interface Company {
  name: string;
  slug: string;
  source: Source;
}

/** A posting normalized from any job board into one shape. */
export interface NormalizedJob {
  externalId: string;
  title: string;
  location: string;
  remote: boolean;
  department: string | null;
  url: string;
  description: string;
  salary: string | null;
  postedAt: Date | null;
}

export type Fetcher = (slug: string, signal?: AbortSignal) => Promise<NormalizedJob[]>;

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const looksRemote = (...fields: (string | null | undefined)[]) =>
  fields.some((f) => !!f && /\bremote\b/i.test(f));
