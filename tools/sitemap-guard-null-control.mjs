#!/usr/bin/env node
/**
 * NULL CONTROL for the sitemap guard.
 *
 * Breaks each of the four rules in turn, requires the guard to fail with the
 * matching finding, and requires it to pass again once restored. Each mutation
 * asserts it actually changed the file, so a stale anchor cannot produce a false
 * pass by grading the guard on unmodified content.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SITEMAP = "sitemap.xml";
const BLOG = "blog/index.html";

function run() {
  try {
    execFileSync("node", ["tools/sitemap-guard.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const MUTATIONS = [
  {
    name: "a sitemap URL with no page behind it",
    file: SITEMAP,
    mutate: (s) => s.replace("</urlset>", "<url><loc>https://moldandenvironmental.com/not-a-real-page/</loc></url>\n</urlset>"),
    expect: "LISTED_BUT_MISSING",
  },
  {
    name: "a listed page that defers its canonical elsewhere",
    file: BLOG,
    mutate: (s) => s.replace(
      '<link rel="canonical" href="https://moldandenvironmental.com/blog/"',
      '<link rel="canonical" href="https://moldandenvironmental.com/types-of-mold/"'),
    expect: "LISTED_BUT_CANONICAL_ELSEWHERE",
  },
  {
    name: "a listed page marked noindex",
    file: BLOG,
    mutate: (s) => s.replace("</title>", '</title>\n<meta name="robots" content="noindex, follow">'),
    expect: "LISTED_BUT_NOINDEX",
  },
  {
    name: "an indexable page dropped from the sitemap",
    file: SITEMAP,
    mutate: (s) => s.replace(/\s*<url>\s*<loc>\s*https:\/\/moldandenvironmental\.com\/blog\/\s*<\/loc>[\s\S]*?<\/url>/, ""),
    expect: "INDEXABLE_BUT_NOT_LISTED",
  },
];

const originals = new Map();
for (const f of [SITEMAP, BLOG]) originals.set(f, readFileSync(f, "utf8"));
const restore = () => { for (const [f, s] of originals) writeFileSync(f, s); };

const base = run();
if (base.code !== 0) {
  console.error("NULL CONTROL ABORTED: guard does not pass on unmodified content.\n" + base.out);
  process.exit(1);
}
console.log("baseline: sitemap guard PASSES on unmodified content\n");

let failed = false;
for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  const after = m.mutate(before);
  if (after === before) {
    console.error(`FAIL [${m.name}]: mutation was a no-op -- its anchor is gone, so the guard`);
    console.error("       would have been graded on unmodified content.");
    failed = true;
    continue;
  }
  writeFileSync(m.file, after);
  const r = run();
  restore();

  if (r.code === 0) {
    console.error(`FAIL [${m.name}]: guard PASSED on a deliberately broken sitemap.`);
    failed = true;
  } else if (!r.out.includes(m.expect)) {
    console.error(`FAIL [${m.name}]: guard failed but not with ${m.expect}.`);
    console.error(r.out.split("\n").slice(0, 6).join("\n"));
    failed = true;
  } else {
    console.log(`  OK  [${m.name}] -> ${m.expect}`);
  }
}

restore();
if (run().code !== 0) {
  console.error("FAIL: guard does not pass again after restore.");
  failed = true;
} else {
  console.log("\nrestored: sitemap guard PASSES again");
}

if (failed) {
  console.error("\nSITEMAP GUARD NULL CONTROL: FAIL");
  process.exit(1);
}
console.log(`SITEMAP GUARD NULL CONTROL: PASS -- ${MUTATIONS.length} rules broken, ${MUTATIONS.length} caught, green again once restored.`);
