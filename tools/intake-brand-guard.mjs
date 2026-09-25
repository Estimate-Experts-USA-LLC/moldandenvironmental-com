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
   raw page, because an address in a script tag is still served to visitors. */
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
   promise back to them. */
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

const strip = (s) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, "")
   .replace(/<style[\s\S]*?<\/style>/gi, "")
   .replace(/<!--[\s\S]*?-->/g, "");

const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'")
   .replace(/&hellip;/g, "...").replace(/&[a-z]+;/gi, " ");

const renderedText = (html) =>
  decode(strip(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

/* A HighLevel form, survey or booking widget, or the form helper script. */
const FORM_URL = /(?:https?:)?\/\/([a-z0-9.-]+)\/(?:widget\/(?:form|survey|booking)\/[^"'\s<>]*|js\/form_embed\.js)/gi;

const context = (s, i, len) => s.slice(Math.max(0, i - 60), i + len + 60).replace(/\s+/g, " ").trim().slice(0, 150);

export function auditFile(file, html) {
  const findings = [];

  // 1. Estimate Experts address anywhere in the served page. An allowed host
  //    (only ever added by written exception) is blanked out first.
  let raw = html;
  for (const h of ALLOWED_FORM_HOSTS) raw = raw.split(h).join(" ".repeat(h.length));
  for (const m of raw.matchAll(/estimate-experts/gi)) {
    findings.push({ file, kind: "ESTIMATE_EXPERTS_ADDRESS", match: m[0], context: context(html, m.index, m[0].length) });
  }

  // 2. Form or form script served from a host that is not Mold's own.
  let formOnPage = false;
  for (const m of html.matchAll(FORM_URL)) {
    const host = m[1].toLowerCase();
    if (/\/widget\/form\//i.test(m[0]) || /form_embed\.js/i.test(m[0])) formOnPage = true;
    if (!ALLOWED_FORM_HOSTS.includes(host)) {
      findings.push({ file, kind: "FOREIGN_FORM_HOST", match: host, context: context(html, m.index, m[0].length) });
    }
  }

  const text = renderedText(html);

  // 3. The removed review label.
  for (const m of text.matchAll(/verified\s+customer\s+review/gi)) {
    findings.push({ file, kind: "UNSUPPORTED_REVIEW_LABEL", match: m[0], context: context(text, m.index, m[0].length) });
  }

  // 4. The removed "both are answered" promise: allowed only on the listed
  //    legacy pages, and a listed page that has lost it must leave the list.
  const promises = [...text.matchAll(/both\s+are\s+answered/gi)];
  const legacy = LEGACY_ANSWER_PROMISE_PAGES.includes(file.replace(/\\/g, "/"));
  if (!legacy) {
    for (const m of promises) {
      findings.push({ file, kind: "UNSUPPORTED_ANSWER_PROMISE", match: m[0], context: context(text, m.index, m[0].length) });
    }
  } else if (promises.length === 0) {
    findings.push({ file, kind: "STALE_LEGACY_ENTRY", match: "listed but clean", context: "remove this page from LEGACY_ANSWER_PROMISE_PAGES" });
  }

  // 5. A page that carries the form must carry its disclosure.
  if (formOnPage && !text.includes(DISCLOSURE)) {
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
