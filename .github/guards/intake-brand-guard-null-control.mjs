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
import { mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const GUARD = ".github/guards/intake-brand-guard.mjs";
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

/* The approved set for the "both answered" wording, as read on the release on
   2026-11-07. The same terms apply: the guard's list may only be a subset. */
const APPROVED_BOTH_ANSWERED = ["get-an-quote/index.html"];

function listProblems(list, approved = APPROVED_INITIAL_LEGACY) {
  const problems = [];
  if (!Array.isArray(list)) return ["the legacy list is not an array"];
  const seen = new Set();
  for (const p of list) {
    if (typeof p !== "string" || !/^[a-z0-9-]+\/index\.html$/.test(p)) problems.push(`not an exact page path: ${p}`);
    else if (!approved.includes(p)) problems.push(`outside the approved initial set: ${p}`);
    if (seen.has(p)) problems.push(`listed twice: ${p}`);
    seen.add(p);
  }
  if (list.includes(LOOKALIKE)) problems.push(`${LOOKALIKE} must never be listed`);
  return problems;
}

/* Child-process mode: import the guard fresh and check its list. */
if (process.argv[2] === "--check-list") {
  const { LEGACY_ANSWER_PROMISE_PAGES, LEGACY_BOTH_ANSWERED_PAGES } = await import(pathToFileURL(GUARD).href + "?t=" + Date.now());
  const problems = [...listProblems(LEGACY_ANSWER_PROMISE_PAGES), ...listProblems(LEGACY_BOTH_ANSWERED_PAGES, APPROVED_BOTH_ANSWERED)];
  if (problems.length) {
    console.error("LEGACY LIST: FAIL\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log(`LEGACY LIST: PASS -- ${LEGACY_ANSWER_PROMISE_PAGES.length} of ${APPROVED_INITIAL_LEGACY.length} and ${LEGACY_BOTH_ANSWERED_PAGES.length} of ${APPROVED_BOTH_ANSWERED.length} approved pages listed`);
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
const checkList = () => run([".github/guards/intake-brand-guard-null-control.mjs", "--check-list"]);

const sha = (s) => createHash("sha256").update(s).digest("hex");
const originals = new Map();
const remember = (f) => { if (!originals.has(f)) originals.set(f, readFileSync(f, "utf8")); };
const restore = () => { for (const [f, s] of originals) writeFileSync(f, s); };

const { LEGACY_ANSWER_PROMISE_PAGES: LIST, LEGACY_BOTH_ANSWERED_PAGES: BOTH_LIST, auditOtherFile, decodeReferences } = await import(pathToFileURL(GUARD).href);
const PROMISE = /both\s+are\s+answered/gi;
const BOTH_ANSWERED_ANCHOR = /both\s+answered/i;
const BOTH_LIST_DECL = "export const LEGACY_BOTH_ANSWERED_PAGES = [\n";
/* Text files only: the control reads and restores files as text. A plant in
   binary bytes is covered by the direct call to auditOtherFile below. */
const OTHER_FILES = ["robots.txt", "sitemap.xml", "FORM_INVENTORY.csv", "tools/asset-guard.mjs", "assets/css/me-home.css"];
const append = (line) => (s) => s + line + "\n";
const NEW_FILE_UNDER_LOWER_GITHUB = "docs/.github/planted-by-null-control.txt";

/* Legacy targets are chosen from the live list, so the control keeps working
   as the list shrinks. */
const listedWithPromise = LIST.filter((p) => { const s = readFileSync(p, "utf8"); PROMISE.lastIndex = 0; return PROMISE.test(s); });

for (const f of [GUARD, HOME, CONTACT, LOOKALIKE, ...LIST, ...BOTH_LIST, ...OTHER_FILES]) remember(f);

const beforeBody = (html) => (s) => s.replace("</body>", html + "\n</body>");

/* The release carries the form on the home page; a rollback removes it. The
   mutations that edit the form in place need it, so without it they plant an
   equivalent form instead. Every rule is still broken in both states. */
const MOLD_SCRIPT = "https://links.moldandenvironmental.com/js/form_embed.js";
const FORM_ON_HOME = readFileSync(HOME, "utf8").includes(MOLD_SCRIPT);
const PLANTED_DISCLOSURE = "<p>It is not permission for marketing email or text messages.</p>";
const PLANTED_MOLD_FORM = '<iframe src="https://links.moldandenvironmental.com/widget/form/test"></iframe><script src="' + MOLD_SCRIPT + '"></script>';
const dropFromList = (paths) => (s) => {
  let out = s;
  for (const p of paths) out = out.replace(`  "${p}",\n`, "");
  return out;
};

/* Each entry: one or more file edits, then the expected outcome. */
const MUTATIONS = [
  { name: "an Estimate Experts address on the home page", edits: [[HOME, beforeBody('<p><a href="https://www.estimate-experts.com/">x</a></p>')]], expect: "ESTIMATE_EXPERTS_ADDRESS" },
  { name: "an Estimate Experts address written with a character reference", edits: [[HOME, beforeBody('<p><a href="https://www.estimate&#45;experts.com/">x</a></p>')]], expect: "ESTIMATE_EXPERTS_ADDRESS" },
  FORM_ON_HOME
    ? { name: "the form script served from a host that is not Mold's", edits: [[HOME, (s) => s.replace(MOLD_SCRIPT, "https://link.msgsndr.com/js/form_embed.js")]], expect: "FOREIGN_FORM_HOST" }
    : { name: "a form script from a host that is not Mold's, planted with a disclosure", edits: [[HOME, beforeBody('<script src="https://link.msgsndr.com/js/form_embed.js"></script>' + PLANTED_DISCLOSURE)]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign form host with an explicit :443 port", edits: [[HOME, beforeBody('<iframe src="https://link.msgsndr.com:443/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign host hidden behind a Mold user-info prefix", edits: [[HOME, beforeBody('<iframe src="https://links.moldandenvironmental.com@link.msgsndr.com/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a protocol-relative foreign form host", edits: [[HOME, beforeBody('<iframe src="//link.msgsndr.com/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign form URL split by an encoded line feed", edits: [[HOME, beforeBody('<iframe src="https://link.msgsndr.com&#10;/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a foreign form URL split by a literal tab", edits: [[HOME, beforeBody('<iframe src="https://link.msgsndr.com' + String.fromCharCode(9) + '/widget/form/test"></iframe>')]], expect: "FOREIGN_FORM_HOST" },
  { name: "a slash before src with an encoded line feed in a foreign form URL", edits: [[HOME, beforeBody('<iframe/src="https://link.msgsndr.com&#10;/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]], expect: "FOREIGN_FORM_HOST" },
  { name: "slashes before a script src with a literal tab in a foreign URL", edits: [[HOME, beforeBody('<script//src="https://link.msgsndr.com' + String.fromCharCode(9) + '/js/form_embed.js"></script>' + PLANTED_DISCLOSURE)]], expect: "FOREIGN_FORM_HOST" },
  { name: "a slash after a quoted attribute before a foreign form URL", edits: [[HOME, beforeBody('<iframe title="left/right > details"/src="//link.msgsndr.com&#13;/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]], expect: "FOREIGN_FORM_HOST" },
  FORM_ON_HOME
    ? { name: "the Mold form URLs split by encoded line feeds, disclosure removed", edits: [[HOME, (s) => s.split("https://links.moldandenvironmental.com/").join("https://links.moldandenvironmental.com&#10;/").replace("It is not permission for marketing email or text messages.", "")]], expect: "FORM_WITHOUT_DISCLOSURE" }
    : { name: "a Mold form URL split by an encoded line feed on a page without the disclosure", edits: [[CONTACT, beforeBody('<iframe src="https://links.moldandenvironmental.com&#10;/widget/form/test"></iframe>')]], expect: "FORM_WITHOUT_DISCLOSURE" },
  { name: "the Mold form with :443 on a page without the disclosure", edits: [[CONTACT, beforeBody('<iframe src="https://links.moldandenvironmental.com:443/widget/form/test"></iframe>')]], expect: "FORM_WITHOUT_DISCLOSURE" },
  FORM_ON_HOME
    ? { name: "the form without its disclosure sentence", edits: [[HOME, (s) => s.replace("It is not permission for marketing email or text messages.", "")]], expect: "FORM_WITHOUT_DISCLOSURE" }
    : { name: "the Mold form planted on a page without the disclosure", edits: [[CONTACT, beforeBody(PLANTED_MOLD_FORM)]], expect: "FORM_WITHOUT_DISCLOSURE" },
  { name: "the removed review label comes back", edits: [[HOME, beforeBody("<p>Verified customer review</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the review label with decimal-encoded spaces", edits: [[HOME, beforeBody("<p>Verified&#32;customer&#32;review</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the review label with semicolonless &nbsp", edits: [[HOME, beforeBody("<p>Verified&nbspcustomer&nbspreview</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the answer promise with semicolonless &nbsp", edits: [[CONTACT, beforeBody("<p>both&nbspare&nbspanswered</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "the review label with multi-code-point ThickSpace references", edits: [[HOME, beforeBody("<p>Verified&ThickSpace;customer&ThickSpace;review</p>")]], expect: "UNSUPPORTED_REVIEW_LABEL" },
  { name: "the answer promise with multi-code-point ThickSpace references", edits: [[CONTACT, beforeBody("<p>both&ThickSpace;are&ThickSpace;answered</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "the removed answer promise comes back on the contact page", edits: [[CONTACT, beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "the answer promise with hexadecimal-encoded spaces", edits: [[CONTACT, beforeBody("<p>both&#x20;are&#x20;answered</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "an unlisted page named like the listed ones gets the promise", edits: [[LOOKALIKE, beforeBody("<p>Phone and email are the quickest ways to reach us, and both are answered.</p>")]], expect: "UNSUPPORTED_ANSWER_PROMISE" },
  { name: "the plain name in visible text", edits: [[HOME, beforeBody("<p>Estimate Experts</p>")]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the plain name in lower case with a no-break space", edits: [[HOME, beforeBody("<p>estimate&nbsp;experts</p>")]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the plain name split by a tag", edits: [[HOME, beforeBody("<p>Estimate<b> </b>Experts</p>")]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the plain name inside a word split by a tag", edits: [[HOME, beforeBody("<p>Esti<b>mate</b> Exp<b>erts</b></p>")]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the plain name in a search description", edits: [[HOME, (s) => s.replace("</head>", '<meta name="x-test" content="Estimate Experts" />\n</head>')]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the plain name in search data", edits: [[HOME, beforeBody('<script type="application/ld+json">{"name":"Estimate Experts"}</script>')]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "the name run together", edits: [[HOME, beforeBody("<p>EstimateExperts</p>")]], expect: "ESTIMATE_EXPERTS_NAME" },
  { name: "'both answered' on the contact page", edits: [[CONTACT, beforeBody("<p>Phone and email are both answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both answered' on a page listed only for the exact promise", edits: [[LIST[0] ?? CONTACT, beforeBody("<p>Phone and email are both answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both get answered'", edits: [[CONTACT, beforeBody("<p>They both get answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both will be answered'", edits: [[CONTACT, beforeBody("<p>They both will be answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both of them are answered'", edits: [[CONTACT, beforeBody("<p>Both of them are answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both are always answered'", edits: [[CONTACT, beforeBody("<p>Both are always answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both are promptly answered' with encoded spaces", edits: [[CONTACT, beforeBody("<p>Both&#32;are&#32;promptly&#32;answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both answered' split by a tag", edits: [[CONTACT, beforeBody("<p>both <b>answered</b></p>")]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "'both answered' in a search description", edits: [[CONTACT, (s) => s.replace("</head>", '<meta name="x-test" content="Phone and email are both answered." />\n</head>')]], expect: "BOTH_ANSWERED_WORDING" },
  { name: "an unlisted page named like the listed ones gets 'both answered'", edits: [[LOOKALIKE, beforeBody("<p>Phone and email are both answered.</p>")]], expect: "BOTH_ANSWERED_WORDING" },
  ...OTHER_FILES.map((f) => ({ name: `an Estimate Experts address in ${f}`, edits: [[f, append(f.endsWith(".xml") ? "<!-- https://www.estimate-experts.com/ -->" : f.endsWith(".css") ? "/* https://www.estimate-experts.com/ */" : f.endsWith(".mjs") ? "// https://www.estimate-experts.com/" : "# https://www.estimate-experts.com/")]], expect: "ESTIMATE_EXPERTS_ADDRESS_IN_FILE" })),
  { name: "the address run together, in upper case, in robots.txt", edits: [["robots.txt", append("# WWW.ESTIMATEEXPERTS.COM")]], expect: "ESTIMATE_EXPERTS_ADDRESS_IN_FILE" },
];
if (BOTH_LIST.length) {
  const target = BOTH_LIST[0];
  MUTATIONS.push({ name: `a page cleaned of 'both answered' but left on its list (${target})`, edits: [[target, (s) => s.replace(BOTH_ANSWERED_ANCHOR, "both reachable")]], expect: "STALE_LEGACY_ENTRY" });
}
if (listedWithPromise.length) {
  const target = listedWithPromise[0];
  MUTATIONS.push({ name: `a listed page cleaned but left on the list (${target})`, edits: [[target, (s) => s.replace(PROMISE, "are listed below")]], expect: "STALE_LEGACY_ENTRY" });
}

/* List-shape mutations: the child-process check must fail. */
const LIST_MUTATIONS = [
  { name: "a pattern entry instead of an exact path", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", 'export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "mold-removal-*/index.html",\n')]] },
  { name: "an expansion to a page outside the approved set", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", 'export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "contact-us-today/index.html",\n')]] },
  { name: "the look-alike page added to the list", edits: [[GUARD, (s) => s.replace("export const LEGACY_ANSWER_PROMISE_PAGES = [\n", `export const LEGACY_ANSWER_PROMISE_PAGES = [\n  "${LOOKALIKE}",\n`)]] },
  { name: "the contact page added to the 'both answered' list", edits: [[GUARD, (s) => s.replace(BOTH_LIST_DECL, BOTH_LIST_DECL + '  "contact-us-today/index.html",\n')]] },
  { name: "a pattern entry on the 'both answered' list", edits: [[GUARD, (s) => s.replace(BOTH_LIST_DECL, BOTH_LIST_DECL + '  "mold-*/index.html",\n')]] },
];

/* Harmless changes: the guard AND the list check must both stay green. */
const cleanAll = (paths) => paths.map((p) => [p, (s) => s.replace(PROMISE, "are listed below")]);
const HARMLESS = [
  { name: "a harmless line", edits: [[HOME, beforeBody("<p>Call or email us about your property.</p>")]] },
  { name: "harmless text with encoded spaces", edits: [[HOME, beforeBody("<p>Call&#32;or&#32;email&#x20;us.</p>")]] },
  FORM_ON_HOME
    ? { name: "the Mold form address written with its default :443 port", edits: [[HOME, (s) => s.replace(MOLD_SCRIPT, "https://links.moldandenvironmental.com:443/js/form_embed.js")]] }
    : { name: "a Mold form with its default :443 port, planted with a disclosure", edits: [[HOME, beforeBody('<iframe src="https://links.moldandenvironmental.com:443/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]] },
  FORM_ON_HOME
    ? { name: "the Mold form URLs split by encoded line feeds, disclosure kept", edits: [[HOME, (s) => s.split("https://links.moldandenvironmental.com/").join("https://links.moldandenvironmental.com&#10;/")]] }
    : { name: "a Mold form URL split by an encoded line feed, planted with a disclosure", edits: [[HOME, beforeBody('<iframe src="https://links.moldandenvironmental.com&#10;/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]] },
  { name: "a double-encoded promise that stays literal text", edits: [[HOME, beforeBody("<p>both&amp;#32;are&amp;#32;answered</p>")]] },
  { name: "harmless text with ThickSpace references", edits: [[HOME, beforeBody("<p>Call&ThickSpace;or&ThickSpace;email us.</p>")]] },
  { name: "a double-encoded ThickSpace promise stays literal text", edits: [[HOME, beforeBody("<p>both&amp;ThickSpace;are&amp;ThickSpace;answered</p>")]] },
  { name: "ThickSpace without semicolons stays literal text", edits: [[HOME, beforeBody("<p>both&ThickSpaceare&ThickSpaceanswered</p>")]] },
  { name: "an unknown reference stays literal text", edits: [[HOME, beforeBody("<p>Verified&NotARealSpace;customer&NotARealSpace;review</p>")]] },
  { name: "a slash before a Mold form src with an encoded line feed and disclosure", edits: [[HOME, beforeBody('<iframe/src="https://links.moldandenvironmental.com&#10;/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]] },
  { name: "slashes before a Mold script src with a literal tab and disclosure", edits: [[HOME, beforeBody('<script//src="https://links.moldandenvironmental.com' + String.fromCharCode(9) + '/js/form_embed.js"></script>' + PLANTED_DISCLOSURE)]] },
  { name: "a slash after a quoted attribute before a Mold form URL with disclosure", edits: [[HOME, beforeBody('<iframe title="left/right > details"/src="//links.moldandenvironmental.com&#13;/widget/form/test"></iframe>' + PLANTED_DISCLOSURE)]] },
  { name: "'estimate' and 'experts' apart in a sentence", edits: [[HOME, beforeBody("<p>Get a free estimate. Our experts can help.</p>")]] },
  { name: "'estimate' and 'experts' with a word between them", edits: [[HOME, beforeBody("<p>An estimate from experts.</p>")]] },
  { name: "'both' and 'answered' that make no promise", edits: [[CONTACT, beforeBody("<p>Both sides have answered. We answered both questions.</p>")]] },
  { name: "the words 'estimate' and 'experts' apart in robots.txt", edits: [["robots.txt", append("# estimate from experts")]] },
];
if (BOTH_LIST.length) {
  const one = BOTH_LIST[0];
  HARMLESS.push({ name: `a legitimate shrink: ${one} cleaned of 'both answered' and taken off its list`, edits: [[one, (s) => s.replace(BOTH_ANSWERED_ANCHOR, "both reachable")], [GUARD, (s) => s.replace(BOTH_LIST_DECL + `  "${one}",\n`, BOTH_LIST_DECL)]] });
}
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

/* Exact decoder results distinguish two code points from one collapsed space,
   and preserve HTML's semicolon, attribute-context and single-pass rules. */
const DECODE_CASES = [
  { name: "ThickSpace text", input: "&ThickSpace;", expected: "\u205f\u200a" },
  { name: "ThickSpace attribute", input: "&ThickSpace;", attribute: true, expected: "\u205f\u200a" },
  { name: "ThickSpace suffix", input: "&ThickSpace;customer", expected: "\u205f\u200acustomer" },
  { name: "ThickSpace needs its semicolon", input: "&ThickSpace", expected: "&ThickSpace" },
  { name: "named references are case-sensitive", input: "&thickspace;", expected: "&thickspace;" },
  { name: "unknown longer reference", input: "&ThickSpaceX;", expected: "&ThickSpaceX;" },
  { name: "decode once only", input: "&amp;ThickSpace;", expected: "&ThickSpace;" },
  { name: "legacy semicolonless text", input: "&nbspcustomer", expected: "\u00a0customer" },
  { name: "legacy semicolonless attribute", input: "&nbspcustomer", attribute: true, expected: "&nbspcustomer" },
  { name: "legacy attribute equals sign", input: "&nbsp=customer", attribute: true, expected: "&nbsp=customer" },
];
for (const c of DECODE_CASES) {
  const actual = decodeReferences(c.input, c.attribute ?? false);
  if (actual !== c.expected) fail(`[${c.name}]: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(actual)}`);
  else console.log(`  OK  [${c.name}] -> exact decoded value`);
}

/* Rule 8 on real binary bytes, called directly so no image is ever rewritten. */
const binary = (text) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0x00]), Buffer.from(text, "latin1"), Buffer.from([0x00, 0xff, 0xd9])]);
if (auditOtherFile("x.jpg", binary("https://www.estimate-experts.com/")).length !== 1) fail("[rule 8 on binary bytes]: the address in binary bytes was not found.");
else console.log("  OK  [rule 8 on binary bytes] -> ESTIMATE_EXPERTS_ADDRESS_IN_FILE");
if (auditOtherFile("x.jpg", binary("estimate from experts")).length !== 0) fail("[rule 8 on binary bytes]: harmless bytes were flagged.");
else console.log("  OK  [rule 8 on harmless binary bytes] -> no finding");

let r = checkList();
if (r.code !== 0) { console.error("NULL CONTROL ABORTED: the legacy list check fails on unmodified content.\n" + r.out); process.exit(1); }
console.log(r.out.trim());
r = guard();
if (r.code !== 0) { console.error("NULL CONTROL ABORTED: guard does not pass on unmodified content.\n" + r.out); process.exit(1); }
console.log(`baseline: intake brand guard PASSES on unmodified content (form on the home page: ${FORM_ON_HOME ? "yes" : "no"})\n`);

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

/* Only the top-level .github folder goes unserved: the same address in a
   .github folder lower down must fail. The planted file is removed afterwards. */
mkdirSync(path.dirname(NEW_FILE_UNDER_LOWER_GITHUB), { recursive: true });
writeFileSync(NEW_FILE_UNDER_LOWER_GITHUB, "https://www.estimate-experts.com/\n");
const lower = guard();
rmSync(NEW_FILE_UNDER_LOWER_GITHUB);
rmdirSync(path.dirname(NEW_FILE_UNDER_LOWER_GITHUB));
if (lower.code === 0 || !lower.out.includes("ESTIMATE_EXPERTS_ADDRESS_IN_FILE")) fail("[a .github folder below the top]: the guard did not fail with ESTIMATE_EXPERTS_ADDRESS_IN_FILE.");
else console.log("  OK  [a .github folder below the top] -> ESTIMATE_EXPERTS_ADDRESS_IN_FILE");

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
console.log(`INTAKE BRAND GUARD NULL CONTROL: PASS -- ${DECODE_CASES.length} decoder cases, ${MUTATIONS.length} rule breaks caught, ${LIST_MUTATIONS.length} bad lists refused, ${HARMLESS.length} harmless changes stayed green, restore byte-identical.`);
