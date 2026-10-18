"use client";

import { useActionState } from "react";
import { type UploadResumeState, uploadResumeAction } from "@/app/actions";

export function ResumeUpload() {
  const [state, formAction, pending] = useActionState<UploadResumeState, FormData>(uploadResumeAction, {});

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-accent/50 bg-surface p-5">
      <div>
        <h2 className="font-semibold">Upload resume</h2>
        <p className="text-sm text-muted">PDF, Word (.docx), or text. Max 4 MB. Uploading replaces your current resume.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="file"
          required
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <button
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "Reading your resume… (about 20s)" : "Upload & read"}
        </button>
      </div>
      {state.ok && !pending && <p className="text-sm text-good">Resume imported and every job re-scored. Check the details below.</p>}
      {state.error && !pending && <pre className="whitespace-pre-wrap text-sm text-bad">{state.error}</pre>}
    </form>
  );
}
