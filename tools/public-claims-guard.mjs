#!/usr/bin/env node
/* PUBLIC TRUST CLAIMS GUARD
   Fails if production-RENDERABLE content makes an unsupported credential claim.
   Deliberately NOT "the word certified anywhere = fail": comments, CSS
   selectors, JS identifiers and legitimate generic advice must stay legal, and
   a future VERIFIED credential must be addable via the allowlist below.
   It judges RENDERED TEXT + metadata + image sources, because the credentials
   cleanup proved a badge image asserts a claim with no text to find, and that
   "DBPR certified" can hide split across a <span>. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* Deliberately NOT fs.globSync: it was added in Node 22 and CI runs Node 20, so
   the guard CRASHED in CI while passing locally on Node 24. A crashing guard
   reports "failure", which reads exactly like a claims violation -- the worst
   possible false alarm for this check. This walker works on every version. */
function findIndexHtml(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = dir + "/" + e.name;
    if (e.isDirectory()) findIndexHtml(full, base, out);
    else if (e.name === "index.html") out.push(full.slice(base.length + 1));
  }
  return out;
}

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SITE = path.join(ROOT, "..");

/* Approved, documented exceptions. Each is generic reader advice or an
   accurate statement about what DBPR does NOT issue -- never a company claim. */
const ALLOW = [
  "conducted by a certified mold inspector",
  "ask a certified and licensed mold inspector",
  "a certified and experienced inspector evaluates",
  "does not issue mold business licenses or certifications",
];

/* Credential bodies with no verified, current evidence. */
const FORBIDDEN_BODIES = [/\bIICRC\b/i, /\bNORMI\b/i, /\bNAMRI\b/i];
/* Unsupported credential/trust language. */
const FORBIDDEN_PHRASES = [
  /\bcertif\w*/i,
  /\bbonded\b/i,
  /\bfully\s+credentialed\b/i,
  /\bstate\s+certified\b/i,
  /\bmaster\s+certified\b/i,
  /\bindustry\s+accredited\b/i,
];
/* Credential artwork that must never render. */
const FORBIDDEN_IMAGES = /certificate-0\d|logo_IICRC|Normi-Certified|Namri-Prof/i;

const strip = (s) =>
  s.replace(/<script[\s\S]*?<\/script>/gi, "")
   .replace(/<style[\s\S]*?<\/style>/gi, "")
   .replace(/<!--[\s\S]*?-->/g, "");

const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'")
   .replace(/&hellip;/g, "...").replace(/&[a-z]+;/gi, " ");

export function auditFile(file, html) {
  const findings = [];
  const body = strip(html);
  const text = decode(body.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

  const scan = (haystack, kind) => {
    for (const rx of [...FORBIDDEN_BODIES, ...FORBIDDEN_PHRASES]) {
      let m; const r = new RegExp(rx.source, rx.flags.includes("g") ? rx.flags : rx.flags + "g");
      while ((m = r.exec(haystack)) !== null) {
        const ctx = haystack.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
        if (ALLOW.some((a) => ctx.includes(a))) continue;
        findings.push({ file, kind, match: m[0], context: ctx.trim().slice(0, 150) });
      }
    }
  };

  scan(text, "RENDERED_TEXT");
  for (const tag of html.match(/<meta[^>]*>/gi) || []) scan(decode(tag), "METADATA");
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  if (title) scan(decode(title[1]), "TITLE");
  for (const a of html.match(/(?:alt|title|aria-label)="[^"]*"/gi) || []) scan(decode(a), "IMAGE_TEXT");
  for (const im of html.match(/<img[^>]*>/gi) || []) {
    if (FORBIDDEN_IMAGES.test(im)) {
      findings.push({ file, kind: "CREDENTIAL_BADGE", match: (im.match(FORBIDDEN_IMAGES) || [""])[0], context: im.slice(0, 130) });
    }
  }
  for (const ld of html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || []) scan(decode(ld), "JSON_LD");
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("public-claims-guard.mjs")) {
  const files = findIndexHtml(SITE);
  let all = [];
  for (const f of files) all = all.concat(auditFile(f, readFileSync(path.join(SITE, f), "utf8")));
  if (all.length) {
    console.error(`PUBLIC CLAIMS GUARD: ${all.length} unsupported claim(s) in ${files.length} pages\n`);
    for (const f of all) console.error(`  [${f.kind}] ${f.file}\n     ${f.match} -- ...${f.context}...\n`);
    process.exit(1);
  }
  console.log(`PUBLIC CLAIMS GUARD: PASS -- ${files.length} pages, 0 unsupported credential claims.`);
}
