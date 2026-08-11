# ddnyc-embed

Prediction-ledger widgets for embedding in Webflow (or any host page).
One `<script>` tag; each widget mounts into an empty `<div>` you place freely.

---

## 1. Host the files

Push this folder to a GitHub repo and enable **Settings → Pages → Deploy from
branch**. The folder must keep its shape — the script finds the JSON relative
to its own URL:

```
ddnyc-embed.js
data/
  corpus_meta.json
  predictions_public.json
  terms.json
  topic_accuracy.json
  format_timeline.json
  infra_vs_apps.json
```

## 2. Add the script once, in Webflow

**Project Settings → Custom Code → Footer Code** (or a page-level footer):

```html
<script src="https://USERNAME.github.io/REPO/ddnyc-embed.js" defer></script>
```

If you keep the JSON somewhere else, point at it explicitly:

```html
<script src="https://USERNAME.github.io/REPO/ddnyc-embed.js"
        data-base="https://cdn.example.com/ddnyc-data/" defer></script>
```

## 3. Drop an Embed element wherever you want a widget

In Webflow: **Add → Components → Embed**, then paste one line. Each id may be
used once per page. Order and placement are entirely yours.

| Paste this | What appears |
|---|---|
| `<div id="ddnyc-summary"></div>` | Headline counts: talks, words, predictions, scored, not-yet-due, year range |
| `<div id="ddnyc-chart-death-curve"></div>` | Line chart — hadoop, data scientist, big data, data lake (per 10k words) |
| `<div id="ddnyc-chart-birth-curve"></div>` | Line chart — token, gpu, inference, agentic, evals (same y-scale as above) |
| `<div id="ddnyc-chart-term-grid"></div>` | Small-multiples grid, 12 terms, full arcs with peak labels |
| `<div id="ddnyc-chart-term-grid-all"></div>` | All 47 terms as small multiples, sorted by peak year — collapsed behind a toggle |
| `<div id="ddnyc-chart-groups"></div>` | Bar chart — infrastructure vs applications accuracy, with n and z-test |
| `<div id="ddnyc-chart-topics"></div>` | Bar chart — accuracy by topic; underpowered bars hatched |
| `<div id="ddnyc-chart-formats"></div>` | Stacked columns — talks per year by format |
| `<div id="ddnyc-chart-questions"></div>` | Dual-axis — questions per talk vs mean question length |
| `<div id="ddnyc-chart-verdict-mix"></div>` | 100%-stacked verdict composition, infrastructure vs applications, with n labels |
| `<div id="ddnyc-chart-predictions-per-talk"></div>` | Predictions per talk by year, with the 2020 format-era boundary marked |
| `<div id="ddnyc-chart-duration-by-format"></div>` | Median duration by year — presentation+Q&A vs interview, thin cells omitted |
| `<div id="ddnyc-chart-open-queue"></div>` | The 86 dated open predictions by due year, tail bucketed after an axis break |
| `<div id="ddnyc-ledger"></div>` | **The full browsable ledger** — filter, search, sort, expandable rows |
| `<div id="ddnyc-caveats"></div>` | Methodology caveats list (text comes from `corpus_meta.json`) |

Nothing else is required. The script scans for these ids on `DOMContentLoaded`
and mounts whatever it finds.

---

## Notes

**Styling is sealed.** Every widget renders in a shadow root, so your site's CSS
cannot reach in and these styles cannot leak out. The one thing that *does*
cross the boundary is `font-family`, inherited from the div's parent, so widgets
match your typography automatically.

**Recolouring.** Set CSS custom properties on the mount div (or any ancestor):

```css
#ddnyc-ledger {
  --ddnyc-accent: #c2410c;
  --ddnyc-correct: #15803d;
  --ddnyc-incorrect: #b91c1c;
  --ddnyc-ink: #1c1917;
  --ddnyc-panel: #ffffff;
  --ddnyc-rule: #e7e5e4;
}
```

Full list: `--ddnyc-ink`, `--ddnyc-ink-2`, `--ddnyc-dim`, `--ddnyc-rule`,
`--ddnyc-rule-2`, `--ddnyc-panel`, `--ddnyc-accent`, `--ddnyc-accent-soft`,
`--ddnyc-track`, `--ddnyc-mono`, and the verdict colours `--ddnyc-correct`,
`--ddnyc-partial`, `--ddnyc-incorrect`, `--ddnyc-unres`, `--ddnyc-open`.

**Dark mode** follows the visitor's OS setting automatically. Override any token
above to pin it.

**Payload.** The bundle is 36 KB (10 KB gzipped). JSON is fetched at runtime and
cached per file, so a page carrying only charts pulls ~24 KB; the 236 KB
prediction table downloads only when `#ddnyc-ledger` is on the page.

**Manual mounting.** If you inject widgets after page load (a Webflow
interaction, a tab panel), call `DDNYC.mount()` to pick up new divs.
`DDNYC.widgets` lists every supported id; `DDNYC.base` shows the resolved data
URL — useful when a 404 means the path is wrong.

**Chart attribution.** Every chart bakes a source line into the SVG itself, so
the credit survives being screenshotted and reposted:

```
Data Driven NYC / MAD Podcast corpus — 518 talks, 2011–2026
  · hatched = underpowered (n<10) · Jordan Roga · jordanroga.com
```

Order is corpus, then the chart's own note, then the byline. The byline is
compiled in, so nothing in Webflow can drop it. It names the domain rather than
a post URL deliberately — a slug can change, and a screenshot outlives the link
it was cropped from. To change it, edit `CREDIT` at the top of the bundle, or
override per-page with `data-credit="…"` on the script tag (`data-credit=""`
removes it).

**Deep links.** The ledger stores its state in a single `ddnyc` **query
parameter** — not the fragment, because this site uses `#s1`–`#s8` anchors for
section nav and the two would overwrite each other:

```
/the-post?ddnyc=q%3Ahadoop%7Cso%3Aspeaker%7Co%3A101#s5
```

Filters, sort, year range, the unattributed toggle, and the expanded row all
restore on load, so a copied URL reproduces the exact view. Keys: `q` search,
`s` status, `v` verdict, `t` topic, `c` claim type, `so` sort, `y1`/`y2` years,
`u` unattributed, `o` open row.

The all-terms grid uses its own parameter, `ddnyc_terms=1`, so a link to the
expanded grid arrives expanded. The two are independent — changing a ledger
filter leaves `ddnyc_terms` alone and vice versa.

Everything else on the URL is left alone. The fragment passes through verbatim,
so anchor nav keeps working and a filter change will not scroll the page; other
query parameters (`utm_*`, campaign tags) are preserved untouched.

Values are encoded twice — percent-encoded before joining, then again by
`URLSearchParams` — so a search term containing the `|` or `:` delimiters
round-trips intact. The token is authoritative: a key absent from it resets
rather than lingering. Reset removes the parameter and leaves the rest of the
URL alone. A malformed token degrades to defaults rather than rendering an
empty table. Filter changes use `replaceState`, so they never pile up in the
back button.

---

## Local development

The bundle fetches JSON, so `file://` will not work — serve over HTTP:

```bash
cd embed
python3 -m http.server 8000
```

Then open <http://localhost:8000/>. `index.html` mounts all ten widgets and
deliberately applies a serif font plus hostile global CSS (magenta buttons,
dashed inputs) so you can confirm the widgets inherit the font and reject
everything else.

## Updating the data

Regenerate from the analysis pipeline, then copy in:

```bash
python3 analysis/build_web.py
cp analysis/web/*.json embed/data/
```

No rebuild of the JS is needed — it reads whatever is in `data/`.

## Cache-busting after an update

GitHub Pages serves assets with a ten-minute `max-age`, and browsers hold the
bundle longer than that once it is in the disk cache. After pushing a change to
`ddnyc-embed.js`, returning visitors can keep running the old copy — the JSON
updates while the code does not.

Bump a version query on the script tag in Webflow whenever the JS changes:

```html
<script src="https://jordanroga.github.io/ddnyc-embed/ddnyc-embed.js?v=3" defer></script>
```

The query string does not reach the filesystem; it only changes the cache key.
Data files are fetched by the bundle and are not covered by this — for a forced
data refresh, bump the script version too, since `data-base` is resolved from
the script URL.
