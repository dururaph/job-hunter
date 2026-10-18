"use client";

import { useTransition } from "react";
import { setJobStatus } from "@/app/actions";
import { JOB_STATUSES, type JobStatus } from "@/lib/statuses";

export function StatusSelect({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Application status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as JobStatus;
        startTransition(() => setJobStatus(jobId, next));
      }}
      className="rounded-md border border-line bg-surface px-2 py-1 text-xs capitalize disabled:opacity-50"
    >
      {JOB_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
