import { type Resume, resumeCorpus } from "./resume";

/**
 * Skills vocabulary used to pull requirements out of job descriptions. Each entry is a
 * canonical name plus aliases. Your resume's own skills are added on top at runtime.
 */
const VOCAB: [string, ...string[]][] = [
  ["JavaScript", "javascript", "es6"], ["TypeScript", "typescript"], ["Python"], ["Java"],
  ["Go", "Golang", "golang"], ["Rust"], ["C++", "cpp"], ["C#", "c#", ".net", "dotnet"], ["Ruby"], ["Kotlin"], ["Swift"],
  ["Scala"], ["PHP"], ["SQL"], ["Bash", "shell scripting"],
  ["React", "react.js", "reactjs"], ["Next.js", "nextjs"], ["Vue", "vue.js"], ["Angular"], ["Svelte"],
  ["Node.js", "node.js", "nodejs", "node"], ["Express"], ["Django"], ["Flask"], ["FastAPI"], ["Spring", "spring boot"],
  ["Rails", "ruby on rails"], ["GraphQL"], ["REST", "rest api", "restful"], ["gRPC"], ["HTML"], ["CSS"], ["Tailwind"],
  ["PostgreSQL", "postgres", "postgresql"], ["MySQL"], ["MongoDB"], ["Redis"], ["Elasticsearch"], ["DynamoDB"],
  ["Cassandra"], ["Kafka"], ["RabbitMQ"], ["Snowflake"], ["BigQuery"], ["Spark", "apache spark", "pyspark"],
  ["Airflow"], ["dbt"], ["Hadoop"], ["ETL"], ["Data pipelines", "data pipeline", "data pipelines"],
  ["AWS", "amazon web services"], ["GCP", "google cloud"], ["Azure"], ["Docker"], ["Kubernetes", "k8s"],
  ["Terraform"], ["CI/CD", "ci/cd", "continuous integration"], ["Linux"], ["Git"], ["Microservices", "microservice"],
  ["Distributed systems", "distributed systems"], ["System design"], ["Observability"], ["Prometheus"], ["Grafana"],
  ["Machine learning", "machine learning", "ML"], ["Deep learning", "deep learning"], ["PyTorch"], ["TensorFlow"],
  ["LLM", "llm", "llms", "large language models"], ["NLP", "natural language processing"], ["Computer vision"],
  ["RAG", "retrieval-augmented generation"], ["Pandas"], ["NumPy"], ["scikit-learn", "sklearn"],
  ["Statistics", "statistical"], ["A/B testing", "a/b testing", "experimentation"], ["Tableau"], ["Looker"],
  ["Power BI"], ["Excel"], ["Data analysis", "data analysis", "analytics"], ["Data visualization", "data visualization"],
  ["iOS"], ["Android"], ["React Native"], ["Flutter"], ["Figma"], ["Security", "security"], ["Networking"],
  ["Agile", "scrum"], ["Product management", "product management"], ["Project management", "project management"],
  ["Stakeholder management", "stakeholders"], ["Leadership", "mentoring", "mentorship"], ["Communication"],
  ["Testing", "unit testing", "test automation", "testing"], ["Jest"], ["Cypress"], ["Playwright"], ["Selenium"],
];


const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Skill names that are also everyday words ("go", "excel", "swift") only count when capitalized.
const CASE_SENSITIVE = new Set(["Go", "R", "C", "Excel", "Swift", "Rust", "Spring", "Express", "Spark", "Looker", "Git"]);
const isCaseSensitive = (alias: string) => CASE_SENSITIVE.has(alias) || alias.length <= 2;

/**
 * Compiles the vocabulary into two regexes (case-sensitive and not) so each document is
 * scanned once instead of once per skill. Returns a function listing the skills found.
 */
function buildScanner(resume: Resume) {
  const names: string[] = [];
  const byAlias = new Map<string, number>(); // alias (lowercased if case-insensitive) -> index in names
  const add = (name: string, aliases: string[]) => {
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    const idx = names.push(name) - 1;
    for (const a of aliases) {
      const key = isCaseSensitive(a) ? a : a.toLowerCase();
      if (!byAlias.has(key)) byAlias.set(key, idx);
    }
  };
  for (const [name, ...aliases] of VOCAB) add(name, [name, ...aliases]);
  for (const skill of resume.skills) add(skill, [skill]);

  // Longest aliases first so "React Native" wins over "React". Lookarounds act as word
  // boundaries that also work for terms like "C++", ".NET" or "CI/CD".
  const compile = (aliases: string[], flags: string) =>
    aliases.length
      ? new RegExp(`(?<![\\w+#.])(${aliases.sort((a, b) => b.length - a.length).map(escape).join("|")})(?![\\w+#])`, flags)
      : null;
  const all = [...byAlias.keys()];
  const sensitive = compile(all.filter(isCaseSensitive), "g");
  const insensitive = compile(all.filter((a) => !isCaseSensitive(a)), "gi");

  return (text: string): string[] => {
    const found = new Set<number>();
    for (const m of sensitive ? text.matchAll(sensitive) : []) found.add(byAlias.get(m[1])!);
    for (const m of insensitive ? text.matchAll(insensitive) : []) found.add(byAlias.get(m[1].toLowerCase())!);
    return [...found].sort((a, b) => a - b).map((i) => names[i]);
  };
}

export interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
}

/** Builds a fast, free (no LLM) scorer for a resume. Reuse it across many jobs. */
export function createMatcher(resume: Resume) {
  const scan = buildScanner(resume);
  const has = new Set(scan(resumeCorpus(resume)));
  const roleWords = resume.targetRoles.map((r) => r.toLowerCase().split(/\W+/).filter((w) => w.length > 2));

  return (job: { title: string; description: string }): MatchResult => {
    const required = scan(`${job.title}\n${job.description}`);
    const matched = required.filter((n) => has.has(n));
    const missing = required.filter((n) => !has.has(n));

    const title = job.title.toLowerCase();
    const titleMatch = roleWords.some((words) => words.length > 0 && words.every((w) => title.includes(w)));
    const coverage = required.length ? matched.length / Math.max(required.length, 4) : 0;
    const score = Math.round(Math.min(1, coverage) * 70 + (titleMatch ? 30 : 0));
    return { score, matched, missing };
  };
}
