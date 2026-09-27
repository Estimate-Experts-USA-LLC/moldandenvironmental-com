#!/usr/bin/env node
/* INTAKE BRAND AND CLAIMS GUARD
   Fails the build if any page:
     1. names an Estimate Experts address (ESTIMATE_EXPERTS_ADDRESS);
     2. loads a HighLevel form or form script from a host that is not Mold's
        own (FOREIGN_FORM_HOST);
     3. shows the "Verified customer review" label (UNSUPPORTED_REVIEW_LABEL);
     4. promises that phone and email are "both answered"
        (UNSUPPORTED_ANSWER_PROMISE);
     5. carries the inquiry form without its disclosure sentence
        (FORM_WITHOUT_DISCLOSURE).
   Why it exists: the other guards passed a head that loaded the form from an
   Estimate Experts address, and passed main while it still showed three
   unsupported review quotes and the "both are answered" promise. Mold must
   never carry another brand's address, and removed claims must not return by
   a later paste. Rules 3 and 4 judge RENDERED text; rules 1 and 2 judge the
   whole served page, because an address in a script tag is still served.

   Every rule reads the page AFTER character references are decoded, the way
   a browser does (&#32;, &#x20;, &amp; and the like), and after invisible
   zero-width characters are removed. URLs are parsed with the URL class, so an
   explicit port (:443), a protocol-relative "//host", a user-info prefix
   ("mold@other-host") or backslashes cannot hide the real host. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* Hosts allowed to serve the HighLevel form and its helper script. Adding any
   other host needs the CEO's written exception to the brand rule, quoted here
   with its date. Nothing else belongs in this list. */
const ALLOWED_FORM_HOSTS = ["links.moldandenvironmental.com"];

const DISCLOSURE = "It is not permission for marketing email or text messages.";

/* Pages that already carried "both are answered" on main (6bfc4c0) when this
   guard was written, 2026-09-25. Removing the promise from them is a separate
   copy change that needs its own decision, so for now they are listed rather
   than failed. This list may only shrink: a page that no longer carries the
   phrase fails as STALE_LEGACY_ENTRY until it is taken off the list, and no
   other page may carry the phrase. The intake pages (the home, contact and
   privacy pages) are deliberately NOT here, so a rollback cannot bring the
   promise back to them. The null control holds the approved initial set and
   fails if this list ever names a page outside it. */
export const LEGACY_ANSWER_PROMISE_PAGES = [
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

/* Same walker as the claims guard: fs.globSync does not exist on Node 20. */
function findHtml(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = dir + "/" + e.name;
    if (e.isDirectory()) findHtml(full, base, out);
    else if (e.name.endsWith(".html")) out.push(full.slice(base.length + 1));
  }
  return out;
}

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SITE = path.join(ROOT, "..");

/* Invisible characters a paste can carry: soft hyphen, zero-width space,
   non-joiner, joiner, word joiner, byte-order mark. Built from code points so
   the source stays plain ASCII. */
const INVISIBLE = new RegExp("[" + [0xad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff].map((c) => String.fromCharCode(c)).join("") + "]", "g");

const NAMED = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: "...",
  ndash: "-", mdash: "-", shy: "", sol: "/", bsol: "\\", colon: ":",
  period: ".", comma: ",", hyphen: "-", dash: "-", commat: "@",
};

/* One pass, like a browser: "&amp;#32;" stays the literal text "&#32;". */
export function decodeReferences(s) {
  return s.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (m, ref) => {
    if (ref[0] === "#") {
      const hex = ref[1] === "x" || ref[1] === "X";
      const cp = hex ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff) return " ";
      try { return String.fromCodePoint(cp); } catch { return " "; }
    }
    const v = NAMED[ref.toLowerCase()];
    return v !== undefined ? v : " ";
  });
}

const normalize = (s) => decodeReferences(s).replace(INVISIBLE, "");

const strip = (s) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, "")
   .replace(/<style[\s\S]*?<\/style>/gi, "")
   .replace(/<!--[\s\S]*?-->/g, "");

/* Two readings of the visible text: tags as word breaks, and tags removed.
   The second catches a phrase split by an inline tag inside a word. */
function renderedTexts(html) {
  const body = strip(html);
  const spaced = normalize(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const joined = normalize(body.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
  return { spaced, joined };
}

/* Every absolute or protocol-relative URL, parsed. Backslashes count as
   slashes, as they do in a browser for http and https. */
const URL_CANDIDATE = /(?:https?:)?[\\/]{2}[^\s"'<>()`]+/gi;

function widgetUrls(servedText) {
  const out = [];
  for (const m of servedText.matchAll(URL_CANDIDATE)) {
    let candidate = m[0].replace(/\\/g, "/");
    if (candidate.startsWith("//")) candidate = "https:" + candidate;
    let u;
    try { u = new URL(candidate); } catch { continue; }
    const p = u.pathname.toLowerCase();
    const isForm = p.includes("/widget/form/") || p.endsWith("/js/form_embed.js");
    const isWidget = isForm || p.includes("/widget/survey/") || p.includes("/widget/booking/");
    if (!isWidget) continue;
    out.push({ host: u.hostname.toLowerCase().replace(/\.$/, ""), isForm, index: m.index, text: m[0] });
  }
  return out;
}

const context = (s, i, len) => s.slice(Math.max(0, i - 60), i + len + 60).replace(/\s+/g, " ").trim().slice(0, 150);

function phraseMatches(texts, rx) {
  const spaced = [...texts.spaced.matchAll(rx)].map((m) => ({ m, text: texts.spaced }));
  if (spaced.length) return spaced;
  return [...texts.joined.matchAll(rx)].map((m) => ({ m, text: texts.joined }));
}

export function auditFile(file, html) {
  const findings = [];
  const served = normalize(html);

  // 1. Estimate Experts address anywhere in the served page. An allowed host
  //    (only ever added by written exception) is blanked out first.
  let raw = served;
  for (const h of ALLOWED_FORM_HOSTS) raw = raw.split(h).join(" ".repeat(h.length));
  for (const m of raw.matchAll(/estimate-experts/gi)) {
    findings.push({ file, kind: "ESTIMATE_EXPERTS_ADDRESS", match: m[0], context: context(served, m.index, m[0].length) });
  }

  // 2. Form or form script served from a host that is not Mold's own.
  let formOnPage = false;
  for (const w of widgetUrls(served)) {
    if (w.isForm) formOnPage = true;
    if (!ALLOWED_FORM_HOSTS.includes(w.host)) {
      findings.push({ file, kind: "FOREIGN_FORM_HOST", match: w.host, context: context(served, w.index, w.text.length) });
    }
  }

  const texts = renderedTexts(html);

  // 3. The removed review label.
  for (const { m, text } of phraseMatches(texts, /verified\s+customer\s+review/gi)) {
    findings.push({ file, kind: "UNSUPPORTED_REVIEW_LABEL", match: m[0], context: context(text, m.index, m[0].length) });
  }

  // 4. The removed "both are answered" promise: allowed only on the listed
  //    legacy pages, and a listed page that has lost it must leave the list.
  const promises = phraseMatches(texts, /both\s+are\s+answered/gi);
  const legacy = LEGACY_ANSWER_PROMISE_PAGES.includes(file.replace(/\\/g, "/"));
  if (!legacy) {
    for (const { m, text } of promises) {
      findings.push({ file, kind: "UNSUPPORTED_ANSWER_PROMISE", match: m[0], context: context(text, m.index, m[0].length) });
    }
  } else if (promises.length === 0) {
    findings.push({ file, kind: "STALE_LEGACY_ENTRY", match: "listed but clean", context: "remove this page from LEGACY_ANSWER_PROMISE_PAGES" });
  }

  // 5. A page that carries the form must carry its disclosure.
  if (formOnPage && !texts.spaced.includes(DISCLOSURE)) {
    findings.push({ file, kind: "FORM_WITHOUT_DISCLOSURE", match: "form present", context: `missing: "${DISCLOSURE}"` });
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("intake-brand-guard.mjs")) {
  const files = findHtml(SITE);
  let all = [];
  for (const f of files) all = all.concat(auditFile(f, readFileSync(path.join(SITE, f), "utf8")));
  if (all.length) {
    console.error(`INTAKE BRAND GUARD: ${all.length} finding(s) in ${files.length} pages\n`);
    for (const f of all) console.error(`  [${f.kind}] ${f.file}\n     ${f.match} -- ...${f.context}...\n`);
    process.exit(1);
  }
  console.log(`INTAKE BRAND GUARD: PASS -- ${files.length} pages, 0 findings.`);
}
