"use client";

import { useState, useTransition } from "react";
import { refreshJobs } from "./actions";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex items-center gap-3 text-sm">
      {message && <span className="text-muted">{message}</span>}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage("");
            const r = await refreshJobs();
            setMessage(`${r.jobsNew} new of ${r.jobsSeen.toLocaleString()}${r.errors.length ? ` · ${r.errors.length} boards failed` : ""}`);
          })
        }
        className="rounded-md border border-line bg-surface px-3 py-2 font-medium hover:bg-background disabled:opacity-50"
      >
        {pending ? "Fetching live jobs…" : "Refresh now"}
      </button>
    </div>
  );
}
