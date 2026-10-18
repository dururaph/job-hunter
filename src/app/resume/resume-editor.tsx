"use client";

import { useActionState } from "react";
import { type SaveResumeState, saveResumeAction } from "@/app/actions";

export function ResumeEditor({ initial }: { initial: string }) {
  const [state, formAction, pending] = useActionState<SaveResumeState, FormData>(saveResumeAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <textarea
        name="resume"
        defaultValue={initial}
        spellCheck={false}
        className="h-[65vh] w-full rounded-lg border border-line bg-surface p-4 font-mono text-xs leading-relaxed"
      />
      <div className="flex items-start gap-4">
        <button
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving & re-scoring…" : "Save resume"}
        </button>
        {state.ok && <p className="py-2 text-sm text-good">Saved. Match scores updated.</p>}
        {state.error && <pre className="whitespace-pre-wrap py-2 text-sm text-bad">{state.error}</pre>}
      </div>
    </form>
  );
}
