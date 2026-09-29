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

   Character references are decoded in one pass, the way the HTML parser does:
   numeric references, known named references, and the legacy names a browser
   also accepts WITHOUT a semicolon (&nbspcustomer is NBSP + "customer"). In an
   attribute value a semicolonless legacy name followed by a letter, digit or
   "=" stays literal, as the HTML spec requires. Unknown names stay as text.
   Invisible zero-width characters are removed. Every URL is parsed with the
   URL class after removing ASCII tab, line feed and carriage return and
   trimming control characters and spaces, as the URL parser does, so an
   explicit port, a protocol-relative "//host", a user-info prefix, a
   backslash or a newline inside the value cannot hide the real host. */
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
const SITE = path.join(ROOT, "..", "..");

const chr = (cp) => String.fromCodePoint(cp);

/* The 106 legacy named references the HTML parser accepts without a
   semicolon, with their code points (hexadecimal). They also count with one. */
const LEGACY_TABLE =
  "AElig C6 AMP 26 Aacute C1 Acirc C2 Agrave C0 Aring C5 Atilde C3 Auml C4 COPY A9 Ccedil C7 ETH D0 Eacute C9 " +
  "Ecirc CA Egrave C8 Euml CB GT 3E Iacute CD Icirc CE Igrave CC Iuml CF LT 3C Ntilde D1 Oacute D3 Ocirc D4 " +
  "Ograve D2 Oslash D8 Otilde D5 Ouml D6 QUOT 22 REG AE THORN DE Uacute DA Ucirc DB Ugrave D9 Uuml DC Yacute DD " +
  "aacute E1 acirc E2 acute B4 aelig E6 agrave E0 amp 26 aring E5 atilde E3 auml E4 brvbar A6 ccedil E7 cedil B8 " +
  "cent A2 copy A9 curren A4 deg B0 divide F7 eacute E9 ecirc EA egrave E8 eth F0 euml EB frac12 BD frac14 BC " +
  "frac34 BE gt 3E iacute ED icirc EE iexcl A1 igrave EC iquest BF iuml EF laquo AB lt 3C macr AF micro B5 " +
  "middot B7 nbsp A0 not AC ntilde F1 oacute F3 ocirc F4 ograve F2 ordf AA ordm BA oslash F8 otilde F5 ouml F6 " +
  "para B6 plusmn B1 pound A3 quot 22 raquo BB reg AE sect A7 shy AD sup1 B9 sup2 B2 sup3 B3 szlig DF thorn FE " +
  "times D7 uacute FA ucirc FB ugrave F9 uml A8 uuml FC yacute FD yen A5 yuml FF";

/* Named references that count only with a semicolon and matter here: spaces,
   invisible characters and the punctuation a URL or phrase could be built
   from. Any name not listed stays as text (it is not a space). */
const SEMICOLON_TABLE =
  "Tab 9 NewLine A nbsp A0 NonBreakingSpace A0 ensp 2002 emsp 2003 emsp13 2004 emsp14 2005 numsp 2007 " +
  "puncsp 2008 thinsp 2009 ThinSpace 2009 hairsp 200A VeryThinSpace 200A ZeroWidthSpace 200B " +
  "NegativeVeryThinSpace 200B NegativeThinSpace 200B NegativeMediumSpace 200B NegativeThickSpace 200B " +
  "zwnj 200C zwj 200D NoBreak 2060 MediumSpace 205F ThickSpace 205F+200A ApplyFunction 2061 af 2061 InvisibleTimes 2062 it 2062 " +
  "InvisibleComma 2063 ic 2063 apos 27 lsquo 2018 rsquo 2019 ldquo 201C rdquo 201D hellip 2026 ndash 2013 " +
  "mdash 2014 hyphen 2010 dash 2010 sol 2F bsol 5C colon 3A period 2E comma 2C commat 40 lowbar 5F num 23 " +
  "excl 21 quest 3F lpar 28 rpar 29 semi 3B equals 3D plus 2B percnt 25 dollar 24 ast 2A lsqb 5B rsqb 5D " +
  "lcub 7B rcub 7D verbar 7C vert 7C grave 60";

function parseTable(t) {
  const parts = t.trim().split(/\s+/);
  const map = new Map();
  for (let i = 0; i < parts.length; i += 2) {
    // Some named references expand to more than one Unicode code point.
    const value = parts[i + 1].split("+").map((cp) => chr(parseInt(cp, 16))).join("");
    map.set(parts[i], value);
  }
  return map;
}
const LEGACY = parseTable(LEGACY_TABLE);
const WITH_SEMICOLON = new Map([...LEGACY, ...parseTable(SEMICOLON_TABLE)]);
const LONGEST_LEGACY = Math.max(...[...LEGACY.keys()].map((k) => k.length));
const REPLACEMENT = chr(0xfffd);

const NUMERIC_REF = /&#(?:([xX])([0-9a-fA-F]+)|([0-9]+));?/y;
const NAMED_REF = /&([a-zA-Z][a-zA-Z0-9]*)(;?)/y;
const ATTR_STOP = /[A-Za-z0-9=]/;

/* One pass, like the HTML parser: "&amp;#32;" stays the literal text "&#32;". */
export function decodeReferences(s, inAttribute = false) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const amp = s.indexOf("&", i);
    if (amp < 0) { out += s.slice(i); break; }
    out += s.slice(i, amp);

    NUMERIC_REF.lastIndex = amp;
    const num = NUMERIC_REF.exec(s);
    if (num) {
      const cp = num[1] ? parseInt(num[2], 16) : parseInt(num[3], 10);
      const bad = !Number.isFinite(cp) || cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff);
      out += bad ? REPLACEMENT : chr(cp);
      i = NUMERIC_REF.lastIndex;
      continue;
    }

    NAMED_REF.lastIndex = amp;
    const named = NAMED_REF.exec(s);
    if (named) {
      const run = named[1];
      if (named[2] === ";" && WITH_SEMICOLON.has(run)) {
        out += WITH_SEMICOLON.get(run);
        i = NAMED_REF.lastIndex;
        continue;
      }
      let matched = 0;
      for (let k = Math.min(run.length, LONGEST_LEGACY); k >= 2; k--) {
        if (LEGACY.has(run.slice(0, k))) { matched = k; break; }
      }
      if (matched) {
        const after = s[amp + 1 + matched];
        const semicolon = after === ";";
        if (!(inAttribute && !semicolon && after !== undefined && ATTR_STOP.test(after))) {
          out += LEGACY.get(run.slice(0, matched));
          i = amp + 1 + matched + (semicolon ? 1 : 0);
          continue;
        }
      }
    }
    out += "&";
    i = amp + 1;
  }
  return out;
}

/* Invisible characters a paste can carry: soft hyphen, Mongolian vowel
   separator, zero-width space, non-joiner, joiner, word joiner, the invisible
   operators, byte-order mark. Built from code points so the source stays
   plain ASCII. */
const INVISIBLE = new RegExp("[" + [0xad, 0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0xfeff].map(chr).join("") + "]", "g");

const normalizeText = (s) => decodeReferences(s, false).replace(INVISIBLE, "");

const strip = (s) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, "")
   .replace(/<style[\s\S]*?<\/style>/gi, "")
   .replace(/<!--[\s\S]*?-->/g, "");

/* Two readings of the visible text: tags as word breaks, and tags removed.
   The second catches a phrase split by an inline tag inside a word. */
function renderedTexts(html) {
  const body = strip(html);
  const spaced = normalizeText(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const joined = normalizeText(body.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ");
  return { spaced, joined };
}

/* What the URL parser does to its input first: remove every ASCII tab, line
   feed and carriage return, then trim leading and trailing C0 controls and
   spaces. */
const TAB_NEWLINE = new RegExp("[" + [9, 10, 13].map(chr).join("") + "]", "g");
const EDGE_C0 = new RegExp("^[" + chr(0) + "-" + chr(0x20) + "]+|[" + chr(0) + "-" + chr(0x20) + "]+$", "g");
const urlInput = (s) => s.replace(TAB_NEWLINE, "").replace(EDGE_C0, "");

/* Absolute or protocol-relative URL candidates. Backslashes count as
   slashes, as they do in a browser for http and https. */
const URL_CANDIDATE = /(?:https?:)?[\\/]{2}[^\s"'<>()`]+/gi;

/* Every attribute value of every start tag, quoted or not; a ">" inside a
   quoted value does not end the tag. A slash before another attribute is a
   tokenizer parse error that browsers recover from by reading the attribute. */
const START_TAG = /<[a-zA-Z][^\s/>]*((?:[\s/]+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function classify(candidate) {
  let c = candidate.replace(/\\/g, "/");
  if (c.startsWith("//")) c = "https:" + c;
  let u;
  try { u = new URL(c); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const p = u.pathname.toLowerCase();
  const isForm = p.includes("/widget/form/") || p.endsWith("/js/form_embed.js");
  const isWidget = isForm || p.includes("/widget/survey/") || p.includes("/widget/booking/");
  if (!isWidget) return null;
  return { host: u.hostname.toLowerCase().replace(/\.$/, ""), isForm, href: u.href };
}

function widgetUrls(html, served) {
  const out = [];
  const seen = new Set();
  const add = (found, index, text) => {
    if (!found) return;
    const key = found.href + "@" + index;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...found, index, text });
  };
  // Attribute values, decoded with attribute rules and normalized like the
  // URL parser's input.
  for (const tag of html.matchAll(START_TAG)) {
    for (const a of tag[1].matchAll(ATTRIBUTE)) {
      const raw = a[2] ?? a[3] ?? a[4];
      if (raw === undefined) continue;
      const value = urlInput(decodeReferences(raw, true));
      for (const m of value.matchAll(URL_CANDIDATE)) add(classify(m[0]), tag.index, tag[0]);
    }
  }
  // Everything else served, scripts included.
  for (const m of served.matchAll(URL_CANDIDATE)) add(classify(m[0]), -1 - m.index, m[0]);
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
  const served = normalizeText(html);

  // 1. Estimate Experts address anywhere in the served page. An allowed host
  //    (only ever added by written exception) is blanked out first.
  let raw = served;
  for (const h of ALLOWED_FORM_HOSTS) raw = raw.split(h).join(" ".repeat(h.length));
  for (const m of raw.matchAll(/estimate-experts/gi)) {
    findings.push({ file, kind: "ESTIMATE_EXPERTS_ADDRESS", match: m[0], context: context(served, m.index, m[0].length) });
  }

  // 2. Form or form script served from a host that is not Mold's own.
  let formOnPage = false;
  const reported = new Set();
  for (const w of widgetUrls(html, served)) {
    if (w.isForm) formOnPage = true;
    if (!ALLOWED_FORM_HOSTS.includes(w.host) && !reported.has(w.href)) {
      reported.add(w.href);
      findings.push({ file, kind: "FOREIGN_FORM_HOST", match: w.host, context: w.href });
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
