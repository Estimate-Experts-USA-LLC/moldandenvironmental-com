#!/usr/bin/env node
/**
 * NULL CONTROL for the intake brand guard.
 *
 * 1. Checks the legacy list's shape in a fresh child process: distinct exact
 *    page paths, every one drawn from the approved initial set below. The list
 *    may shrink, down to empty; naming any other page fails.
 * 2. Breaks each rule in turn, including the encoded and explicit-port forms,
 *    and requires the guard to fail with the matching finding.
 * 3. Plants harmless changes that must stay green, including a legitimate
 *    shrink of the legacy list and an emptied list.
 * 4. Restores every touched file and proves the bytes are identical.
 * Each mutation asserts it actually changed its file, so a stale anchor
 * cannot grade the guard on unmodified content.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const GUARD = "tools/intake-brand-guard.mjs";
const HOME = "index.html";
const CONTACT = "contact-us-today/index.html";
/* Not on the legacy list, but named like four pages that are. If the list
   were a pattern rather than exact paths, this page would slip through. */
const LOOKALIKE = "mold-removal-vs-remediation/index.html";

/* The approved initial legacy set (OPD-A ruling C, 2026-09-25): the sixteen
   pages that carried "both are answered" on main 6bfc4c0. The guard's list
   may only be a subset of this. Adding a page here is an expansion and needs
   its own reviewed change. */
const APPROVED_INITIAL_LEGACY = [
  "about/index.html",
  "air-quality-testing/index.html",
  "faqs/index.html",
  "get-an-quote/index.html",
  "mold-inspection-and-testing/index.html",
  "mold-inspection-yachts/index.html",
  "mold-remediation-in-fort-lauderdale/index.html",
  "mold-remediation-vero-beach-fl/index.html",
  "mold-removal-and-remediation/index.html",
  "mold-removal-in-fort-pierce/index.html",
  "mold-removal-port-saint-lucie/index.html",
  "mold-removal-west-palm-beach/index.html",
  "newsletter/index.html",
  "our-credentials/index.html",
  "our-reviews/index.html",
  "terms-of-services/index.html",
];

function listProblems(list) {
  const problems = [];
  if (!Array.isArray(list)) return ["the legacy list is not an array"];
  const seen = new Set();
  for (const p of list) {
    if (typeof p !== "string" || !/^[a-z0-9-]+\/index\.html$/.test(p)) problems.push(`not an exact page path: ${p}`);
    else if (!APPROVED_INITIAL_LEGACY.includes(p)) problems.push(`outside the approved initial set: ${p}`);
    if (seen.has(p)) problems.push(`listed twice: ${p}`);
    seen.add(p);
  }
  if (list.includes(LOOKALIKE)) problems.push(`${LOOKALIKE} must never be listed`);
  return problems;
}

/* Child-process mode: import the guard fresh and check its list. */
if (process.argv[2] === "--check-list") {
  const { LEGACY_ANSWER_PROMISE_PAGES } = await import(pathToFileURL(GUARD).href + "?t=" + Date.now());
  const problems = listProblems(LEGACY_ANSWER_PROMISE_PAGES);
  if (problems.length) {
    console.error("LEGACY LIST: FAIL\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`LEGACY LIST: PASS -- ${LEGACY_ANSWER_PROMISE_PAGES.length} of ${APPROVED_INITIAL_LEGACY.length} approved pages listed`);
  process.exit(0);
}

function run(args) {
  try {
    const out = execFileSync("node", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}
const guard = () => run([GUARD]);
const checkList = () => run(["tools/intake-brand-guard-null-control.mjs", "--check-list"]);

const sha = (s) => createHash("sha256").update(s).digest("hex");
const originals = new Map();
const remember = (f) => { if (!originals.has(f)) originals.set(f, readFileSync(f, "utf8")); };
const restore = () => { for (const [f, s] of originals) writeFileSync(f, s); };

const { LEGACY_ANSWER_PROMISE_PAGES: LIST } = await import(pathToFileURL(GUARD).href);
const PROMISE = /both\s+are\s+answered/gi;

/* Legacy targets are chosen from the live list, so the control keeps working
   as the list shrinks. */
const listedWithPromise = LIST.filter((p) => { const s = readFileSync(p, "utf8"); PROMISE.lastIndex = 0; return PROMISE.test(s); });

for (const f of [GUARD, HOME, CONTACT, LOOKALIKE, ...LIST]) remember(f);

const beforeBody = (html) => (s) => s.replace("</body>", html + "\n</body>");
const dropFromList = (paths) => (s) => {
  let out = s;
  for (const p of paths) out = out.replace(`  "${p}",\n`, "");
  return out;
};

/* Each entry: one or more file edits, then the expected outcome. */
const MUTATIONS = [
  { name: "an Estimate Experts address on the home page", edits: [[HOME, beforeBody('<p><a href="https://www.estimate-experts.com/">x</a></p>')]], expect: "ESTIMATE_EXPERTS_ADDRESS" },
  { name: "an Estimate Experts address written with a character reference", edits: [[HOME, beforeBody('<p><a href="https://www.estimate&#45;experts.com/">x</a></p>')]], expect: "ESTIMATE_EXPERTS_ADDRESS" },
  { name: "the form script served from a host that is not Mold's", edits: [[HOME, (s) => s.replace("https://links.moldandenvironmental.com/js/form_embed.js", "https://link.msgsndr.com/js/form_embed.js")]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign form host with an explicit :443 port", edits: [[HOME, beforeBody('<iframe src="https://link.msgsndr.com:443/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign host hidden behind a Mold user-info prefix", edits: [[HOME, beforeBody('<iframe src="https://links.moldandenvironmental.com@link.msgsndr.com/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a protocol-relative foreign form host", edits: [[HOME, beforeBody('<iframe src="//link.msgsndr.com/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "the Mold form with :443 on a page without the disclosure", edits: [[CONTACT, beforeBody('<iframe src="https://links.moldandenvironmental.com:443/widget/form/test"></iframe>')]], expect: "FORM_WITHOUT_DISCLOSURE" },
  { name: "the form without its disclosure sentence", edits: [[HOME, (s) => s.replace("It is not permission for marketing email or text messages.", "")]], expect: "FORM_WITHOUT_DISCLOSURE" },
  { name: "the removed review label comes back", edits: [[HOME, beforeBody("<p>Verified customer review</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the review label with decimal-encoded spaces", edits: [[HOME, beforeBody("<p>Verified&#32;customer&#32;review</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the removed answer promise comes back on the contact page", edits: [[CONTACT, beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "the answer promise with hexadecimal-encoded spaces", edits: [[CONTACT, beforeBody("<p>both&#x20;are&#x20;answered</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "an unlisted page named like the listed ones gets the promise", edits: [[LOOKALIKE, beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
];
if (listedWithPromise.length) {
  const target = listedWithPromise[0];
  MUTATIONS.push({ name: `a listed page cleaned but left on the list (${target})`, edits: [[target, (s) => s.replace(PROMISE, "are listed below")]], expect: "STALE_LEGACY_ENTRY" });
}

/* List-shape mutations: the child-process check must fail. */
const LIST_MUTATIONS = [
  { name: "a pattern entry instead of an exact path", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", 'export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "mold-removal-*/index.html",\n')]] },
  { name: "an expansion to a page outside the approved set", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", 'export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "contact-us-today/index.html",\n')]] },
  { name: "the look-alike page added to the list", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", `export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "${LOOKALIKE}",\n`)]] },
];

/* Harmless changes: the guard AND the list check must both stay green. */
const cleanAll = (paths) => paths.map((p) => [p, (s) => s.replace(PROMISE, "are listed below")]);
const HARMLESS = [
  { name: "a harmless line", edits: [[HOME, beforeBody("<p>Call or email us about your property.</p>")]] },
  { name: "harmless text with encoded spaces", edits: [[HOME, beforeBody("<p>Call&#32;or&#32;email&#x20;us.</p>")]] },
  { name: "the Mold form address written with its default :443 port", edits: [[HOME, (s) => s.replace("https://links.moldandenvironmental.com/js/form_embed.js", "https://links.moldandenvironmental.com:443/js/form_embed.js")]] },
];
if (listedWithPromise.length) {
  const one = listedWithPromise[0];
  HARMLESS.push({ name: `a legitimate shrink: ${one} cleaned and taken off the list`, edits: [...cleanAll([one]), [GUARD, dropFromList([one])]] });
  HARMLESS.push({ name: `the list emptied after all ${LIST.length} listed pages are cleaned`, edits: [...cleanAll(LIST), [GUARD, dropFromList(LIST)]] });
}

function apply(edits) {
  for (const [f, fn] of edits) {
    const before = readFileSync(f, "utf8");
    const after = fn(before);
    if (after === before) return `mutation of ${f} was a no-op -- its anchor is gone`;
    writeFileSync(f, after);
  }
  return null;
}

let failed = false;
const fail = (msg) => { console.error("FAIL " + msg); failed = true; };

let r = checkList();
if (r.code !== 0) { console.error("NULL CONTROL ABORTED: the legacy list check fails on unmodified content.\n" + r.out); process.exit(1); }
console.log(r.out.trim());
r = guard();
if (r.code !== 0) { console.error("NULL CONTROL ABORTED: guard does not pass on unmodified content.\n" + r.out); process.exit(1); }
console.log("baseline: intake brand guard PASSES on unmodified content\n");

for (const m of MUTATIONS) {
  const noop = apply(m.edits);
  if (noop) { restore(); fail(`[${m.name}]: ${noop}`); continue; }
  const g = guard();
  restore();
  if (g.code === 0) fail(`[${m.name}]: guard PASSED on deliberately broken content.`);
  else if (!g.out.includes(m.expect)) fail(`[${m.name}]: guard failed but not with ${m.expect}.\n` + g.out.split("\n").slice(0, 6).join("\n"));
  else console.log(`  OK  [${m.name}] -> ${m.expect}`);
}

for (const m of LIST_MUTATIONS) {
  const noop = apply(m.edits);
  if (noop) { restore(); fail(`[${m.name}]: ${noop}`); continue; }
  const c = checkList();
  restore();
  if (c.code === 0) fail(`[${m.name}]: the list check PASSED on a bad list.`);
  else console.log(`  OK  [${m.name}] -> LEGACY LIST: FAIL`);
}

for (const m of HARMLESS) {
  const noop = apply(m.edits);
  if (noop) { restore(); fail(`[${m.name}]: ${noop}`); continue; }
  const g = guard();
  const c = checkList();
  restore();
  if (g.code !== 0) fail(`[${m.name}]: guard FAILED on a harmless change.\n` + g.out.split("\n").slice(0, 6).join("\n"));
  else if (c.code !== 0) fail(`[${m.name}]: the list check FAILED on a harmless change.\n` + c.out);
  else console.log(`  OK  [${m.name}] -> still PASS`);
}

restore();
let changed = 0;
for (const [f, s] of originals) if (sha(readFileSync(f, "utf8")) !== sha(s)) { changed++; fail(`restore: ${f} is not byte-identical`); }
if (guard().code !== 0) fail("guard does not pass again after restore.");
if (checkList().code !== 0) fail("the list check does not pass again after restore.");
if (!failed) console.log(`\nrestored: ${originals.size} files byte-identical; guard and list check PASS again`);

if (failed) {
  console.error("\nINTAKE BRAND GUARD NULL CONTROL: FAIL");
  process.exit(1);
}
console.log(`INTAKE BRAND GUARD NULL CONTROL: PASS -- ${MUTATIONS.length} rule breaks caught, ${LIST_MUTATIONS.length} bad lists refused, ${HARMLESS.length} harmless changes stayed green, restore byte-identical.`);
