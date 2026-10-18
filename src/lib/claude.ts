import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

// Created on first use so the rest of the app runs without credentials.
let client: Anthropic | undefined;
export const claude = () => (client ??= new Anthropic());

/** Throws a readable error for responses that didn't finish normally. */
export function assertCompleted(response: { stop_reason: string | null }) {
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("The response was cut off; try again.");
}

/** Turns an Anthropic SDK error into a message worth showing in the UI. */
export function describeError(err: unknown): string {
  const keyHelp = "Add your ANTHROPIC_API_KEY to .env.local and restart the server (see README → API key).";
  if (err instanceof Anthropic.AuthenticationError) return `Your Anthropic API key was rejected. ${keyHelp}`;
  // Thrown by the client itself, before any request, when no key is configured at all.
  if (err instanceof Error && /could not resolve authentication method/i.test(err.message)) {
    return `No Anthropic API key found. ${keyHelp}`;
  }
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (err instanceof Anthropic.APIError) {
    if (err.status === 400 && /credit balance/i.test(err.message)) {
      return "Your Anthropic account is out of credits. Add credits at console.anthropic.com → Billing.";
    }
    return `Anthropic API error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
