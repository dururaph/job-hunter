import { connection } from "next/server";
import { ingestAll } from "@/lib/ingest";

export const maxDuration = 300;

/** Cron endpoint (e.g. Vercel Cron). Requires `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await ingestAll(undefined, () => {});
  return Response.json(summary);
}
