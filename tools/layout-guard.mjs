#!/usr/bin/env node
/**
 * LAYOUT GUARD -- measures the rendered page in a real browser.
 *
 * Every defect this catches was invisible to the two static guards next to it,
 * because none of them is a property of the HTML source. They are properties of
 * the layout: what colour ended up on top of what background, which element's
 * min-content width forced a scrollbar, whether two headings share a left rail.
 * Grep cannot see any of that. A browser can.
 *
 * The four it was written from, all measured on this site on 2026-08-21:
 *   1. .me-panel is a LIGHT island; inside .me-section--dark it inherited white
 *      body text. The street address rendered at 1.03:1 -- invisible.
 *   2. .me-step p kept --text-2 (a grey chosen for white) on --ink: 3.17:1.
 *   3. The email address is a 30-char unbreakable token. Its min-content width
 *      forced the panel column to 373px inside a 344px body, so EVERY page
 *      scrolled sideways on a phone.
 *   4. .me-hero__inner used `padding: X 0 Y`, whose `0` wiped the container's
 *      horizontal padding -- the H1 sat 24px left of every other heading, and had
 *      no inset at all from a phone's screen edge.
 *
 * Run: node tools/layout-guard.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8791";
const ROOT = process.cwd();

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 900 },
];

/* Only pages on the component system: the legacy templates have their own
   (worse) layout and are being replaced, not guarded. */
function pagesOnComponentSystem(dir = ROOT, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "wp-content") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) pagesOnComponentSystem(p, out);
    else if (e.name === "index.html" && readFileSync(p, "utf8").includes("me-home.css"))
      out.push("/" + p.slice(ROOT.length + 1).replace(/\\/g, "/").replace(/index\.html$/, ""));
  }
  return out.sort();
}

const PROBE = () => {
  const issues = [];
  const vw = document.documentElement.clientWidth;

  const lum = (r, g, b) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const rgb = (s) => { const m = s.match(/(\d+(?:\.\d+)?)/g); return m ? m.slice(0, 3).map(Number) : null; };
  const alpha = (s) => { const m = s.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/); return m ? parseFloat(m[1]) : 1; };
  const ratio = (fg, bg) => {
    const a = lum(...fg), b = lum(...bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };

  /* The ACTUAL painted background: walk up until something opaque is found.
     Assuming "white" is how a contrast defect was once INVENTED on this site and
     a regression shipped from it. Over a background image, return null and judge
     nothing -- an unknown answer is not a passing one. */
  const bgOf = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
      const c = cs.backgroundColor;
      if (c && c !== "transparent" && alpha(c) > 0.5) return rgb(c);
    }
    return [255, 255, 255];
  };

  // -- proof this ran against a laid-out document, not a blank/hidden one
  if (document.body.getBoundingClientRect().height < 200) issues.push("NO_LAYOUT: body under 200px tall");
  if (!document.querySelector("main section")) issues.push("NO_SECTIONS: nothing to measure");

  // 1. horizontal overflow
  if (document.documentElement.scrollWidth > vw + 1)
    issues.push(`H_OVERFLOW scrollWidth=${document.documentElement.scrollWidth} viewport=${vw}`);

  // 2. section headings share one left rail (split columns follow their own column)
  const rails = [...document.querySelectorAll("main section")]
    .map((s) => {
      const h = s.querySelector(".me-eyebrow, h1, h2");
      if (!h || h.closest(".me-split")) return null;
      return +h.getBoundingClientRect().left.toFixed(1);
    })
    .filter((v) => v !== null);
  if (rails.length > 1 && Math.max(...rails) - Math.min(...rails) > 1)
    issues.push(`RAIL_SPREAD ${(Math.max(...rails) - Math.min(...rails)).toFixed(1)}px rails=${[...new Set(rails)].join(",")}`);

  // 3. hero copy inset from the screen edge
  const h1 = document.querySelector(".me-hero__copy h1");
  if (h1 && h1.getBoundingClientRect().left < 16)
    issues.push(`HERO_EDGE h1 left=${h1.getBoundingClientRect().left.toFixed(1)}`);

  // 4. contrast against the real background
  const seen = new Set();
  for (const el of document.querySelectorAll(
    "main p, main li, main h1, main h2, main h3, main a, main dd, main dt, main summary, main cite, main blockquote, .me-footer a, .me-footer p, .me-footer li"
  )) {
    if (!el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const fg = rgb(cs.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const size = parseFloat(cs.fontSize);
    const need = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700) ? 3.0 : 4.5;
    const c = ratio(fg, bg);
    if (c < need) {
      const key = `${cs.color}|${bg}|${Math.round(size)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(`CONTRAST ${c.toFixed(2)}:1 (need ${need}) ${cs.color} on rgb(${bg.join(",")}) ${Math.round(size)}px "${el.textContent.trim().slice(0, 40)}"`);
    }
  }

  // 5. bands that occupy height and show nothing
  for (const el of document.querySelectorAll("main section, main section > div")) {
    const cs = getComputedStyle(el);
    if (cs.position === "absolute" || cs.position === "fixed") continue;
    if (el.getBoundingClientRect().height < 120) continue;
    if (el.textContent.trim()) continue;
    if (el.querySelector("img,svg,video,picture,canvas,iframe")) continue;
    if (cs.backgroundImage !== "none") continue;
    issues.push(`EMPTY_BAND <${el.tagName.toLowerCase()} class="${el.className}">`);
  }

  // 6. contact details must not break mid-token on a desktop layout.
  //    The footer email is 265px on one line in a 281px column -- it fits, but by
  //    6px, and before the grid was rebalanced it rendered as
  //    "moldandenvironmental@gmail.co / m". A phone number or address split across
  //    two lines is a commercial defect, not a cosmetic one. On phones the
  //    overflow-wrap safety net is allowed to do its job, so this is desktop-only.
  //
  //    Measured with Range client rects, NOT box height. The first version of this
  //    check compared height against line-height and flagged every .me-btn on the
  //    site: a button is 52px tall by design with a 26px line box, and its label
  //    was never wrapped. A text run that wraps produces more than one client
  //    rect; that is the actual question, and box height is not a proxy for it.
  if (vw >= 900) {
    for (const a of document.querySelectorAll('a[href^="mailto:"], a[href^="tel:"]')) {
      const node = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!node) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = range.getClientRects().length;
      if (lines > 1)
        issues.push(`CONTACT_WRAPS "${a.textContent.trim().slice(0, 34)}" across ${lines} lines`);
    }
  }

  // 6. thumb-sized tap targets on phones
  if (vw < 500) {
    for (const a of document.querySelectorAll("main a.me-btn, main a.me-textlink")) {
      const h = a.getBoundingClientRect().height;
      if (h > 0 && h < 44) issues.push(`TAP_TARGET ${Math.round(h)}px "${a.textContent.trim().slice(0, 24)}"`);
    }
  }

  return issues;
};

const allPages = pagesOnComponentSystem();
if (allPages.length === 0) {
  console.error("LAYOUT GUARD: FAIL -- found no pages using me-home.css. Refusing to pass on an empty set.");
  process.exit(1);
}

/* LAYOUT_GUARD_PAGES scopes the run (the null control uses it to avoid ~350 page
   loads). A name that matches nothing is a hard failure, not a smaller run: a
   filter that silently selects zero pages is the classic way to produce a
   flawless green that measured nothing at all. */
let pages = allPages;
const want = (process.env.LAYOUT_GUARD_PAGES || "").split(",").map((s) => s.trim()).filter(Boolean);
if (want.length) {
  const missing = want.filter((w) => !allPages.includes(w));
  if (missing.length) {
    console.error(`LAYOUT GUARD: FAIL -- LAYOUT_GUARD_PAGES names ${missing.length} page(s) that are not on the component system: ${missing.join(", ")}`);
    process.exit(1);
  }
  pages = want;
  console.log(`LAYOUT GUARD: scoped to ${pages.length} of ${allPages.length} pages via LAYOUT_GUARD_PAGES`);
}

/* CI uses the bundled Chromium. Some Windows boxes cannot start it (it fails
   with a side-by-side configuration error), so PW_CHANNEL=chrome runs the
   system Chrome instead -- same engine, so the measurements agree. */
const channel = process.env.PW_CHANNEL || undefined;
const browser = await chromium.launch(channel ? { channel } : {});
let inspections = 0;
const failures = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  for (const path of pages) {
    const res = await page.goto(BASE + path, { waitUntil: "load" });
    if (!res || !res.ok()) {
      failures.push({ path, vp: vp.name, issues: [`HTTP ${res ? res.status() : "no response"}`] });
      inspections++;
      continue;
    }
    await page.waitForTimeout(120);
    const issues = await page.evaluate(PROBE);
    inspections++;
    if (issues.length) failures.push({ path, vp: vp.name, issues });
  }
  await ctx.close();
}
await browser.close();

if (failures.length) {
  console.error(`LAYOUT GUARD: FAIL -- ${failures.length} of ${inspections} inspections found problems.\n`);
  for (const f of failures) {
    console.error(`  ${f.path}  [${f.vp}]`);
    for (const i of f.issues) console.error(`      ${i}`);
  }
  process.exit(1);
}

console.log(`LAYOUT GUARD: PASS -- ${pages.length} pages x ${VIEWPORTS.length} viewports = ${inspections} inspections, 0 layout defects.`);
