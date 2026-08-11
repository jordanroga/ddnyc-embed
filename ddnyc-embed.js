/*!
 * ddnyc-embed.js — Data Driven NYC prediction-ledger widgets.
 *
 * Drop-in embed for Webflow (or any host page). One <script src> tag; each
 * widget mounts into an empty <div id="ddnyc-…"></div> that you place freely.
 *
 *   <script src="https://USER.github.io/REPO/ddnyc-embed.js" defer></script>
 *
 * Every widget renders inside a shadow root, so host CSS cannot reach in and
 * these styles cannot leak out. font-family is inherited from the mount's
 * parent so widgets match the surrounding site.
 *
 * JSON is fetched at runtime (not bundled) and cached per file, so a page with
 * only charts never downloads the 236 KB prediction table.
 *
 * Data base URL resolves from this script's own src; override with
 *   <script src="…/ddnyc-embed.js" data-base="https://cdn.example.com/data/">
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- config */
  var SCRIPT = document.currentScript ||
    (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var BASE = (function () {
    var override = SCRIPT && SCRIPT.getAttribute('data-base');
    if (override) return override.replace(/\/?$/, '/');
    var src = (SCRIPT && SCRIPT.src) || '';
    return src.replace(/[^/]*$/, '') + 'data/';
  })();

  // Baked into every chart so the attribution survives a screenshot. The domain
  // is used rather than a post URL on purpose: a slug can change, and a
  // screenshot outlives the link it was cropped from.
  // data-credit on the script tag overrides this; data-credit="" removes it.
  var SOURCE_LINE = 'Data Driven NYC / MAD Podcast corpus — 518 talks, 2011–2026';
  var CREDIT = 'Jordan Roga · jordanroga.com';
  if (SCRIPT && SCRIPT.hasAttribute('data-credit')) {
    CREDIT = SCRIPT.getAttribute('data-credit') || '';
  }

  /* ------------------------------------------------------------ data cache */
  var cache = {};
  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(BASE + name + '.json', { credentials: 'omit' })
        .then(function (r) {
          if (!r.ok) throw new Error(name + '.json → HTTP ' + r.status);
          return r.json();
        });
    }
    return cache[name];
  }

  /* ------------------------------------------------- shared URL query state */
  // Widgets that persist state use their own top-level query parameter rather
  // than sharing one token, so each can rewrite its own key without having to
  // know about the others. Everything else on the URL — the fragment the host
  // page uses for section anchors, utm_* tags — is passed through untouched.
  function getParam(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch (e) { return null; }
  }
  function setParam(name, value) {
    var sp;
    try { sp = new URLSearchParams(location.search); } catch (e) { return; }
    if (value == null) sp['delete'](name); else sp.set(name, value);
    var qs = sp.toString();
    try {
      history.replaceState(null, '',
        location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch (e) { /* file:// and sandboxed frames disallow replaceState */ }
  }

  /* ---------------------------------------------------------------- styles */
  /* Scoped inside each shadow root. Deliberately sets no font-family on the
     host so the widget inherits the surrounding page's typeface. */
  var CSS = `
:host{all:initial;font-family:inherit;color:var(--ddnyc-ink,#16181c);display:block;
  --ink:var(--ddnyc-ink,#16181c);--ink2:var(--ddnyc-ink-2,#454c57);--dim:var(--ddnyc-dim,#6f7783);
  --rule:var(--ddnyc-rule,#e0e3e9);--rule2:var(--ddnyc-rule-2,#edeff3);
  --panel:var(--ddnyc-panel,#fff);--accent:var(--ddnyc-accent,#2f5fb3);
  --soft:var(--ddnyc-accent-soft,#eef2fa);--track:var(--ddnyc-track,#eceef2);
  --correct:var(--ddnyc-correct,#1d8a60);--partial:var(--ddnyc-partial,#a9781b);
  --incorrect:var(--ddnyc-incorrect,#c04a3a);--unres:var(--ddnyc-unres,#6f7783);
  --open:var(--ddnyc-open,#4a63ad);
  --mono:var(--ddnyc-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);}
@media (prefers-color-scheme:dark){:host{
  --ink:var(--ddnyc-ink,#e8eaee);--ink2:var(--ddnyc-ink-2,#b3b9c4);--dim:var(--ddnyc-dim,#868e9b);
  --rule:var(--ddnyc-rule,#2b2f37);--rule2:var(--ddnyc-rule-2,#23262d);
  --panel:var(--ddnyc-panel,#1a1d22);--accent:var(--ddnyc-accent,#7ea6e8);
  --soft:var(--ddnyc-accent-soft,#1d2534);--track:var(--ddnyc-track,#262a31);
  --correct:var(--ddnyc-correct,#3fb083);--partial:var(--ddnyc-partial,#d3a03c);
  --incorrect:var(--ddnyc-incorrect,#e0705c);--unres:var(--ddnyc-unres,#8b93a0);
  --open:var(--ddnyc-open,#7b90d8);}}
*{box-sizing:border-box}
svg{width:100%;height:auto;display:block;font-family:inherit}
.grid{stroke:var(--rule2);stroke-width:1}
.line{fill:none;stroke-linejoin:round;stroke-linecap:round}
.tick{font-size:10.5px;fill:var(--dim);font-variant-numeric:tabular-nums}
.axis{font-size:11px;fill:var(--ink2);font-weight:600}
.legend{font-size:11.5px;fill:var(--ink2)}
.src{font-size:9.5px;fill:var(--dim)}
.blab{font-size:12px;fill:var(--ink)}
.blab.dim{fill:var(--dim)}
.bval{font-size:11px;fill:var(--ink2);font-variant-numeric:tabular-nums}
.seglab{font-size:10.5px;fill:#fff;font-weight:600;font-variant-numeric:tabular-nums}
.rule{stroke:var(--dim);stroke-width:1.2}
.brk{stroke:var(--rule);stroke-width:2}
.btrack{fill:var(--track)}
.mtitle{font-size:11.5px;font-weight:650;fill:var(--ink)}
.mpeak{font-size:9.5px;fill:var(--dim)}
.grid-wrap{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}
/* The 47-panel appendix packs tighter than the curated grid; below 420px it
   collapses to a single column, where a 200px-wide panel would otherwise
   force the peak label to overlap the term name. */
.grid-wrap.dense{grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:9px}
@media (max-width:420px){.grid-wrap.dense{grid-template-columns:1fr}}
.tgl{display:flex;align-items:center;gap:10px;margin:2px 0 12px}
.tgl button{padding:8px 14px;border:1px solid var(--rule);background:var(--panel);
  border-radius:20px;cursor:pointer;color:var(--ink);font-size:13.5px;font-weight:600}
.tgl button:hover{border-color:var(--accent);color:var(--accent)}
.tgl span{font-size:12.5px;color:var(--dim)}
.grid-wrap svg{background:var(--panel);border:1px solid var(--rule);border-radius:8px}
.stats{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}
.stat{display:flex;flex-direction:column;gap:2px}
.stat b{font-size:22px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.stat span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);font-weight:600}
ul.caveats{margin:0;padding-left:18px}
ul.caveats li{font-size:14px;color:var(--ink2);margin-bottom:6px;line-height:1.5}
/* ledger */
.ctrls{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:14px;margin-bottom:12px}
.c{display:flex;flex-direction:column;gap:5px;min-width:0}
.c.wide{grid-column:1/-1}
.c label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);font-weight:650}
input,select,button{font-family:inherit;font-size:14px}
input[type=search],select{padding:8px 10px;border:1px solid var(--rule);border-radius:6px;
  background:var(--panel);color:var(--ink);width:100%}
.yrow{display:flex;gap:8px;align-items:center}
.yrow input{flex:1;min-width:0}
.yout{font-family:var(--mono);font-size:12px;color:var(--ink);text-transform:none;letter-spacing:0}
.chk{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink2);
  text-transform:none;letter-spacing:0;font-weight:400}
.chk input{width:16px;height:16px}
.btn{padding:7px 12px;border:1px solid var(--rule);background:var(--panel);border-radius:6px;
  cursor:pointer;color:var(--ink2);font-size:13px}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.bar{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;
  padding:4px 2px 10px;font-size:13.5px;color:var(--ink2);border-bottom:1px solid var(--rule)}
.sorts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--dim)}
.sbtn{padding:4px 9px;border:1px solid var(--rule);background:var(--panel);border-radius:20px;
  cursor:pointer;color:var(--ink2);font-size:12.5px}
.sbtn.on{background:var(--ink);border-color:var(--ink);color:var(--panel)}
.rows{display:flex;flex-direction:column}
.row{border-bottom:1px solid var(--rule2)}
.row.open{background:var(--panel);border-bottom-color:var(--rule)}
.rhead{display:grid;grid-template-columns:160px 1fr auto;gap:14px;align-items:start;width:100%;
  text-align:left;background:none;border:0;padding:12px 4px;cursor:pointer;color:inherit;font-size:14px}
.rhead:hover{background:var(--soft)}
.rmeta{display:flex;flex-direction:column;gap:1px;min-width:0}
.ryear{font-family:var(--mono);font-size:12px;color:var(--dim)}
.rspk{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis}
.rco{font-size:12px;color:var(--dim);overflow:hidden;text-overflow:ellipsis}
.rclaim{font-size:14.5px;line-height:1.45;min-width:0}
.rtail{display:flex;align-items:center;gap:8px;flex-shrink:0}
.chev{width:9px;height:9px;border-right:2px solid var(--dim);border-bottom:2px solid var(--dim);
  transform:rotate(45deg);transition:transform .15s}
.row.open .chev{transform:rotate(-135deg)}
.badge{font-size:11px;font-weight:650;padding:3px 9px;border-radius:20px;white-space:nowrap;
  color:#fff;font-variant-numeric:tabular-nums}
.v-correct{background:var(--correct)}.v-partially_correct{background:var(--partial)}
.v-incorrect{background:var(--incorrect)}.v-unresolvable{background:var(--unres)}
.v-open{background:var(--open)}
.flags{display:flex;gap:4px;flex-wrap:wrap}
.flag{font-size:10px;color:var(--ink2);background:var(--rule2);border-radius:3px;padding:2px 6px;
  white-space:nowrap;cursor:help}
.detail{padding:2px 4px 18px;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
.d h4{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);margin:0 0 4px}
.d p{margin:0 0 4px;font-size:14px;line-height:1.5;color:var(--ink2)}
.d ul{margin:0;padding-left:16px;font-size:13.5px}
.d li{margin-bottom:2px;word-break:break-word}
a{color:var(--accent)}
.dim{color:var(--dim)}
.empty,.err{padding:24px 4px;color:var(--dim);font-size:14px}
.err{color:var(--incorrect)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:3px}
@media (max-width:720px){
  .rhead{grid-template-columns:1fr;gap:8px;padding:14px 4px}
  .rmeta{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:8px}
  .rtail{flex-wrap:wrap}.chev{margin-left:auto}
  .detail{grid-template-columns:1fr}.ctrls{grid-template-columns:1fr}
  .grid-wrap{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
}
@media (prefers-reduced-motion:reduce){*{transition-duration:.01ms!important}}
`;

  /* ------------------------------------------------------------- svg utils */
  var NS = 'http://www.w3.org/2000/svg';
  function E(n, a, t) {
    var e = document.createElementNS(NS, n);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (t !== undefined) e.textContent = t;
    return e;
  }
  function svgEl(w, h) {
    return E('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMidYMid meet', role: 'img' });
  }
  function nice(v) {
    if (v <= 0) return 1;
    var m = Math.pow(10, Math.floor(Math.log10(v))), n = v / m;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * m;
  }
  function srcTag(svg, w, h, extra) {
    // Order: corpus · chart-specific note · byline. The credit closes the line
    // so it reads as attribution rather than as part of the chart's caveat.
    var parts = [SOURCE_LINE];
    if (extra) parts.push(extra);
    if (CREDIT) parts.push(CREDIT);
    svg.appendChild(E('text', { x: w - 8, y: h - 6, 'text-anchor': 'end', class: 'src' },
      parts.join(' · ')));
  }
  var PALETTE = ['#c04a3a', '#d08a3a', '#8a6a4a', '#6f7783', '#1d8a60',
                 '#2f6fb3', '#5a4a9a', '#a9781b', '#3f8f6f'];

  /* --------------------------------------------------------------- charts */
  function lineChart(root, o) {
    var W = 760, H = o.height || 340, M = { t: 26, r: 16, b: 52, l: 54 };
    var yrs = o.years, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var ymax = o.yMax || nice(Math.max.apply(null, o.series.reduce(function (a, s) {
      return a.concat(s.values.filter(function (v) { return v != null; })); }, [])));
    var x = function (i) { return M.l + (i / (yrs.length - 1)) * iw; };
    var y = function (v) { return M.t + ih - (v / ymax) * ih; };
    var svg = svgEl(W, H);
    for (var i = 0; i <= 4; i++) {
      var v = (ymax / 4) * i;
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(E('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' },
        String(+v.toFixed(ymax < 5 ? 1 : 0))));
    }
    yrs.forEach(function (yr, i) {
      if (i % 2 === 0 || i === yrs.length - 1)
        svg.appendChild(E('text', { x: x(i), y: H - M.b + 18, 'text-anchor': 'middle', class: 'tick' }, yr));
    });
    svg.appendChild(E('text', { x: 14, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (M.t + ih / 2) + ')' }, o.yLabel || ''));
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 22, 'text-anchor': 'middle', class: 'axis' }, 'Year'));
    o.series.forEach(function (s, si) {
      var col = s.color || PALETTE[si % PALETTE.length], pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push([x(i), y(v)]); });
      if (!pts.length) return;
      svg.appendChild(E('path', { d: 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L'),
        class: 'line', stroke: col, 'stroke-width': 2.2 }));
      pts.forEach(function (p) { svg.appendChild(E('circle', { cx: p[0], cy: p[1], r: 2.6, fill: col })); });
    });
    var lx = M.l;
    o.series.forEach(function (s, si) {
      svg.appendChild(E('rect', { x: lx, y: 8, width: 11, height: 11, rx: 2,
        fill: s.color || PALETTE[si % PALETTE.length] }));
      svg.appendChild(E('text', { x: lx + 16, y: 18, class: 'legend' }, s.name));
      lx += 22 + s.name.length * 6.4;
    });
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  function smallMultiples(root, o) {
    var wrap = document.createElement('div');
    wrap.className = 'grid-wrap' + (o.dense ? ' dense' : '');
    o.items.forEach(function (it, idx) {
      var W = 240, H = 120, M = { t: 22, r: 8, b: 20, l: 8 };
      var iw = W - M.l - M.r, ih = H - M.t - M.b, yrs = o.years;
      var ymax = nice(Math.max.apply(null, it.values));
      var x = function (i) { return M.l + (i / (yrs.length - 1)) * iw; };
      var y = function (v) { return M.t + ih - (v / ymax) * ih; };
      var col = PALETTE[idx % PALETTE.length];
      var svg = svgEl(W, H);
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: y(0), y2: y(0), class: 'grid' }));
      var pts = it.values.map(function (v, i) { return [x(i), y(v)]; });
      var dLine = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L');
      svg.appendChild(E('path', { d: dLine + 'L' + x(yrs.length - 1).toFixed(1) + ',' + y(0).toFixed(1) +
        'L' + x(0).toFixed(1) + ',' + y(0).toFixed(1) + 'Z', fill: col, 'fill-opacity': .16 }));
      svg.appendChild(E('path', { d: dLine, class: 'line', stroke: col, 'stroke-width': 1.8 }));
      svg.appendChild(E('text', { x: M.l, y: 12, class: 'mtitle' }, it.name));
      // Two decimals everywhere: a third digit overstates the precision of a
      // per-10k rate, and both grids appear on the same page.
      svg.appendChild(E('text', { x: W - M.r, y: 12, 'text-anchor': 'end', class: 'mpeak' },
        'peak ' + it.peakYear + ' · ' + (+it.peak).toFixed(2)));
      svg.appendChild(E('text', { x: M.l, y: H - 6, class: 'tick' }, yrs[0]));
      svg.appendChild(E('text', { x: W - M.r, y: H - 6, 'text-anchor': 'end', class: 'tick' }, yrs[yrs.length - 1]));
      wrap.appendChild(svg);
    });
    root.appendChild(wrap);
    // One attribution strip under the grid rather than per panel — repeating it
    // 47 times would be noise, but a screenshot of the grid still needs to
    // carry its source, so it lives in an SVG rather than in HTML text.
    var strip = svgEl(760, 14);
    srcTag(strip, 760, 20, o.srcExtra);
    strip.setAttribute('style', 'margin-top:6px');
    root.appendChild(strip);
  }

  function barChart(root, o) {
    var rows = o.rows, W = 760, rh = 34, M = { t: 40, r: 96, b: 46, l: 200 };
    var H = M.t + rows.length * rh + M.b, iw = W - M.l - M.r;
    var svg = svgEl(W, H);
    var x = function (v) { return M.l + (v / 100) * iw; };
    var defs = E('defs', {});
    var pat = E('pattern', { id: 'ddh', width: 6, height: 6, patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)' });
    pat.appendChild(E('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#fff', 'stroke-width': 2, 'stroke-opacity': .55 }));
    defs.appendChild(pat); svg.appendChild(defs);
    for (var p = 0; p <= 100; p += 25) {
      svg.appendChild(E('line', { x1: x(p), x2: x(p), y1: M.t - 8, y2: M.t + rows.length * rh, class: 'grid' }));
      svg.appendChild(E('text', { x: x(p), y: M.t - 14, 'text-anchor': 'middle', class: 'tick' }, p + '%'));
    }
    rows.forEach(function (r, i) {
      var yy = M.t + i * rh + 6, bh = rh - 15;
      svg.appendChild(E('text', { x: M.l - 10, y: yy + bh - 3, 'text-anchor': 'end',
        class: r.under ? 'blab dim' : 'blab' }, r.label));
      svg.appendChild(E('rect', { x: M.l, y: yy, width: iw, height: bh, class: 'btrack' }));
      svg.appendChild(E('rect', { x: M.l, y: yy, width: Math.max(1, x(r.pct) - M.l), height: bh, rx: 2,
        fill: r.color, 'fill-opacity': r.under ? .35 : 1 }));
      if (r.under) svg.appendChild(E('rect', { x: M.l, y: yy, width: Math.max(1, x(r.pct) - M.l),
        height: bh, rx: 2, fill: 'url(#ddh)' }));
      svg.appendChild(E('text', { x: W - M.r + 8, y: yy + bh - 3, class: 'bval' },
        r.under ? 'n=' + r.n + ' — underpowered' : r.pct.toFixed(1) + '%  (n=' + r.n + ')'));
    });
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 24, 'text-anchor': 'middle', class: 'axis' },
      o.xLabel || '% rated correct'));
    if (o.note) svg.appendChild(E('text', { x: M.l, y: H - 8, class: 'src' }, o.note));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  // Verdict colours, read from the same custom properties the ledger badges use
  // so a host-page override recolours chart and table together.
  var VERDICT_KEYS = ['correct', 'partially_correct', 'incorrect', 'unresolvable'];
  var VERDICT_VAR = { correct: '--correct', partially_correct: '--partial',
                      incorrect: '--incorrect', unresolvable: '--unres' };
  function verdictFill(k) { return 'var(' + VERDICT_VAR[k] + ')'; }

  /* 100%-stacked horizontal bars: composition within each group, not level.
     Percentages are of the group's own n, so the rows are directly comparable
     even though the groups differ in size. */
  function propBars(root, o) {
    var rows = o.rows, W = 760, rh = 54, M = { t: 46, r: 20, b: 58, l: 150 };
    var H = M.t + rows.length * rh + M.b, iw = W - M.l - M.r;
    var svg = svgEl(W, H);
    var x = function (p) { return M.l + (p / 100) * iw; };
    for (var p = 0; p <= 100; p += 25) {
      svg.appendChild(E('line', { x1: x(p), x2: x(p), y1: M.t - 8,
        y2: M.t + rows.length * rh - 12, class: 'grid' }));
      svg.appendChild(E('text', { x: x(p), y: M.t - 14, 'text-anchor': 'middle', class: 'tick' }, p + '%'));
    }
    rows.forEach(function (r, i) {
      var yy = M.t + i * rh, bh = rh - 24;
      var total = VERDICT_KEYS.reduce(function (a, k) { return a + (r.counts[k] || 0); }, 0);
      svg.appendChild(E('text', { x: M.l - 12, y: yy + bh / 2 + 1, 'text-anchor': 'end',
        class: r.under ? 'blab dim' : 'blab' }, r.label));
      svg.appendChild(E('text', { x: M.l - 12, y: yy + bh / 2 + 15, 'text-anchor': 'end', class: 'bval' },
        'n=' + total + (r.under ? ' — underpowered' : '')));
      var acc = 0;
      VERDICT_KEYS.forEach(function (k) {
        var v = r.counts[k] || 0;
        if (!v) return;
        var pc = 100 * v / total, x0 = x(acc), x1 = x(acc + pc);
        svg.appendChild(E('rect', { x: x0, y: yy, width: Math.max(1, x1 - x0), height: bh,
          fill: verdictFill(k), 'fill-opacity': r.under ? .4 : 1 }));
        // Label inside the segment only when it will actually fit.
        if (x1 - x0 > 42)
          svg.appendChild(E('text', { x: (x0 + x1) / 2, y: yy + bh / 2 + 4,
            'text-anchor': 'middle', class: 'seglab' }, Math.round(pc) + '%'));
        acc += pc;
      });
    });
    var lx = M.l;
    VERDICT_KEYS.forEach(function (k) {
      svg.appendChild(E('rect', { x: lx, y: 10, width: 11, height: 11, rx: 2, fill: verdictFill(k) }));
      svg.appendChild(E('text', { x: lx + 16, y: 20, class: 'legend' }, k.replace(/_/g, ' ')));
      lx += 26 + k.length * 6.2;
    });
    if (o.note) svg.appendChild(E('text', { x: M.l, y: H - 26, class: 'src' }, o.note));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  /* Vertical columns with an optional era boundary rule. */
  function columnChart(root, o) {
    var W = 760, H = o.height || 340, M = { t: 30, r: 16, b: 56, l: 54 };
    var vals = o.values, labels = o.labels, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var ymax = o.yMax || nice(Math.max.apply(null, vals));
    var step = iw / vals.length, bw = Math.min(38, step * .68);
    var x = function (i) { return M.l + (i + .5) * step; };
    var y = function (v) { return M.t + ih - (v / ymax) * ih; };
    var svg = svgEl(W, H);
    for (var i = 0; i <= 4; i++) {
      var v = (ymax / 4) * i;
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(E('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' },
        String(+v.toFixed(ymax < 5 ? 1 : 0))));
    }
    if (o.boundaryIndex != null && o.boundaryIndex > 0) {
      var bx = M.l + o.boundaryIndex * step;
      svg.appendChild(E('line', { x1: bx, x2: bx, y1: M.t - 6, y2: M.t + ih,
        class: 'rule', 'stroke-dasharray': '5 4' }));
      svg.appendChild(E('text', { x: bx + 6, y: M.t + 6, class: 'legend' }, o.boundaryLabel || ''));
    }
    vals.forEach(function (v, i) {
      var thin = o.thin && o.thin.indexOf(labels[i]) >= 0;
      svg.appendChild(E('rect', { x: x(i) - bw / 2, y: y(v), width: bw,
        height: Math.max(1, M.t + ih - y(v)), rx: 2,
        fill: o.color || PALETTE[5], 'fill-opacity': thin ? .35 : 1 }));
      if (o.valueLabels && v > 0)
        svg.appendChild(E('text', { x: x(i), y: y(v) - 5, 'text-anchor': 'middle', class: 'barvalue' },
          o.fmt ? o.fmt(v) : v));
      if (i % (o.tickEvery || 1) === 0 || i === vals.length - 1)
        svg.appendChild(E('text', { x: x(i), y: H - M.b + 18, 'text-anchor': 'middle', class: 'tick' },
          labels[i]));
    });
    svg.appendChild(E('text', { x: 14, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (M.t + ih / 2) + ')' }, o.yLabel || ''));
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 24, 'text-anchor': 'middle', class: 'axis' },
      o.xLabel || 'Year'));
    if (o.note) svg.appendChild(E('text', { x: M.l, y: H - 8, class: 'src' }, o.note));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  /* Line chart that BREAKS at nulls instead of interpolating, so a suppressed
     thin cell reads as absent data rather than as a measured value. */
  function gapLineChart(root, o) {
    var W = 760, H = o.height || 340, M = { t: 30, r: 16, b: 56, l: 54 };
    var yrs = o.years, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var flat = o.series.reduce(function (a, s) {
      return a.concat(s.values.filter(function (v) { return v != null; })); }, []);
    var ymax = o.yMax || nice(Math.max.apply(null, flat));
    var x = function (i) { return M.l + (i / (yrs.length - 1)) * iw; };
    var y = function (v) { return M.t + ih - (v / ymax) * ih; };
    var svg = svgEl(W, H);
    for (var i = 0; i <= 4; i++) {
      var v = (ymax / 4) * i;
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(E('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' },
        String(Math.round(v))));
    }
    yrs.forEach(function (yr, i) {
      if (i % 2 === 0 || i === yrs.length - 1)
        svg.appendChild(E('text', { x: x(i), y: H - M.b + 18, 'text-anchor': 'middle', class: 'tick' }, yr));
    });
    o.series.forEach(function (s, si) {
      var col = s.color || PALETTE[si % PALETTE.length], seg = [];
      var flush = function () {
        if (seg.length > 1)
          svg.appendChild(E('path', { d: 'M' + seg.map(function (p) { return p.join(' '); }).join('L'),
            class: 'line', stroke: col, 'stroke-width': 2.2 }));
        else if (seg.length === 1)   // lone point with gaps either side
          svg.appendChild(E('circle', { cx: seg[0][0], cy: seg[0][1], r: 3, fill: col }));
        seg = [];
      };
      s.values.forEach(function (v, i) {
        if (v == null) { flush(); return; }
        seg.push([x(i), y(v)]);
      });
      flush();
      s.values.forEach(function (v, i) {
        if (v != null) svg.appendChild(E('circle', { cx: x(i), cy: y(v), r: 2.6, fill: col }));
      });
    });
    var lx = M.l;
    o.series.forEach(function (s, si) {
      var col = s.color || PALETTE[si % PALETTE.length];
      svg.appendChild(E('rect', { x: lx, y: 10, width: 11, height: 11, rx: 2, fill: col }));
      svg.appendChild(E('text', { x: lx + 16, y: 20, class: 'legend' }, s.name));
      lx += 26 + s.name.length * 6.2;
    });
    svg.appendChild(E('text', { x: 14, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(-90 14 ' + (M.t + ih / 2) + ')' }, o.yLabel || ''));
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 24, 'text-anchor': 'middle', class: 'axis' }, 'Year'));
    if (o.note) svg.appendChild(E('text', { x: M.l, y: H - 8, class: 'src' }, o.note));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  function stackedBars(root, o) {
    var W = 760, H = 340, M = { t: 26, r: 16, b: 52, l: 46 };
    var yrs = o.years, keys = o.keys, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var totals = yrs.map(function (_, i) {
      return keys.reduce(function (a, k) { return a + o.data[k][i]; }, 0); });
    var ymax = nice(Math.max.apply(null, totals));
    var bw = Math.min(34, (iw / yrs.length) * .72);
    var x = function (i) { return M.l + (i + .5) * (iw / yrs.length); };
    var y = function (v) { return M.t + ih - (v / ymax) * ih; };
    var svg = svgEl(W, H);
    for (var i = 0; i <= 4; i++) {
      var v = (ymax / 4) * i;
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'grid' }));
      svg.appendChild(E('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'tick' }, v));
    }
    yrs.forEach(function (yr, i) {
      var acc = 0;
      keys.forEach(function (k, ki) {
        var val = o.data[k][i];
        if (val > 0) {
          svg.appendChild(E('rect', { x: x(i) - bw / 2, y: y(acc + val), width: bw,
            height: Math.max(0, y(acc) - y(acc + val)), fill: PALETTE[ki % PALETTE.length] }));
          acc += val;
        }
      });
      if (i % 2 === 0 || i === yrs.length - 1)
        svg.appendChild(E('text', { x: x(i), y: H - M.b + 18, 'text-anchor': 'middle', class: 'tick' }, yr));
    });
    var lx = M.l;
    keys.forEach(function (k, ki) {
      svg.appendChild(E('rect', { x: lx, y: 8, width: 11, height: 11, rx: 2, fill: PALETTE[ki % PALETTE.length] }));
      svg.appendChild(E('text', { x: lx + 16, y: 18, class: 'legend' }, k.replace(/_/g, ' ')));
      lx += 22 + k.length * 6.2;
    });
    svg.appendChild(E('text', { x: 12, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(-90 12 ' + (M.t + ih / 2) + ')' }, o.yLabel || 'Talks'));
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 22, 'text-anchor': 'middle', class: 'axis' }, 'Year'));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  function dualAxis(root, o) {
    var W = 760, H = 340, M = { t: 26, r: 60, b: 52, l: 52 };
    var yrs = o.years, iw = W - M.l - M.r, ih = H - M.t - M.b;
    var lmax = nice(Math.max.apply(null, o.left.values.filter(function (v) { return v != null; })));
    var rmax = nice(Math.max.apply(null, o.rights.reduce(function (a, s) {
      return a.concat(s.values.filter(function (v) { return v != null; })); }, [])));
    var x = function (i) { return M.l + (i / (yrs.length - 1)) * iw; };
    var yl = function (v) { return M.t + ih - (v / lmax) * ih; };
    var yr2 = function (v) { return M.t + ih - (v / rmax) * ih; };
    var svg = svgEl(W, H);
    for (var i = 0; i <= 4; i++) {
      var lv = (lmax / 4) * i;
      svg.appendChild(E('line', { x1: M.l, x2: W - M.r, y1: yl(lv), y2: yl(lv), class: 'grid' }));
      svg.appendChild(E('text', { x: M.l - 8, y: yl(lv) + 4, 'text-anchor': 'end', class: 'tick' }, lv));
      svg.appendChild(E('text', { x: W - M.r + 8, y: yr2((rmax / 4) * i) + 4, class: 'tick' }, (rmax / 4) * i));
    }
    yrs.forEach(function (yv, i) {
      if (i % 2 === 0 || i === yrs.length - 1)
        svg.appendChild(E('text', { x: x(i), y: H - M.b + 18, 'text-anchor': 'middle', class: 'tick' }, yv));
    });
    if (o.leftAs === 'line') {
      // Drawn heavier than the right-hand series: the left axis carries the
      // claim, and the secondary line is there to be compared against it.
      var lpts = [];
      o.left.values.forEach(function (v, i) { if (v != null) lpts.push([x(i), yl(v)]); });
      svg.appendChild(E('path', { d: 'M' + lpts.map(function (p) {
        return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L'),
        class: 'line', stroke: PALETTE[5], 'stroke-width': 3 }));
      lpts.forEach(function (p) {
        svg.appendChild(E('circle', { cx: p[0], cy: p[1], r: 3.4, fill: PALETTE[5] })); });
    } else {
      var bw = Math.min(26, (iw / yrs.length) * .6);
      o.left.values.forEach(function (v, i) {
        if (v == null) return;
        svg.appendChild(E('rect', { x: x(i) - bw / 2, y: yl(v), width: bw, height: M.t + ih - yl(v),
          fill: PALETTE[5], 'fill-opacity': .5 }));
      });
    }
    o.rights.forEach(function (s, si) {
      var col = PALETTE[si], pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push([x(i), yr2(v)]); });
      svg.appendChild(E('path', { d: 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L'),
        class: 'line', stroke: col, 'stroke-width': 2.2, 'stroke-dasharray': si ? '4 3' : null }));
      pts.forEach(function (p) { svg.appendChild(E('circle', { cx: p[0], cy: p[1], r: 2.6, fill: col })); });
    });
    var lx = M.l;
    [{ name: o.left.name, c: PALETTE[5] }].concat(o.rights.map(function (s, si) {
      return { name: s.name, c: PALETTE[si] }; })).forEach(function (s) {
      svg.appendChild(E('rect', { x: lx, y: 8, width: 11, height: 11, rx: 2, fill: s.c }));
      svg.appendChild(E('text', { x: lx + 16, y: 18, class: 'legend' }, s.name));
      lx += 22 + s.name.length * 6.2;
    });
    svg.appendChild(E('text', { x: 12, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(-90 12 ' + (M.t + ih / 2) + ')' }, o.leftLabel));
    svg.appendChild(E('text', { x: W - 10, y: M.t + ih / 2, class: 'axis', 'text-anchor': 'middle',
      transform: 'rotate(90 ' + (W - 10) + ' ' + (M.t + ih / 2) + ')' }, o.rightLabel));
    svg.appendChild(E('text', { x: M.l + iw / 2, y: H - 22, 'text-anchor': 'middle', class: 'axis' }, 'Year'));
    srcTag(svg, W, H, o.srcExtra);
    root.appendChild(svg);
  }

  /* ---------------------------------------------------------------- ledger */
  var VLABEL = { correct: 'Correct', partially_correct: 'Partially correct',
    incorrect: 'Incorrect', unresolvable: 'Unresolvable' };
  var VORDER = { correct: 0, partially_correct: 1, incorrect: 2, unresolvable: 3 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function pdate(d) { return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8); }

  function ledger(root, data, meta, opts) {
    var PRED = data;
    var st = { q: '', status: '', verdict: '', topic: '', type: '',
      yFrom: 2012, yTo: 2026, unattr: false, sort: 'date', open: null };
    var topics = (function () {
      var s = {}; PRED.forEach(function (p) { p.topics.forEach(function (t) { s[t] = 1; }); });
      return Object.keys(s).sort();
    })();

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="ctrls">' +
        '<div class="c wide"><label for="q">Search claims and speakers</label>' +
          '<input type="search" id="q" autocomplete="off"></div>' +
        '<div class="c"><label for="fs">Status</label><select id="fs">' +
          '<option value="">All</option><option value="scoreable">Scored</option>' +
          '<option value="too_early">Not yet due</option></select></div>' +
        '<div class="c"><label for="fv">Verdict</label><select id="fv">' +
          '<option value="">All</option><option value="correct">Correct</option>' +
          '<option value="partially_correct">Partially correct</option>' +
          '<option value="incorrect">Incorrect</option>' +
          '<option value="unresolvable">Unresolvable</option></select></div>' +
        '<div class="c"><label for="ft">Topic</label><select id="ft"><option value="">All</option>' +
          topics.map(function (t) { return '<option value="' + esc(t) + '">' + esc(t) + '</option>'; }).join('') +
          '</select></div>' +
        '<div class="c"><label for="fc">Claim type</label><select id="fc">' +
          '<option value="">All</option><option value="precise">Precise</option>' +
          '<option value="directional">Directional</option></select></div>' +
        '<div class="c"><label>Years <span class="yout" id="yo"></span></label>' +
          '<div class="yrow"><input type="range" id="y1" min="2012" max="2026" step="1">' +
          '<input type="range" id="y2" min="2012" max="2026" step="1"></div></div>' +
        '<div class="c"><label class="chk"><input type="checkbox" id="ua">' +
          '<span>Show unattributed speakers</span></label>' +
          '<button type="button" class="btn" id="rs">Reset</button></div>' +
      '</div>' +
      '<div class="bar"><span id="cnt"></span><span class="sorts">Sort: ' +
        ['date', 'speaker', 'verdict', 'due'].map(function (s) {
          return '<button type="button" class="sbtn' + (s === 'date' ? ' on' : '') +
            '" data-s="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>'; }).join('') +
      '</span></div><div class="rows" id="rows"></div><div class="empty" id="mt" hidden>No matches.</div>';
    root.appendChild(wrap);
    var $ = function (s) { return wrap.querySelector(s); };

    /* ------------------------------------------------ URL query deep-links */
    // State lives in one namespaced "ddnyc" query parameter, not the fragment:
    // the host page uses the fragment for its own section anchors, and the two
    // would overwrite each other. The fragment is preserved untouched on write,
    // so anchor navigation and a shared filter URL coexist.
    //
    // Encoding is deliberately doubled. Values are percent-encoded before being
    // joined with "|", then URLSearchParams encodes the whole token again on
    // write and decodes one layer on read — so a search term containing the
    // "|" or ":" delimiters survives the round trip intact.
    var PARAM = 'ddnyc';
    var HMAP = [['q', 'q'], ['status', 's'], ['verdict', 'v'],
                ['topic', 't'], ['type', 'c'], ['sort', 'so']];
    var SORTS = ['date', 'speaker', 'verdict', 'due'];

    function readParams() {
      var tok;
      try { tok = new URLSearchParams(location.search).get(PARAM); }
      catch (e) { return null; }
      if (tok == null) return null;
      var o = {};
      tok.split('|').forEach(function (kv) {
        var i = kv.indexOf(':'); if (i < 0) return;
        try { o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) {}
      });
      return o;
    }
    function syncControls() {
      $('#q').value = st.q; $('#fs').value = st.status; $('#fv').value = st.verdict;
      $('#ft').value = st.topic; $('#fc').value = st.type;
      $('#y1').value = st.yFrom; $('#y2').value = st.yTo;
      $('#ua').checked = st.unattr;
      $('#yo').textContent = st.yFrom + '–' + st.yTo;
    }
    function applyParams() {
      var o = readParams(); if (!o) return false;
      // The token is authoritative: clear first, so a key absent from it
      // resets rather than lingering from the previously rendered view.
      st.q = ''; st.status = ''; st.verdict = ''; st.topic = '';
      st.type = ''; st.sort = 'date'; st.open = null;
      HMAP.forEach(function (p) { if (o[p[1]] != null) st[p[0]] = o[p[1]]; });
      if (SORTS.indexOf(st.sort) < 0) st.sort = 'date';
      // Reject out-of-range or non-numeric years rather than rendering nothing.
      var a = parseInt(o.y1, 10), b = parseInt(o.y2, 10);
      st.yFrom = (a >= 2012 && a <= 2026) ? a : 2012;
      st.yTo   = (b >= 2012 && b <= 2026) ? b : 2026;
      if (st.yFrom > st.yTo) { st.yFrom = 2012; st.yTo = 2026; }
      st.unattr = o.u === '1';
      st.open = (o.o && /^\d+$/.test(o.o)) ? +o.o : null;
      syncControls();
      return true;
    }
    function writeParams() {
      var parts = [];
      HMAP.forEach(function (p) {
        var v = st[p[0]];
        if (!v || (p[0] === 'sort' && v === 'date')) return;
        parts.push(p[1] + ':' + encodeURIComponent(v));
      });
      if (st.yFrom !== 2012) parts.push('y1:' + st.yFrom);
      if (st.yTo !== 2026) parts.push('y2:' + st.yTo);
      if (st.unattr) parts.push('u:1');
      if (st.open != null) parts.push('o:' + st.open);
      var sp;
      try { sp = new URLSearchParams(location.search); } catch (e) { return; }
      // Only our own parameter is touched; utm_* and anything else the host
      // page or an ad platform put on the URL is carried through unchanged.
      if (parts.length) sp.set(PARAM, parts.join('|'));
      else sp['delete'](PARAM);
      var qs = sp.toString();
      try {
        // location.hash is passed through verbatim so the page's §1–§8 anchors
        // keep working while a filtered view stays shareable.
        history.replaceState(null, '',
          location.pathname + (qs ? '?' + qs : '') + location.hash);
      } catch (e) { /* file:// and sandboxed frames disallow replaceState */ }
    }

    function match(p) {
      if (!st.unattr && p.unattributed) return false;
      if (st.status && p.status !== st.status) return false;
      if (st.verdict && p.verdict !== st.verdict) return false;
      if (st.topic && p.topics.indexOf(st.topic) < 0) return false;
      if (st.type && p.type !== st.type) return false;
      if (p.year < st.yFrom || p.year > st.yTo) return false;
      if (st.q) {
        var h = (p.claim + ' ' + (p.speaker || '') + ' ' + (p.company || '')).toLowerCase();
        return st.q.toLowerCase().split(/\s+/).every(function (t) { return h.indexOf(t) >= 0; });
      }
      return true;
    }
    function sorted(rows) {
      return rows.slice().sort(function (a, b) {
        if (st.sort === 'speaker') return (a.speaker || '~').localeCompare(b.speaker || '~');
        if (st.sort === 'verdict') return (VORDER[a.verdict] - VORDER[b.verdict]) || a.date.localeCompare(b.date);
        if (st.sort === 'due') {
          if (!a.due && !b.due) return a.date.localeCompare(b.date);
          if (!a.due) return 1; if (!b.due) return -1;
          return a.due.localeCompare(b.due);
        }
        return a.date.localeCompare(b.date) || a.id - b.id;
      });
    }
    function rowHTML(p) {
      var isOpen = st.open === p.id;
      var badge = p.status === 'scoreable'
        ? '<span class="badge v-' + p.verdict + '">' + VLABEL[p.verdict] + '</span>'
        : '<span class="badge v-open">Due ' + p.due + '</span>';
      var flags = [
        p.unattributed ? ['unattributed', 'Speaker could not be identified from the transcript'] : null,
        p.ruled ? ['human-ruled', 'Contested call ruled by a human reviewer'] : null,
        p.comp ? ['compound', 'Multi-limb claim, scored on the whole'] : null,
        p.thirdparty ? ['third-party', 'Speaker relaying another forecast'] : null,
        p.gate_override ? ['horizon open', 'Old talk, stated horizon not yet elapsed'] : null
      ].filter(Boolean).map(function (f) {
        return '<span class="flag" title="' + esc(f[1]) + '">' + f[0] + '</span>'; }).join('');
      var det = '';
      if (isOpen) {
        var ev = (p.ev || []).map(function (u) {
          return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(host(u)) + '</a></li>'; }).join('');
        det = '<div class="detail">' +
          (p.why ? '<div class="d"><h4>Reasoning</h4><p>' + esc(p.why) + '</p></div>' : '') +
          (p.timing ? '<div class="d"><h4>Timing</h4><p>' + esc(p.timing) + '</p></div>' : '') +
          (p.horizon ? '<div class="d"><h4>Stated horizon</h4><p>' + esc(p.horizon) +
             (p.due ? ' — due ' + p.due : '') + '</p></div>' : '') +
          (ev ? '<div class="d"><h4>Evidence</h4><ul>' + ev + '</ul></div>' : '') +
          '<div class="d"><h4>Source</h4><p><a href="' + esc(p.url) + '" target="_blank" rel="noopener">Watch the talk</a> ' +
          '<span class="dim">' + esc(p.format.replace(/_/g, ' ')) + ' · ' + pdate(p.date) + '</span></p>' +
          '<p class="dim">#' + p.id + (p.conf ? ' · confidence: ' + esc(p.conf) : '') +
          ' · ' + esc(p.topics.join(', ') || '—') + ' · ' + p.type + '</p></div></div>';
      }
      return '<article class="row' + (isOpen ? ' open' : '') + '" data-id="' + p.id + '">' +
        '<button class="rhead" aria-expanded="' + isOpen + '"><span class="rmeta">' +
        '<span class="ryear">' + p.year + '</span>' +
        '<span class="rspk">' + esc(p.speaker || 'unattributed') + '</span>' +
        (p.company ? '<span class="rco">' + esc(p.company) + '</span>' : '') + '</span>' +
        '<span class="rclaim">' + esc(p.claim) + '</span>' +
        '<span class="rtail">' + badge + '<span class="flags">' + flags + '</span>' +
        '<span class="chev"></span></span></button>' + det + '</article>';
    }
    function render() {
      var rows = sorted(PRED.filter(match));
      var scored = rows.filter(function (r) { return r.status === 'scoreable'; }).length;
      $('#cnt').innerHTML = '<strong>' + rows.length + '</strong> shown — ' + scored +
        ' scored, ' + (rows.length - scored) + ' open' +
        (st.unattr ? '' : ' <span class="dim">(' + (meta.unattributed_rows || 0) + ' unattributed hidden)</span>');
      $('#rows').innerHTML = rows.map(rowHTML).join('');
      $('#mt').hidden = rows.length > 0;
      Array.prototype.forEach.call(wrap.querySelectorAll('.sbtn'), function (b) {
        b.classList.toggle('on', b.dataset.s === st.sort); });
      writeParams();
    }
    var t0, qEl = $('#q');
    // Read qEl.value, not e.target.value: this fires after the debounce, by which
    // point a composed event's target has been retargeted to the shadow host.
    qEl.addEventListener('input', function () {
      clearTimeout(t0);
      t0 = setTimeout(function () { st.q = qEl.value.trim(); st.open = null; render(); }, 140);
    });
    [['#fs', 'status'], ['#fv', 'verdict'], ['#ft', 'topic'], ['#fc', 'type']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function (e) {
        st[pair[1]] = e.target.value; st.open = null; render(); });
    });
    ['#y1', '#y2'].forEach(function (s) {
      $(s).addEventListener('input', function () {
        var a = +$('#y1').value, b = +$('#y2').value;
        if (a > b) { if (s === '#y1') b = a; else a = b; }
        st.yFrom = a; st.yTo = b; $('#y1').value = a; $('#y2').value = b;
        $('#yo').textContent = a + '–' + b; render();
      });
    });
    $('#ua').addEventListener('change', function (e) { st.unattr = e.target.checked; render(); });
    $('#rs').addEventListener('click', function () {
      st.q = ''; st.status = ''; st.verdict = ''; st.topic = ''; st.type = '';
      st.yFrom = 2012; st.yTo = 2026; st.unattr = false; st.sort = 'date'; st.open = null;
      syncControls(); render();
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.sbtn'), function (b) {
      b.addEventListener('click', function () { st.sort = b.dataset.s; render(); }); });
    $('#rows').addEventListener('click', function (e) {
      var head = e.target.closest('.rhead'); if (!head) return;
      var id = +head.closest('.row').dataset.id;
      st.open = (st.open === id) ? null : id; render();
    });
    // Boot from the query parameter when present, otherwise from defaults.
    syncControls();
    applyParams();
    render();

    // Back/forward onto a URL carrying different filters. replaceState neither
    // creates history entries nor fires popstate, so writeParams() cannot
    // retrigger this — filter changes stay out of the back stack entirely.
    window.addEventListener('popstate', function () {
      if (applyParams()) render();
    });
  }

  /* ---------------------------------------------------------------- mounts */
  function shadow(node) {
    var sr = node.shadowRoot || node.attachShadow({ mode: 'open' });
    sr.innerHTML = '';
    var st = document.createElement('style');
    st.textContent = CSS;
    sr.appendChild(st);
    var box = document.createElement('div');
    sr.appendChild(box);
    return box;
  }
  function fail(box, err) {
    box.innerHTML = '<p class="err">Could not load data (' + esc(err.message) + ').</p>';
    if (window.console) console.error('[ddnyc]', err);
  }

  var WIDGETS = {
    'ddnyc-summary': function (box) {
      return load('corpus_meta').then(function (m) {
        var cells = [['Talks', m.talks], ['Transcript words', m.words],
          ['Predictions', m.predictions_total], ['Scored', m.scored],
          ['Not yet due', m.too_early_with_due], ['Years', m.year_min + '–' + m.year_max]];
        box.innerHTML = '<div class="stats">' + cells.map(function (c) {
          return '<div class="stat"><b>' + (typeof c[1] === 'number' ? c[1].toLocaleString('en-US') : c[1]) +
            '</b><span>' + c[0] + '</span></div>'; }).join('') + '</div>';
      });
    },
    'ddnyc-chart-death-curve': function (box) {
      return load('terms').then(function (T) {
        var names = ['hadoop', 'data scientist', 'big data', 'data lake'];
        var alt = ['token', 'gpu', 'inference', 'agentic', 'evals'];
        var all = names.concat(alt).filter(function (n) { return T.terms[n]; })
          .reduce(function (a, n) { return a.concat(T.terms[n].per10k); }, []);
        lineChart(box, { years: T.years, yMax: Math.ceil(Math.max.apply(null, all) / 2) * 2,
          yLabel: 'Mentions per 10,000 words', srcExtra: 'shared scale with birth curve',
          series: names.filter(function (n) { return T.terms[n]; }).map(function (n, i) {
            return { name: n, values: T.terms[n].per10k, color: PALETTE[i] }; }) });
      });
    },
    'ddnyc-chart-birth-curve': function (box) {
      return load('terms').then(function (T) {
        var names = ['token', 'gpu', 'inference', 'agentic', 'evals'];
        var alt = ['hadoop', 'data scientist', 'big data', 'data lake'];
        var all = names.concat(alt).filter(function (n) { return T.terms[n]; })
          .reduce(function (a, n) { return a.concat(T.terms[n].per10k); }, []);
        lineChart(box, { years: T.years, yMax: Math.ceil(Math.max.apply(null, all) / 2) * 2,
          yLabel: 'Mentions per 10,000 words', srcExtra: 'shared scale with death curve',
          series: names.filter(function (n) { return T.terms[n]; }).map(function (n, i) {
            return { name: n, values: T.terms[n].per10k, color: PALETTE[4 + i] }; }) });
      });
    },
    'ddnyc-chart-term-grid': function (box) {
      return load('terms').then(function (T) {
        var names = ['big data', 'hadoop', 'data scientist', 'spark', 'machine learning',
          'deep learning', 'llm', 'gpt', 'agentic', 'gpu', 'token', 'reinforcement learning'];
        smallMultiples(box, { years: T.years, srcExtra: '12 selected terms',
          items: names.filter(function (n) { return T.terms[n]; }).map(function (n) {
            return { name: n, values: T.terms[n].per10k, peak: T.terms[n].peak,
              peakYear: T.terms[n].peak_year }; }) });
      });
    },
    'ddnyc-chart-term-grid-all': function (box) {
      // Appendix to the curated 12-term grid: every term in the dataset, sorted
      // by peak year so the grid reads as a chronological sweep. Collapsed by
      // default — expanded it is a wall, and only a reader who wants it clicks.
      // State lives in its own query parameter so a link to the expanded grid
      // arrives expanded; it does not touch the ledger's parameter or the
      // fragment the host page uses for section anchors.
      var KEY = 'ddnyc_terms';
      return load('terms').then(function (T) {
        var items = Object.keys(T.terms).map(function (n) {
          var v = T.terms[n];
          return { name: n, values: v.per10k, peak: v.peak, peakYear: v.peak_year };
        }).sort(function (a, b) {
          return (a.peakYear - b.peakYear) || (b.peak - a.peak) ||
                 a.name.localeCompare(b.name);
        });
        var bar = document.createElement('div');
        bar.className = 'tgl';
        var btn = document.createElement('button');
        btn.type = 'button';
        var note = document.createElement('span');
        var panel = document.createElement('div');
        bar.appendChild(btn); bar.appendChild(note);
        box.appendChild(bar); box.appendChild(panel);

        function draw(open) {
          btn.textContent = open ? 'Hide all ' + items.length + ' terms'
                                 : 'Show all ' + items.length + ' terms';
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          note.textContent = open ? 'sorted by peak year, earliest first' : '';
          panel.innerHTML = '';
          if (open) smallMultiples(panel, { years: T.years, items: items, dense: true,
            srcExtra: 'all ' + items.length + ' terms, sorted by peak year' });
        }
        var open = getParam(KEY) === '1';
        draw(open);
        btn.addEventListener('click', function () {
          open = !open;
          setParam(KEY, open ? '1' : null);
          draw(open);
        });
        window.addEventListener('popstate', function () {
          var want = getParam(KEY) === '1';
          if (want !== open) { open = want; draw(open); }
        });
      });
    },
    'ddnyc-chart-groups': function (box) {
      return load('infra_vs_apps').then(function (IA) {
        barChart(box, { srcExtra: 'grouped topic tags',
          note: IA.overlap_excluded_n + ' tagged in both groups excluded · z=' +
            IA.ztest.z + ', p≈' + IA.ztest.p_two_sided,
          rows: [
            { label: 'Infrastructure / systems', pct: IA.infrastructure.pct_correct, n: IA.infrastructure.n, color: PALETTE[4] },
            { label: 'Applications / markets', pct: IA.applications.pct_correct, n: IA.applications.n, color: PALETTE[0] },
            { label: 'Other topics', pct: IA.neither.pct_correct, n: IA.neither.n, color: PALETTE[3] }
          ] });
      });
    },
    'ddnyc-chart-topics': function (box) {
      return load('topic_accuracy').then(function (TA) {
        barChart(box, { srcExtra: 'hatched = underpowered (n<10)',
          rows: TA.slice().sort(function (a, b) {
            return (b.pct_correct || -1) - (a.pct_correct || -1); }).map(function (t) {
            return { label: t.topic, n: t.n, under: t.underpowered,
              pct: t.underpowered ? (100 * t.counts.correct / t.n) : t.pct_correct,
              color: t.underpowered ? PALETTE[3] : (t.pct_correct >= 50 ? PALETTE[4] : PALETTE[7]) }; }) });
      });
    },
    'ddnyc-chart-formats': function (box) {
      return load('format_timeline').then(function (F) {
        stackedBars(box, { years: F.years, data: F.formats, yLabel: 'Talks',
          keys: ['presentation', 'presentation_plus_qa', 'panel', 'interview'] });
      });
    },
    'ddnyc-chart-questions': function (box) {
      // Rate is the primary series. Per-talk is kept as the secondary line
      // precisely so the divergence is visible: the two tracked each other
      // until talks began lengthening, after which only per-talk climbs.
      // Question *word count* is deliberately not plotted — transcripts switch
      // from unpunctuated ASR to punctuated at 2025, which moves words-per-
      // question far more than any change in how the questions were asked.
      return load('chart_question_rate').then(function (Q) {
        dualAxis(box, { years: Q.years,
          left: { name: 'Questions per minute', values: Q.q_per_min },
          rights: [{ name: 'Questions per talk', values: Q.q_per_talk }],
          leftAs: 'line',
          leftLabel: 'Questions per minute', rightLabel: 'Questions per talk',
          srcExtra: 'interviews only, verbatim questions, cells under ' +
                    Q.min_talks + ' talks omitted' });
      });
    },
    'ddnyc-chart-verdict-mix': function (box) {
      return load('infra_vs_apps').then(function (IA) {
        propBars(box, {
          rows: [
            { label: 'infrastructure', counts: IA.infrastructure.counts },
            { label: 'applications', counts: IA.applications.counts },
            { label: 'tagged both', counts: IA.both_excluded.counts,
              under: IA.both_excluded.n < 20 }
          ],
          note: 'proportions of each group; "tagged both" is excluded from the comparison',
          srcExtra: 'grouped topic tags' });
      });
    },
    'ddnyc-chart-predictions-per-talk': function (box) {
      return load('chart_yield').then(function (Y) {
        columnChart(box, { values: Y.per_talk, labels: Y.years,
          yLabel: 'Predictions per talk', tickEvery: 1, thin: Y.thin_years,
          boundaryIndex: Y.years.indexOf(Y.boundary_year),
          boundaryLabel: Y.boundary_year + ': ' + Y.boundary_label,
          note: 'faded bar: fewer than 3 talks that year',
          srcExtra: 'all extracted predictions, scored or not' });
      });
    },
    'ddnyc-chart-duration-by-format': function (box) {
      return load('chart_duration').then(function (D) {
        gapLineChart(box, { years: D.years,
          series: [
            { name: D.labels.presentation_plus_qa,
              values: D.series.presentation_plus_qa, color: PALETTE[5] },
            { name: D.labels.interview, values: D.series.interview, color: PALETTE[0] }
          ],
          yLabel: 'Median duration (minutes)',
          note: 'cells with fewer than ' + D.min_cell +
                ' talks are omitted, breaking the line; panels excluded (n=16)',
          srcExtra: 'two densest formats only' });
      });
    },
    'ddnyc-chart-open-queue': function (box) {
      return load('chart_queue').then(function (Q) {
        columnChart(box, {
          values: Q.head_counts.concat([Q.tail.count]),
          labels: Q.head_years.map(String).concat([Q.tail.label]),
          yLabel: 'Predictions falling due', xLabel: 'Due year',
          valueLabels: true, tickEvery: 1,
          boundaryIndex: Q.head_years.length, boundaryLabel: 'axis break',
          note: Q.note, srcExtra: Q.total + ' predictions with a parseable due date' });
      });
    },
    'ddnyc-ledger': function (box) {
      return Promise.all([load('predictions_public'), load('corpus_meta')])
        .then(function (r) { ledger(box, r[0], r[1]); });
    },
    'ddnyc-caveats': function (box) {
      return load('corpus_meta').then(function (m) {
        box.innerHTML = '<ul class="caveats">' +
          (m.caveats || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>';
      });
    }
  };

  function mountAll(scope) {
    Object.keys(WIDGETS).forEach(function (id) {
      var node = (scope || document).getElementById(id);
      if (!node || node.dataset.ddnycMounted) return;
      node.dataset.ddnycMounted = '1';
      var box = shadow(node);
      try {
        WIDGETS[id](box).catch(function (e) { fail(box, e); });
      } catch (e) { fail(box, e); }
    });
  }

  window.DDNYC = { mount: mountAll, widgets: Object.keys(WIDGETS), base: BASE };
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', function () { mountAll(); }, { once: true });
  else mountAll();
})();
