#!/usr/bin/env node
/**
 * CSS CACHE-BUSTING VERSION STAMP
 *
 * Every page linked the stylesheets as `?v=1` -- a constant. It stayed `1` while
 * the CSS changed repeatedly, including the change that made a street address
 * visible again, so a browser holding the old file kept rendering the old defect.
 * GitHub Pages sends `Cache-Control: max-age=600`, which bounds that to about ten
 * minutes rather than forever, so this is a latent hazard rather than a live
 * outage -- but the version query exists precisely to make the URL change when
 * the bytes change, and it was not doing that job.
 *
 * The version is now the first 8 hex characters of the file's SHA-256, so it
 * changes exactly when the file does.
 *
 *   node tools/css-version.mjs --write   stamp every page
 *   node tools/css-version.mjs           check; non-zero if any page is stale
 *
 * The check runs in CI so a forgotten stamp fails the build rather than shipping
 * pages that point at a version of the CSS they were not built against.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");

function hashOf(rel) {
  return createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex").slice(0, 8);
}

function htmlFiles(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

// Discover the stylesheets actually referenced, rather than a hardcoded list --
// a new stylesheet must not be able to join the site unversioned and unnoticed.
const REF = /(?:href|src)="((?:\/|\.\.\/|\.\/)?[^"]*?\/?assets\/css\/([A-Za-z0-9._-]+\.css))(\?v=([A-Za-z0-9]+))?"/g;

const files = htmlFiles();
if (files.length === 0) {
  console.error("CSS VERSION: FAIL -- no HTML files found. Refusing to pass on an empty set.");
  process.exit(1);
}

const hashes = new Map();
const stale = [];
let stamped = 0;
let refs = 0;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  let changed = src;
  let m;
  REF.lastIndex = 0;
  while ((m = REF.exec(src)) !== null) {
    const [full, path, name, , version] = m;
    refs++;
    if (!hashes.has(name)) {
      try {
        hashes.set(name, hashOf(join("assets", "css", name)));
      } catch {
        console.error(`CSS VERSION: FAIL -- ${f.slice(ROOT.length + 1)} references assets/css/${name}, which does not exist.`);
        process.exit(1);
      }
    }
    const want = hashes.get(name);
    if (version !== want) {
      if (WRITE) {
        changed = changed.split(full).join(full.replace(/"$/, "").replace(/\?v=[A-Za-z0-9]+$/, "") + `?v=${want}"`);
      } else {
        stale.push(`${f.slice(ROOT.length + 1)}  ${name}  has ?v=${version ?? "(none)"}  expected ?v=${want}`);
      }
    }
  }
  if (WRITE && changed !== src) {
    writeFileSync(f, changed);
    stamped++;
  }
}

if (refs === 0) {
  console.error("CSS VERSION: FAIL -- no stylesheet references found in any page. That is not a pass, it is a broken scan.");
  process.exit(1);
}

if (WRITE) {
  console.log(`CSS VERSION: stamped ${stamped} file(s); ${refs} stylesheet references across ${files.length} pages.`);
  for (const [n, h] of hashes) console.log(`  assets/css/${n} -> ?v=${h}`);
  process.exit(0);
}

if (stale.length) {
  console.error(`CSS VERSION: FAIL -- ${stale.length} stale stylesheet reference(s). Run: node tools/css-version.mjs --write\n`);
  for (const s of stale.slice(0, 20)) console.error("  " + s);
  if (stale.length > 20) console.error(`  ... and ${stale.length - 20} more`);
  process.exit(1);
}

console.log(`CSS VERSION: PASS -- ${refs} stylesheet references across ${files.length} pages, all matching the current file hashes.`);
for (const [n, h] of hashes) console.log(`  assets/css/${n} -> ?v=${h}`);
