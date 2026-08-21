#!/usr/bin/env node
/* PRODUCTION ASSET-REFERENCE GUARD
   Every local URL the site references must resolve to an exported file.

   Banked from two real defects:
   1. 173 /wp-includes/ script references that 404 on every page load. My first
      check reported "0 broken assets" because its regex required a closing quote
      immediately after the path, so it silently skipped EVERY url with ?ver=.
      The browser's 324 console errors are what exposed it.
   2. srcset advertised 768w image variants that were never exported. Desktop chose
      the 1024w that exists and looked perfect; tablet and mobile chose the missing
      candidate and the image failed. A desktop-only check passes this forever.

   So this parses URLs rather than pattern-matching them, and it understands
   query strings, fragments, srcset candidate lists, <source>, CSS url(), module
   scripts, classic scripts, stylesheets, preloads and prefetches. */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SITE = path.join(ROOT, "..");

function htmlFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "docs", "tools"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(full, base, out);
    else if (e.name.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Local, site-absolute URLs only. External, protocol-relative, data:, mailto:,
 *  tel: and fragments are out of scope. */
function isLocal(u) {
  if (!u) return false;
  const s = u.trim();
  if (!s.startsWith("/")) return false;   // relative/external/data/mailto/tel
  if (s.startsWith("//")) return false;   // protocol-relative = external
  return true;
}

function resolves(u) {
  // Parse rather than pattern-match: strip query and fragment properly.
  const clean = u.split("#")[0].split("?")[0];
  if (!clean || clean === "/") return existsSync(path.join(SITE, "index.html"));
  const p = path.join(SITE, decodeURIComponent(clean).replace(/^\//, ""));
  if (existsSync(p)) return true;
  if (clean.endsWith("/") && existsSync(path.join(p, "index.html"))) return true;
  return false;
}

function collect(html) {
  const urls = [];
  const push = (u, kind) => { if (isLocal(u)) urls.push({ url: u.trim(), kind }); };

  for (const m of html.matchAll(/<(?:script|img|source|iframe|embed|video|audio)\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi)) push(m[1], "src");
  for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*"([^"]*)"[^>]*>/gi)) {
    const tag = m[0];
    if (/rel\s*=\s*"(?:stylesheet|preload|prefetch|icon|apple-touch-icon|manifest)"/i.test(tag)) push(m[1], "link");
  }
  // srcset / imagesrcset: comma-separated candidate lists -- the defect above
  for (const m of html.matchAll(/\b(?:srcset|data-srcset|imagesrcset)\s*=\s*"([^"]*)"/gi)) {
    for (const cand of m[1].split(",")) {
      const u = cand.trim().split(/\s+/)[0];
      push(u, "srcset");
    }
  }
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) push(m[1], "css-url");
  return urls;
}

export function auditHtml(file, html) {
  const bad = [];
  for (const { url, kind } of collect(html)) {
    if (!resolves(url)) bad.push({ file, url, kind });
  }
  return bad;
}

if (process.argv[1]?.endsWith("asset-guard.mjs")) {
  const files = htmlFiles(SITE);
  let all = [];
  for (const f of files) all = all.concat(auditHtml(path.relative(SITE, f).split(path.sep).join("/"), readFileSync(f, "utf8")));
  const byUrl = new Map();
  for (const b of all) byUrl.set(b.url, (byUrl.get(b.url) || 0) + 1);
  if (all.length) {
    console.error(`ASSET GUARD: ${all.length} reference(s) to files that do not exist, across ${files.length} pages\n`);
    for (const [u, n] of [...byUrl.entries()].sort((a, b) => b[1] - a[1])) {
      const ex = all.find((x) => x.url === u);
      console.error(`  x${n}  [${ex.kind}] ${u}\n        first seen in ${ex.file}`);
    }
    process.exit(1);
  }
  console.log(`ASSET GUARD: PASS -- ${files.length} pages, every local src/href/srcset/url() resolves.`);
}
