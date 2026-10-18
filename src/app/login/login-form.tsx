"use client";

import { useActionState } from "react";
import { type LoginState, loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-line bg-surface p-5">
      <input type="hidden" name="next" value={next} />
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        placeholder="Password"
        className="w-full rounded-md border border-line bg-background px-3 py-2 text-sm"
      />
      <button
        disabled={pending}
        className="w-full rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
    </form>
  );
}
