// Single-user password gate. Uses Web Crypto so it runs in both the proxy and server code.

export const SESSION_COOKIE = "jh_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Auth is on only when APP_PASSWORD is set, so local development needs no login. */
export const authEnabled = () => !!process.env.APP_PASSWORD;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value for a logged-in session. Changing APP_PASSWORD logs everyone out. */
export const sessionToken = () => sha256Hex(`job-hunter-session:${process.env.APP_PASSWORD ?? ""}`);

/** Compares in constant time so response timing doesn't leak how much of a guess matched. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (!authEnabled()) return true;
  return !!cookieValue && safeEqual(cookieValue, await sessionToken());
}
