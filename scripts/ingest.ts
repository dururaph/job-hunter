import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  // Imported after dotenv so the DB client sees DATABASE_URL.
  const { ingestAll } = await import("../src/lib/ingest");
  const summary = await ingestAll();
  console.log(
    `\nDone in ${(summary.durationMs / 1000).toFixed(1)}s — ${summary.jobsSeen} jobs from ${summary.companies} companies, ${summary.jobsNew} new, ${summary.errors.length} errors.`,
  );
  // Fail the CI run only if every board failed; a single company changing ATS shouldn't.
  if (summary.errors.length === summary.companies) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
