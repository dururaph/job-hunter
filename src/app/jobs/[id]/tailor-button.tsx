"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { tailorJob } from "@/app/actions";

export function TailorButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="space-y-2">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await tailorJob(jobId);
            if (result.tailoredId) router.push(`/tailored/${result.tailoredId}`);
            else setError(result.error ?? "Something went wrong.");
          })
        }
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Tailoring… (about 30s)" : "Tailor my resume"}
      </button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}
