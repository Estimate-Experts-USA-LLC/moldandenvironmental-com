# WEBSITE_COMPLETION_BASELINE.md — measured 2026-08-21

Measured from the repository at production parity, **not** from any handoff summary.
Production SHA at baseline: `09205d9` (GitHub Pages `built`, worktree clean).

---

## Inventory

```
TOTAL_PUBLIC_URLS        = 38
TOTAL_TEMPLATE_FAMILIES  = 9
LEGACY_FLATSOME_DEPENDENT= 17
ELEMENTOR_NATIVE         = 13
BLOG                     = 2 index + 6 articles
SERVICE                  = 9
LOCATION                 = 5
LEGAL                    = 2
CORE                     = 6   (about, credentials, reviews, contact, quote, faqs)
HOME                     = 1
REDIRECT_STUB            = 5
UTILITY                  = 2   (request-received, request-received/error)
```

**The 5 "orphans" are not orphans.** `/contact/`, `/credentials/`,
`/category/uncategorized/` and two retired health-titled URLs
(`/do-i-have-toxic-mold-in-my-home/`, `/do-you-know-the-effects-mold-can-have-on-your-family-health/`)
are already-built stubs carrying `noindex` + a canonical to the live page.

⚠️ **They use `<meta http-equiv="refresh">` + `window.location.replace()`.** Those are
**not** 301s. The canonical + noindex is the correct signal GitHub Pages can express, but
the record must say so: **`REDIRECT_INFRA_REQUIRED`** for any true 301.

---

## Defects found and fixed in Wave 1

| Metric | Before | After |
|---|---|---|
| `BROKEN_ASSETS` (refs) | **173** | **0** |
| `DEAD_LINKS` | 1 (`/xmlrpc.php`) | **0** |
| `UNSUPPORTED_CLAIMS` | 7 "accredited" | **0** |
| `PLACEHOLDERS` | 1 (`[Formaldehyde]`) | **0** |
| `LOREM_IPSUM` | 0 | **0** |
| `PAGES_WITHOUT_H1` | **10** (incl. the homepage) | **0** |
| `PAGES_WITH_MULTIPLE_H1` | 1 | **0** |
| `MISSING_META_DESCRIPTION` | **16** (2 of them `content=" "`) | **0** |
| `DUPLICATE_TITLES` / `DUPLICATE_META` / `MISSING_CANONICAL` | 0 / 0 / 0 | 0 / 0 / 0 |
| `DUPLICATE_NAVS` / `DUPLICATE_FOOTERS` | 0 | 0 |
| `DEAD_FORMS` / `FORM_SUBMIT_REFS` | 0 / 0 | 0 / 0 |
| Console errors (17 legacy pages) | **324** | **0** |

### What was removed
```
173  <script src="/wp-includes/...">   jQuery, jquery-migrate, hooks, i18n,
                                       wp-polyfill, hoverIntent, ui/core,
                                       comment-reply -- never exported, all 404
 85  <link rel="prefetch">             flatsome JS chunks that 404
 31  <link rel="EditURI">              xmlrpc.php?rsd
 17  <link rel="pingback">             /xmlrpc.php -- a dead WP endpoint presented as live
 17  ie-fallback.css                   404
 17  ie-flexibility.js                 404
 17  html5shiv                         external IE shim
 13  wp-emoji module loader            fetched wp-emoji-release.min.js -> 404
  1  wlwmanifest.xml                   dead WP artifact
 58  srcset candidates                 advertised 768w files that do not exist
```

### 🔑 The srcset defect is the one worth remembering
Images looked fine on desktop and broke on tablet and mobile. `srcset` advertised a
**768w** variant the export never produced, so narrow viewports selected a missing
candidate and the image failed — while desktop chose the 1024w that exists.
**A desktop-only check would have passed this site indefinitely.**

---

## Measurement errors of my own, recorded

1. **The broken-asset regex required a closing quote right after the path**, so it
   silently skipped **every** URL with `?ver=` — reporting `0 broken assets` while the
   browser logged 324 console errors. The contradiction is what exposed it.
   **A zero that disagrees with an observation is a broken probe until proven otherwise.**
2. **The empty-band detector produced four false positives** across this program:
   text-length ignoring images, absolutely-positioned layers, and finally elements that
   *are* media rather than *contain* it. It now requires: no text **and** not media
   **and** in normal flow.
3. **A 350ms wait produced false `brokenimg` flags** on lazily-loaded images; raised to
   900ms, after which the remaining flags proved real (the srcset defect above).

---

## QA coverage at baseline close

```
LEGACY 17/17   x 390 / 768 / 1440  = 51 inspections   ISSUES 0   CONSOLE ERRORS 0
MODERN 14      x 390 / 768 / 1440  = 42 inspections   ISSUES 0
TOTAL                                93 inspections   ISSUES 0
```
Per-page, not sampled. Checks: HTTP, overflow, single correctly-sized logo, header full
width, footer present, off-canvas hidden, no bullet nav, nav contrast (16.48 vs a 4.5
threshold), certification badges, broken images, empty bands, FormSubmit, dead submits,
desktop main-nav visibility.

## Containment — unchanged
```
NON_SEARCH_FORMS = 0    FORMSUBMIT = 0    DEAD_SUBMITS = 0
PHONE = LIVE            EMAIL = LIVE      ONLINE SUBMISSION = CONTAINMENT
```

## Still outstanding (not claimed as done)
Design-system consolidation · copy rewrite of the remaining legacy pages · service-area
source of truth · location-page uniqueness · schema · accessibility audit · performance
measurement · GBP · canonical form frontend · knowledge-center rewrite.
