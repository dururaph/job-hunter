"use client";

import { useActionState, useState, useTransition } from "react";
import {
  type AddCompanyState,
  addCompanyAction,
  type DiscoverState,
  discoverCompaniesAction,
  removeCompanyAction,
} from "@/app/actions";
import type { Source } from "@/lib/sources/types";

export function DiscoverButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<DiscoverState | null>(null);

  return (
    <div className="space-y-3 rounded-lg border border-accent/40 bg-surface p-5">
      <div>
        <h2 className="font-semibold">Find companies for me</h2>
        <p className="text-sm text-muted">
          Claude reads your resume and suggests about 40 companies that hire for your roles. Only ones with a live
          Greenhouse, Lever, or Ashby board get added.
        </p>
      </div>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null);
            setResult(await discoverCompaniesAction());
          })
        }
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Finding & checking companies… (1–2 min)" : "Find companies from my resume"}
      </button>
      {result?.error && <p className="text-sm text-bad">{result.error}</p>}
      {result?.added && (
        <div className="space-y-1 text-sm">
          <p className="text-good">
            Added {result.added.length} companies with {result.jobsNew ?? 0} new jobs.
          </p>
          {result.added.length > 0 && <p className="text-muted">{result.added.map((c) => c.name).join(", ")}</p>}
          {result.notFound && result.notFound.length > 0 && (
            <p className="text-xs text-muted">
              Skipped (no Greenhouse/Lever/Ashby board found): {result.notFound.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AddCompany() {
  const [state, formAction, pending] = useActionState<AddCompanyState, FormData>(addCompanyAction, {});
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <div>
        <h2 className="font-semibold">Add a company</h2>
        <p className="text-sm text-muted">
          Type a name, or paste a careers link like <code className="text-xs">jobs.lever.co/acme</code>.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          name="company"
          placeholder="e.g. Plaid or boards.greenhouse.io/plaid"
          className="min-w-0 flex-1 rounded-md border border-line bg-background px-3 py-2 text-sm"
        />
        <button
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Checking…" : "Add"}
        </button>
      </div>
      {state.message && !pending && <p className="text-sm text-good">{state.message}</p>}
      {state.error && !pending && <p className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}

export function RemoveCompany({ source, slug, name }: { source: Source; slug: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(`Stop tracking ${name}? Its jobs will be removed from your feed.`)) {
          startTransition(() => removeCompanyAction(source, slug));
        }
      }}
      className="text-xs text-muted hover:text-bad disabled:opacity-50"
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
