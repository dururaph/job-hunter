import { count, eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { db, jobs } from "@/db";
import { getCompanies } from "@/lib/companies";
import { AddCompany, DiscoverButton, RemoveCompany } from "./company-controls";

// Discovery calls Claude and then checks dozens of job boards.
export const maxDuration = 300;

export default function CompaniesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
        <p className="text-sm text-muted">
          Jobs are pulled from these companies&apos; boards every hour. Let Claude find companies that fit your resume, or add
          your own.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <DiscoverButton />
        <AddCompany />
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CompanyList />
      </Suspense>
    </div>
  );
}

async function CompanyList() {
  await connection();
  const [list, counts] = await Promise.all([
    getCompanies(),
    db
      .select({ source: jobs.source, slug: jobs.companySlug, n: count() })
      .from(jobs)
      .where(eq(jobs.active, true))
      .groupBy(jobs.source, jobs.companySlug),
  ]);
  const jobCount = new Map(counts.map((c) => [`${c.source}:${c.slug}`, c.n]));

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Tracking {list.length} companies</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {list.map((c) => (
          <li key={`${c.source}:${c.slug}`} className="flex items-center gap-4 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <a href={`/?q=${encodeURIComponent(c.name)}`} className="font-medium hover:text-accent">
                {c.name}
              </a>
              <span className="ml-2 text-xs text-muted">
                {c.source} · {jobCount.get(`${c.source}:${c.slug}`) ?? 0} open jobs
                {c.origin === "discovered" && " · suggested for you"}
              </span>
              {c.reason && <p className="truncate text-xs text-muted">{c.reason}</p>}
            </div>
            <RemoveCompany source={c.source} slug={c.slug} name={c.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
