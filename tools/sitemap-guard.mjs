#!/usr/bin/env node
/**
 * SITEMAP GUARD -- the sitemap, the canonical tags and the robots tags must agree.
 *
 * Three signals tell a search engine which URLs matter, and they are written in
 * three different places, so they drift apart quietly. Found by this check on
 * first run: /category/mold/ was listed in the sitemap while its own canonical
 * pointed at /blog/ -- the sitemap saying "index this" and the page saying "no,
 * index that other one".
 *
 * Rules:
 *   1. every URL in the sitemap must exist on disk;
 *   2. every URL in the sitemap must be self-canonical (a page that defers to
 *      another URL does not belong in the list of URLs you are nominating);
 *   3. no URL in the sitemap may be noindex;
 *   4. every self-canonical, indexable page must appear in the sitemap -- an
 *      omission is how a page stays invisible while looking finished.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ORIGIN = "https://moldandenvironmental.com";

const xml = readFileSync(join(ROOT, "sitemap.xml"), "utf8");
const listed = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
if (listed.length === 0) {
  console.error("SITEMAP GUARD: FAIL -- sitemap.xml lists no URLs. That is not a pass.");
  process.exit(1);
}

const pathOf = (u) => u.replace(ORIGIN, "").replace(/\/$/, "") || "/";
const fileFor = (p) => join(ROOT, p === "/" ? "index.html" : join(p.slice(1), "index.html"));

function meta(file) {
  const s = readFileSync(file, "utf8");
  const can = s.match(/<link rel="canonical" href="([^"]+)"/);
  const rob = s.match(/<meta name="robots" content="([^"]*)"/i);
  return { canonical: can ? can[1] : null, robots: rob ? rob[1] : "" };
}

function allPages(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "wp-content") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) allPages(p, out);
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

const problems = [];
const listedPaths = new Set();

for (const url of listed) {
  const p = pathOf(url);
  listedPaths.add(p);
  const f = fileFor(p);
  if (!existsSync(f)) {
    problems.push(`LISTED_BUT_MISSING  ${url}  (no file at ${f.slice(ROOT.length + 1)})`);
    continue;
  }
  const { canonical, robots } = meta(f);
  const self = canonical && pathOf(canonical) === p;
  if (canonical && !self)
    problems.push(`LISTED_BUT_CANONICAL_ELSEWHERE  ${url}  -> canonical is ${canonical}`);
  if (/noindex/i.test(robots))
    problems.push(`LISTED_BUT_NOINDEX  ${url}  (robots: ${robots})`);
}

for (const f of allPages()) {
  const rel = f.slice(ROOT.length + 1).replace(/\\/g, "/").replace(/index\.html$/, "");
  const p = "/" + rel.replace(/\/$/, "");
  const norm = p === "/" ? "/" : p;
  const { canonical, robots } = meta(f);
  if (!canonical) continue;                       // stubs without canonical: not nominated
  if (/noindex/i.test(robots)) continue;          // deliberately out
  if (pathOf(canonical) !== norm) continue;       // defers to another URL: correctly absent
  if (!listedPaths.has(norm))
    problems.push(`INDEXABLE_BUT_NOT_LISTED  ${ORIGIN}${norm === "/" ? "/" : norm + "/"}`);
}

if (problems.length) {
  console.error(`SITEMAP GUARD: FAIL -- ${problems.length} inconsistency(ies) between sitemap, canonical and robots.\n`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}

console.log(`SITEMAP GUARD: PASS -- ${listed.length} URLs; all exist, all self-canonical, none noindex, and no indexable page is missing.`);
