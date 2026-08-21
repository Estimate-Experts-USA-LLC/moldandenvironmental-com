#!/usr/bin/env node
/**
 * NULL CONTROL for the layout guard.
 *
 * A guard that has only ever been seen passing is not evidence. This
 * reintroduces each of the four defects the guard was written from, one at a
 * time, and requires the guard to FAIL on each -- naming the expected finding,
 * so a guard that fails for some unrelated reason does not count as a catch.
 * Then it restores the file and requires a PASS again.
 *
 * It also verifies each mutation actually changed the file on disk. A previous
 * mutation test on this repo "passed" because its anchor no longer existed, so
 * nothing was ever mutated and the guard was graded on unmodified content.
 *
 * Run: node tools/layout-guard-null-control.mjs <baseUrl>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.argv[2] || "http://127.0.0.1:8791";
const HOME = "assets/css/me-home.css";
const CHROME = "assets/css/me-chrome.css";

const MUTATIONS = [
  {
    name: "light panel inherits the dark section's white text",
    file: HOME,
    find: ".me-section--dark .me-panel h2,\n.me-section--dark .me-panel h3,\n.me-section--dark .me-panel h4{color:var(--ink)}",
    replace: ".me-section--dark .me-panel h2,\n.me-section--dark .me-panel h3,\n.me-section--dark .me-panel h4{color:#fff}",
    expect: "CONTRAST",
  },
  {
    name: "muted grey body text on the dark background",
    file: HOME,
    find: ".me-section--dark .me-step p,\n.me-section--dark .me-reason p,\n.me-section--dark .me-faq details p{color:var(--on-dark-2)}",
    replace: ".me-section--dark .me-step p,\n.me-section--dark .me-reason p,\n.me-section--dark .me-faq details p{color:var(--text-2)}",
    expect: "CONTRAST",
  },
  {
    name: "unbreakable email token forces a horizontal scrollbar",
    file: HOME,
    find: ".me-split > *,.me-grid > *{min-width:0}\n.me-panel dd,.me-panel dd a,.me-footer a{overflow-wrap:anywhere}",
    replace: ".me-split > *,.me-grid > *{min-width:auto}",
    expect: "H_OVERFLOW",
  },
  {
    name: "hero padding shorthand wipes the container inset",
    file: HOME,
    find: ".me-hero__inner{position:relative;z-index:2;padding-block:clamp(64px,9vw,116px) clamp(56px,7vw,92px)}",
    replace: ".me-hero__inner{position:relative;z-index:2;padding:clamp(64px,9vw,116px) 0 clamp(56px,7vw,92px)}",
    expect: "RAIL_SPREAD",
  },
  {
    name: "narrow prose column centres itself off the shared rail",
    file: HOME,
    find: ":where(.me-container--prose) > :where(*){max-width:880px}",
    replace: ".me-container--prose{max-width:880px;margin-left:0;margin-right:auto}",
    expect: "RAIL_SPREAD",
  },
  {
    name: "text links drop below a thumb-sized tap target",
    file: HOME,
    find: ".me-textlink{display:inline-flex;align-items:center;min-height:44px}",
    replace: ".me-textlink{display:inline-flex;align-items:center;min-height:0}",
    expect: "TAP_TARGET",
  },
];

function runGuard() {
  try {
    const out = execFileSync("node", ["tools/layout-guard.mjs", BASE], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

const originals = new Map();
for (const f of [HOME, CHROME]) originals.set(f, readFileSync(f, "utf8"));
const restore = () => { for (const [f, s] of originals) writeFileSync(f, s); };

let failed = false;

// Baseline: the guard must PASS before any of this means anything.
const base = runGuard();
if (base.code !== 0) {
  console.error("NULL CONTROL ABORTED: the guard does not pass on unmodified content.\n" + base.out);
  process.exit(1);
}
console.log("baseline: guard PASSES on unmodified content\n");

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.find)) {
    console.error(`FAIL [${m.name}]: anchor not found in ${m.file}.`);
    console.error("       The rule it targets was renamed or removed, so this mutation would");
    console.error("       have graded the guard on UNMODIFIED content and reported a false pass.");
    failed = true;
    continue;
  }
  const after = before.replace(m.find, m.replace);
  if (after === before) {
    console.error(`FAIL [${m.name}]: replacement was a no-op.`);
    failed = true;
    continue;
  }
  writeFileSync(m.file, after);

  const r = runGuard();
  restore();

  if (r.code === 0) {
    console.error(`FAIL [${m.name}]: guard PASSED on deliberately broken CSS.`);
    failed = true;
  } else if (!r.out.includes(m.expect)) {
    console.error(`FAIL [${m.name}]: guard failed, but not with ${m.expect} -- it may have`);
    console.error(`       tripped on something unrelated, which is not a catch.`);
    console.error(r.out.split("\n").slice(0, 8).join("\n"));
    failed = true;
  } else {
    console.log(`  OK  [${m.name}] -> guard went red with ${m.expect}`);
  }
}

restore();
const final = runGuard();
if (final.code !== 0) {
  console.error("FAIL: guard does not pass again after restoring the originals.\n" + final.out);
  failed = true;
} else {
  console.log("\nrestored: guard PASSES again");
}

if (failed) {
  console.error("\nLAYOUT GUARD NULL CONTROL: FAIL");
  process.exit(1);
}
console.log(`LAYOUT GUARD NULL CONTROL: PASS -- ${MUTATIONS.length} defects reintroduced, guard caught all ${MUTATIONS.length}, and passes again once restored.`);
