import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { authEnabled } from "@/lib/auth";
import { logoutAction } from "./login/actions";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Hunter",
  description: "Live jobs from Greenhouse, Lever, and Ashby, with AI resume tailoring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="no-print border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              Job Hunter
            </Link>
            <Link href="/" className="text-muted hover:text-foreground">
              Jobs
            </Link>
            <Link href="/?status=saved,applied,interviewing" className="text-muted hover:text-foreground">
              Tracker
            </Link>
            <Link href="/companies" className="text-muted hover:text-foreground">
              Companies
            </Link>
            <Link href="/resume" className="text-muted hover:text-foreground">
              Resume
            </Link>
            {authEnabled() && (
              <form action={logoutAction} className="ml-auto">
                <button className="text-muted hover:text-foreground">Sign out</button>
              </form>
            )}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
