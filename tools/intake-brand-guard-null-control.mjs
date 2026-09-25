#!/usr/bin/env node
/**
 * NULL CONTROL for the intake brand guard.
 *
 * Breaks each rule in turn, requires the guard to fail with the matching
 * finding, and requires it to pass again once restored. It also plants one
 * harmless line that must NOT trip the guard, so a guard that fails on
 * everything cannot pass this control. Each mutation asserts it actually
 * changed the file, so a stale anchor cannot grade the guard on unmodified
 * content.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LEGACY_ANSWER_PROMISE_PAGES } from "./intake-brand-guard.mjs";

const HOME = "index.html";
const CONTACT = "contact-us-today/index.html";
const LEGACY = "about/index.html";
/* Not on the legacy list, but named like four pages that are. If the list
   were a pattern rather than exact paths, this page would slip through. */
const LOOKALIKE = "mold-removal-vs-remediation/index.html";

/* The legacy list is exactly the sixteen page files, by path, no patterns. */
{
  const bad = LEGACY_ANSWER_PROMISE_PAGES.filter((p) => !/^[a-z0-9-]+\/index\.html$/.test(p));
  if (LEGACY_ANSWER_PROMISE_PAGES.length !== 16 || bad.length || new Set(LEGACY_ANSWER_PROMISE_PAGES).size !== 16) {
    console.error(`NULL CONTROL ABORTED: the legacy list must be exactly 16 distinct page paths; got ${LEGACY_ANSWER_PROMISE_PAGES.length}` +
      (bad.length ? `, not exact paths: ${bad.join(", ")}` : ""));
    process.exit(1);
  }
  if (LEGACY_ANSWER_PROMISE_PAGES.includes(LOOKALIKE)) {
    console.error(`NULL CONTROL ABORTED: ${LOOKALIKE} must not be on the legacy list.`);
    process.exit(1);
  }
  console.log("legacy list: exactly 16 distinct page paths, no patterns");
}

function run() {
  try {
    execFileSync("node", ["tools/intake-brand-guard.mjs"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const beforeBody = (html) => (s) => s.replace("</body>", html + "\n</body>");

const MUTATIONS = [
  {
    name: "an Estimate Experts address on the home page",
    file: HOME,
    mutate: beforeBody('<p><a href="https://www.estimate-experts.com/">estimate</a></p>'),
    expect: "ESTIMATE_EXPERTS_ADDRESS",
  },
  {
    name: "the form script served from a host that is not Mold's",
    file: HOME,
    mutate: (s) => s.replace(
      "https://links.moldandenvironmental.com/js/form_embed.js",
      "https://link.msgsndr.com/js/form_embed.js"),
    expect: "FOREIGN_FORM_HOST",
  },
  {
    name: "the removed review label comes back",
    file: HOME,
    mutate: beforeBody("<p>Verified customer review</p>"),
    expect: "UNSUPPORTED_REVIEW_LABEL",
  },
  {
    name: "the removed answer promise comes back on the contact page",
    file: CONTACT,
    mutate: beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>"),
    expect: "UNSUPPORTED_ANSWER_PROMISE",
  },
  {
    name: "the form without its disclosure sentence",
    file: HOME,
    mutate: (s) => s.replace("It is not permission for marketing email or text messages.", ""),
    expect: "FORM_WITHOUT_DISCLOSURE",
  },
  {
    name: "a legacy page cleaned but left on the list",
    file: LEGACY,
    mutate: (s) => s.replace(/,?\s*and both are answered/i, ""),
    expect: "STALE_LEGACY_ENTRY",
  },
  {
    name: "an unlisted page named like the listed ones gets the promise",
    file: LOOKALIKE,
    mutate: beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>"),
    expect: "UNSUPPORTED_ANSWER_PROMISE",
  },
];

/* A harmless line: the guard must still PASS with it in place. */
const HARMLESS = {
  name: "a harmless line (must stay green)",
  file: HOME,
  mutate: beforeBody("<p>Call or email us about your property.</p>"),
};

const originals = new Map();
for (const f of [HOME, CONTACT, LEGACY, LOOKALIKE]) originals.set(f, readFileSync(f, "utf8"));
const restore = () => { for (const [f, s] of originals) writeFileSync(f, s); };

const base = run();
if (base.code !== 0) {
  console.error("NULL CONTROL ABORTED: guard does not pass on unmodified content.\n" + base.out);
  process.exit(1);
}
console.log("baseline: intake brand guard PASSES on unmodified content\n");

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
    console.error(`FAIL [${m.name}]: guard PASSED on deliberately broken content.`);
    failed = true;
  } else if (!r.out.includes(m.expect)) {
    console.error(`FAIL [${m.name}]: guard failed but not with ${m.expect}.`);
    console.error(r.out.split("\n").slice(0, 6).join("\n"));
    failed = true;
  } else {
    console.log(`  OK  [${m.name}] -> ${m.expect}`);
  }
}

{
  const before = readFileSync(HARMLESS.file, "utf8");
  const after = HARMLESS.mutate(before);
  if (after === before) {
    console.error(`FAIL [${HARMLESS.name}]: mutation was a no-op.`);
    failed = true;
  } else {
    writeFileSync(HARMLESS.file, after);
    const r = run();
    restore();
    if (r.code !== 0) {
      console.error(`FAIL [${HARMLESS.name}]: guard FAILED on a harmless line.\n` + r.out.split("\n").slice(0, 6).join("\n"));
      failed = true;
    } else {
      console.log(`  OK  [${HARMLESS.name}] -> still PASS`);
    }
  }
}

restore();
if (run().code !== 0) {
  console.error("FAIL: guard does not pass again after restore.");
  failed = true;
} else {
  console.log("\nrestored: intake brand guard PASSES again");
}

if (failed) {
  console.error("\nINTAKE BRAND GUARD NULL CONTROL: FAIL");
  process.exit(1);
}
console.log(`INTAKE BRAND GUARD NULL CONTROL: PASS -- ${MUTATIONS.length} rules broken, ${MUTATIONS.length} caught, 1 harmless line passed, green again once restored.`);
