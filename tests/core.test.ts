import assert from "node:assert/strict";
import { test } from "node:test";
import example from "../data/resume.example.json";
import { htmlToText } from "../src/lib/html";
import { createMatcher } from "../src/lib/match";
import { ResumeSchema } from "../src/lib/resume";
import { applyGuardrails } from "../src/lib/tailor";

const resume = ResumeSchema.parse(example);

const baseOutput = {
  matchScore: 72,
  keyRequirements: ["React", "Postgres"],
  matchedRequirements: ["React"],
  gaps: ["Kubernetes"],
  summary: "Engineer focused on React apps.",
  notes: "Lead with the dashboard work.",
  projects: [],
};

test("guardrails drop invented bullets, duplicates, and unlisted skills", () => {
  const out = applyGuardrails(
    resume,
    {
      ...baseOutput,
      skills: ["React", "kubernetes", "typescript", "React"],
      experience: [
        {
          id: "e1",
          bullets: [
            { sourceId: "e1.b2", text: "Built a Node.js sync service from Postgres to CRM" },
            { sourceId: "e1.b9", text: "Led a team of 10 engineers" }, // no such source bullet
            { sourceId: "e1.b2", text: "Duplicate rewrite" },
          ],
        },
      ],
    },
    "test-model",
  );

  assert.deepEqual(out.skills, ["React", "TypeScript"]);
  assert.equal(out.experience[0].tailored.length, 1);
  assert.equal(out.experience[0].tailored[0].sourceId, "e1.b2");
  assert.equal(out.experience[0].tailored[0].original, resume.experience[0].bullets[1]);
  assert.ok(out.warnings.some((w) => w.includes("Led a team of 10")));
  assert.ok(out.warnings.some((w) => w.includes("kubernetes")));
  // The project the model omitted is restored with its original bullets.
  assert.equal(out.projects[0].tailored.length, resume.projects[0].bullets.length);
});

test("guardrails keep company, title, and dates from the source resume", () => {
  const out = applyGuardrails(resume, { ...baseOutput, skills: [], experience: [] }, "test-model");
  const src = resume.experience[0];
  assert.equal(out.experience[0].company, src.company);
  assert.equal(out.experience[0].title, src.title);
  assert.equal(out.experience[0].start, src.start);
  assert.deepEqual(out.skills, resume.skills); // empty skills list falls back to the original
});

test("matcher scores overlap and ignores everyday words", () => {
  const match = createMatcher(resume);
  const strong = match({
    title: "Software Engineer",
    description: "We use TypeScript, React, Node.js and PostgreSQL on AWS. Kubernetes is a plus.",
  });
  assert.ok(strong.score >= 70, `expected strong match, got ${strong.score}`);
  assert.ok(strong.missing.includes("Kubernetes"));

  const prose = match({ title: "Account Executive", description: "You excel at helping customers go further, swiftly." });
  assert.deepEqual(prose.matched, []);
  assert.deepEqual(prose.missing, []);
});

test("matcher boosts titles that match target roles", () => {
  const match = createMatcher(resume);
  const description = "Experience with React and PostgreSQL.";
  const onTarget = match({ title: "Senior Backend Engineer, Payments", description });
  const offTarget = match({ title: "Data Scientist", description });
  assert.equal(onTarget.score - offTarget.score, 30);
});

test("htmlToText handles Greenhouse's entity-encoded HTML", () => {
  const text = htmlToText("&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;");
  assert.equal(text, "Hello & welcome\n\n• Go");
});
