"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authEnabled, SESSION_COOKIE, SESSION_MAX_AGE, safeEqual, sessionToken } from "@/lib/auth";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const next = String(formData.get("next") ?? "/");
  // Only allow same-site redirects after login.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!authEnabled()) redirect(target);

  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, process.env.APP_PASSWORD!)) {
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing
    return { error: "Wrong password." };
  }

  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect(target);
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
