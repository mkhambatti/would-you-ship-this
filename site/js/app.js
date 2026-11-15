// Would You Ship This? — the shop counter and the shelf wall.
// Policy maths lives in policy.js, score arithmetic in explain.js, the souvenir in receipt.js.

import { PROMISES, PASS_ALL, agrees, changedByPromise, cutoffForPassed, decide, keepsPromise, outcome, passedCount, tally } from './policy.js';
import { compare, logit, score as modelScore } from './explain.js';
import { drawReceipt, receiptSentence } from './receipt.js';

const BUNDLE = 'v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (x, d = 3) => Number(x).toFixed(d);
const signed = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);
const json = (path) => fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); });

const params = new URLSearchParams(location.search);
const asked = params.get('c');
const state = {
  version: BUNDLE, round: 0, rounds: 5, choices: [], cases: [], labels: null, model: null,
  wall: null, promise: 'exact', cutoff: 0, focus: 0, lastOutcome: [], fromGame: false,
};

/* ── Words in common (display only; mirrors pipeline/text.py) ───────── */
const TOKEN = /\d+(?:\.\d+)?|[a-z]+/g;
const stem = (t) => (/^\d/.test(t) ? (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t).replace(/^0+(?=\d)/, '') : (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
const tokenSet = (text) => new Set((String(text).toLowerCase().match(TOKEN) || []).map(stem));
function markShared(text, other) {
  const lower = String(text).toLowerCase();
  let out = '', last = 0;
  for (const m of lower.matchAll(TOKEN)) {
    if (!other.has(stem(m[0]))) continue;
    out += esc(text.slice(last, m.index)) + '<mark>' + esc(text.slice(m.index, m.index + m[0].length)) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

/* ── Loading: first case, then the answers, then the wall ───────────── */
const challengeReady = json(`data/first-case.json`).then((first) => {
  state.rounds = first.rounds;
  state.cases = [first.case];
  renderRounds();
  renderCase();
  return json(`data/challenge-${BUNDLE}.json`);
}).then((ch) => {
  state.cases = ch.cases; state.labels = ch.meta.labels; state.model = ch.model; state.meta = ch.meta;
  return ch;
});
const wallReady = challengeReady.then(() => new Promise((go) => ('requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300))))
  .then(() => json(`data/wall-${BUNDLE}.json`)).then((w) => { state.wall = w; state.cutoff = w.policy.cutoff; return w; });
challengeReady.catch(showLoadError); wallReady.catch(() => {});

function showLoadError(err) {
  $('call').innerHTML = `<h2>The cases didn’t arrive.</h2><p>${esc(err.message)}. Reload to try again.</p>`;
}

/* ── The counter ────────────────────────────────────────────────────── */
function renderRounds() {
  $('rounds').innerHTML = Array.from({ length: state.rounds }, (_, i) => {
    const c = state.choices[i];
    const st = c ? (c.agree ? 'agree' : 'differ') : (i === state.round ? 'now' : '');
    const say = c ? `Case ${i + 1}: you chose ${c.choice}; ${c.agree ? 'matches' : 'differs from'} the dataset label` : `Case ${i + 1}${i === state.round ? ', on the counter' : ''}`;
    return `<li data-state="${st}" aria-label="${say}">${i + 1}</li>`;
  }).join('');
}

function fitQuery(el, box, max, min, maxHeight) {
  let size = max;
  el.style.fontSize = size + 'px';
  while (size > min && (el.scrollWidth > el.clientWidth + 1 || box.offsetHeight > maxHeight)) {
    size -= 3; el.style.fontSize = size + 'px';
  }
}
function fitCounterQuery() {
  const phone = innerWidth <= 760;
  fitQuery($('query'), $('slip'), phone ? 64 : 124, phone ? 30 : 40, phone ? innerHeight * 0.3 : Math.max(300, innerHeight * 0.56));
}
addEventListener('resize', () => { if (!$('main').hidden) fitCounterQuery(); if (state.wall && !$('wallview').hidden) placeDivider(); });
document.fonts?.ready.then(() => { if (!$('main').hidden) fitCounterQuery(); });

function metaLine(p) {
  return `<p class="meta">${p.brand ? `<span>Brand <b>${esc(p.brand)}</b></span>` : ''}${p.color ? `<span>Colour <b>${esc(p.color)}</b></span>` : ''}<span>Item <b class="num">${esc(p.id)}</b></span></p>`;
}
function closerFold(p, c) {
  const bullets = (p.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('');
  const desc = p.description?.text ? `<h4>Description</h4><p class="desc">${esc(p.description.text)}${p.description.truncated ? '…' : ''}</p>` : '';
  return `<details class="fold" id="closer"><summary>Look closer</summary><div class="fold-body">
    ${bullets ? `<h4>From the listing</h4><ul>${bullets}</ul>` : ''}${desc}
    ${!bullets && !desc ? '<p>The dataset has no bullet points or description for this listing.</p>' : ''}
    <dl><dt>Product ID</dt><dd>${esc(p.id)}</dd><dt>Search ID</dt><dd>${c.qid}</dd><dt>Judged for this search</dt><dd>${c.n} items; this is the one the model ranked first</dd></dl>
    <p class="specimen-note">No photo: the dataset doesn’t include one, and a stand-in could change your mind. The title is the merchandise.</p>
  </div></details>`;
}

function renderCase() {
  const c = state.cases[state.round];
  const p = c.top;
  document.body.dataset.view = 'counter';
  $('query').textContent = c.query;
  $('slip-source').textContent = `Search no. ${c.qid}`;
  $('slip-round').textContent = `${state.round + 1} of ${state.rounds}`;
  $('label').className = 'label';
  $('label').innerHTML = `<h2 class="title">${esc(p.title)}</h2>${metaLine(p)}${closerFold(p, c)}`;
  $('call').innerHTML = `
    <h2>Would you recommend this exact item?</h2>
    <p>You promised the shopper an exact match. Would you stand behind this result?</p>
    <div class="actions">
      <button class="btn" data-choice="recommend">Recommend</button>
      <button class="btn" data-choice="pass">Pass</button>
    </div>`;
  renderRounds();
  fitCounterQuery();
  if (state.round > 0 && !reduced()) {
    $('slip-wrap').classList.remove('deal'); void $('slip-wrap').offsetWidth; $('slip-wrap').classList.add('deal');
  }
}

$('call').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.choice) { for (const x of $('call').querySelectorAll('button')) x.disabled = true; await challengeReady; reveal(b.dataset.choice); }
  if (b.dataset.next === 'case') { state.round += 1; renderCase(); scrollTo({ top: 0 }); $('query').focus?.(); }
  if (b.dataset.next === 'wall') { b.disabled = true; b.textContent = 'Fetching the shelf…'; await wallReady; pullBack(); }
});

function whyFold(c, open = false) {
  const top = c.top, ru = c.runner_up;
  const rows = compare(state.model, top.f, ru?.f);
  const recomputed = modelScore(state.model, top.f);
  const cell = (contrib, value) => contrib == null ? '<td class="n">—</td>' : `<td class="n"><span class="${contrib >= 0 ? 'pos' : 'neg'}">${signed(contrib)}</span><span class="val">${fmt(value, 2)}</span></td>`;
  const body = rows.map((r) => `<tr><td><span class="fname">${esc(r.name.replace(/_/g, ' '))}</span><span class="fdesc">${esc(r.description)}</span></td>${cell(r.contribution, r.value)}${cell(r.otherContribution, r.otherValue)}<td class="n">${ru ? signed(r.gap) : ''}</td></tr>`).join('');
  const base = state.model.intercept;
  return `<details class="fold"${open ? ' open' : ''}><summary>Why did it rank first?</summary><div class="fold-body">
    <div class="pair"><div><span>Ranked 1st</span><b>${esc(top.title)}</b></div>${ru ? `<div><span>Runner-up</span><span>${esc(ru.title)} <span class="tag ${ru.label}">${esc(state.labels[ru.label].name)}</span></span></div>` : ''}</div>
    <p class="why-cap">Each row is one feature’s signed push on the score, in log-odds, measured against the average training candidate. The small grey number is the raw feature value. Blue pushes toward “Exact”.</p>
    <div class="why-scroll"><table class="why">
      <thead><tr><th>Feature</th><th class="n">Ranked 1st</th><th class="n">Runner-up</th><th class="n">Gap</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr><td>Starting point (intercept)</td><td class="n">${signed(base)}</td><td class="n">${ru ? signed(base) : '—'}</td><td></td></tr>
        <tr><td>Sum (log-odds)</td><td class="n">${signed(logit(state.model, top.f))}</td><td class="n">${ru ? signed(logit(state.model, ru.f)) : '—'}</td><td class="n">${ru ? signed(logit(state.model, top.f) - logit(state.model, ru.f)) : ''}</td></tr>
        <tr><td>Model score</td><td class="n">${fmt(recomputed)}</td><td class="n">${ru ? fmt(modelScore(state.model, ru.f)) : '—'}</td><td></td></tr>
      </tfoot>
    </table></div>
    <p class="aside-note">Recomputed in your browser from the shipped feature values and weights (${esc(state.model.version)}); the offline score was ${fmt(top.score, 6)}. It is a model score, not a probability we vouch for. Ties: ${esc(state.model.tie_break)}.</p>
  </div></details>`;
}

async function reveal(choice) {
  const c = state.cases[state.round];
  const L = state.labels[c.top.label];
  const agree = agrees(choice, c.top.label, 'exact');
  state.choices[state.round] = { qid: c.qid, query: c.query, choice, agree };
  const el = $('label');
  if (!reduced()) { el.classList.add('turn-out'); await new Promise((r) => setTimeout(r, 250)); }
  const says = keepsPromise(c.top.label, 'exact') ? 'recommend' : 'pass';
  el.innerHTML = `
    <p class="eyebrow">The other side of the label</p>
    <h2 class="verdict" tabindex="-1" id="verdict">The dataset calls this <em>${esc(L.article)}</em>.</h2>
    <p class="meaning">“${esc(L.meaning)}” <span class="num">(${esc(L.name)}, as the dataset’s authors define it.)</span></p>
    <p class="yourcall"><b>Your call: ${choice === 'recommend' ? 'Recommend' : 'Pass'}.</b> Under an exact-match promise, that label says ${says}${agree ? ' too' : ''}.</p>
    <div class="listing"><p class="eyebrow">The listing</p><h3 class="title">${markShared(c.top.title, tokenSet(c.query))}</h3>${metaLine(c.top)}</div>
    <p class="aside-note">Underlines mark the words the search and the title share. That is our arithmetic. The dataset records the label, not the annotator’s reasons, so look for yourself. You’re allowed to disagree.</p>
    ${closerFold(c.top, c)}${whyFold(c)}`;
  $('query').innerHTML = markShared(c.query, tokenSet(c.top.title));
  el.className = 'label back' + (reduced() ? '' : ' turn-in');
  const n = state.choices.filter(Boolean).length, got = state.choices.filter((x) => x?.agree).length;
  const last = state.round === state.rounds - 1;
  $('call').innerHTML = `
    <h2>You and the dataset agree on ${got} of ${n}.</h2>
    <p>Selected challenges: five cases picked by hand. This score stays out of the benchmark.</p>
    <div class="actions" style="grid-template-columns:1fr"><button class="btn btn-ink" data-next="${last ? 'wall' : 'case'}">${last ? 'See the whole shelf' : 'Next case'}</button></div>`;
  renderRounds();
  $('verdict').focus({ preventScroll: true });
}

/* ── The wall ───────────────────────────────────────────────────────── */
const cells = [];
function buildWall() {
  const w = state.wall, wall = $('wall');
  const mine = new Map(state.choices.filter(Boolean).map((c, i) => [c.qid, i + 1]));
  wall.innerHTML = '';
  cells.length = 0;
  const frag = document.createDocumentFragment();
  w.items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'cell'; b.type = 'button'; b.dataset.i = i; b.dataset.l = it.top.label; b.tabIndex = i === state.focus ? 0 : -1;
    b.innerHTML = '<span class="mark"></span>';
    if (mine.has(it.qid)) { b.classList.add('mine'); b.insertAdjacentHTML('afterbegin', `<span class="flag">${mine.get(it.qid)}</span>`); }
    cells.push(b); frag.append(b);
    b.dataset.n = i;
  });
  const d = document.createElement('div');
  d.className = 'divider'; d.id = 'divider'; d.setAttribute('aria-hidden', 'true'); d.title = 'Drag: how sure before recommending?';
  frag.append(d);
  wall.append(frag);
  wall.setAttribute('role', 'group');
  $('cutoff').max = w.items.length;
  state.lastOutcome = [];

  $('wall-sub').textContent = `${w.items.length} held-out searches, each with the item the assistant ranked first, shelved least sure to most sure. Slips after the divider get recommended.`;
  if (mine.size) {
    $('ledge').hidden = false;
    $('ledge-list').innerHTML = state.choices.map((c, n) => c ? `<li><button data-qid="${c.qid}"><span class="flag">${n + 1}</span><span class="q">${esc(c.query)}</span></button></li>` : '').join('');
  }
  $('legend').innerHTML = '';
  enableDividerDrag(d);
}

function applyPolicy({ announce = true } = {}) {
  const { items } = state.wall;
  const t = tally(items, state.cutoff, state.promise);
  const k = passedCount(items, state.cutoff);
  items.forEach((it, i) => {
    const o = outcome(it, state.cutoff, state.promise);
    if (state.lastOutcome[i] !== o) {
      state.lastOutcome[i] = o;
      const el = cells[i];
      el.dataset.o = o;
      el.setAttribute('aria-label', `Search “${it.query}”. Picked: ${it.top.title}. ${o === 'kept' || o === 'other' ? 'Recommended' : 'Passed'}. Dataset label: ${state.wall.meta.labels[it.top.label].name}.`);
    }
  });
  const sub = state.promise === 'substitute';
  const keptName = sub ? 'Exact or substitute shown' : 'Exact matches shown';
  $('counts').innerHTML = `
    <div class="count"><b class="num" id="n-kept">${t.kept}</b><span><i class="mark kept"></i>${keptName}</span></div>
    <div class="count"><b class="num" id="n-other">${t.other}</b><span><i class="mark other"></i>Other items shown</span></div>
    <div class="count"><b class="num" id="n-passed">${t.passed}</b><span><i class="mark"></i>Queries passed</span></div>`;
  const cut = $('cutoff');
  if (Number(cut.value) !== k) cut.value = k;
  const cutText = state.cutoff >= PASS_ALL ? 'pass on everything' : state.cutoff <= items[0].top.score ? 'recommend everything' : `model score ≥ ${fmt(state.cutoff)}`;
  $('cut-out').textContent = cutText;
  cut.setAttribute('aria-valuetext', `${cutText}: ${t.shown} recommended, ${t.passed} passed`);
  const what = sub ? 'an exact match or substitute' : 'an exact match';
  let note = `<b><span id="n-missed">${t.passedKeepable}</span> of the ${t.passed} passed</b> had ${what} sitting at rank one. ${t.kept} + ${t.other} + ${t.passed} = ${t.total}.`;
  if (sub) note += ` Of those shown, ${t.exactShown} exact and ${t.substituteShown} substitute.`;
  if (announce) $('dock-note').innerHTML = note;
  $('legend').innerHTML = `
    <li><i class="mark kept"></i>Shown, ${sub ? 'exact' : 'exact match'}</li>
    ${sub ? '<li><i class="mark sub"></i>Shown, substitute</li>' : ''}
    <li><i class="mark other"></i>Shown, something else</li>
    <li><i class="mark missed"></i>Passed, but rank one was ${sub ? 'fine' : 'exact'}</li>
    <li><i class="mark"></i>Passed</li>`;
  placeDivider();
  if (!$('listview').hidden) renderList();
  return t;
}

function placeDivider() {
  const d = $('divider');
  if (!d || !cells.length) return;
  const cols = getComputedStyle($('wall')).gridTemplateColumns.split(' ').length;
  const bay = cols % 12 === 0 ? 12 : 10;
  if ($('wall').dataset.bay !== String(bay)) { $('wall').dataset.bay = bay; cells.forEach((c, i) => c.classList.toggle('bay', i % bay === 0)); }
  const k = passedCount(state.wall.items, state.cutoff);
  const el = cells[Math.min(k, cells.length - 1)];
  const g = parseFloat(getComputedStyle($('wall')).columnGap) || 4;
  d.style.left = (k >= cells.length ? el.offsetLeft + el.offsetWidth + g / 2 : el.offsetLeft - g / 2) + 'px';
  d.style.top = el.offsetTop + 'px';
  d.style.height = el.offsetHeight + 'px';
}

function setPassed(k) {
  state.cutoff = cutoffForPassed(state.wall.items, k);
  applyPolicy();
}

function enableDividerDrag(d) {
  const wall = $('wall');
  const at = (e) => {
    const r = wall.getBoundingClientRect();
    const cols = getComputedStyle(wall).gridTemplateColumns.split(' ').length;
    const rowH = cells[cols] ? cells[cols].offsetTop - cells[0].offsetTop : cells[0].offsetHeight;
    const rows = Math.ceil(cells.length / cols);
    const row = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - r.top) / rowH)));
    const col = Math.max(0, Math.min(cols, Math.round((e.clientX - r.left) / (r.width / cols))));
    return Math.min(cells.length, row * cols + col);
  };
  d.addEventListener('pointerdown', (e) => { d.setPointerCapture(e.pointerId); d.classList.add('dragging'); e.preventDefault(); });
  d.addEventListener('pointermove', (e) => { if (d.hasPointerCapture(e.pointerId)) setPassed(at(e)); });
  const end = (e) => { d.classList.remove('dragging'); if (d.hasPointerCapture(e.pointerId)) d.releasePointerCapture(e.pointerId); placeDivider(); };
  d.addEventListener('pointerup', end); d.addEventListener('pointercancel', end);
}

$('cutoff').addEventListener('input', (e) => setPassed(Number(e.target.value)));

document.querySelectorAll('input[name="promise"]').forEach((r) => r.addEventListener('change', () => {
  const from = state.promise, to = r.value;
  if (from === to) return;
  const changed = changedByPromise(state.wall.items, state.cutoff, from, to);
  state.promise = to;
  applyPolicy();
  const shownChanged = changed.filter((i) => decide(state.wall.items[i].top.score, state.cutoff) === 'recommend').length;
  $('dock-note').innerHTML = `<b>${changed.length} slips change verdict</b> (${shownChanged} shown, ${changed.length - shownChanged} passed). No slip moved: the ranking and the cutoff are the same. ` + $('dock-note').innerHTML;
  for (const i of changed) { cells[i].classList.remove('pulse'); void cells[i].offsetWidth; cells[i].classList.add('pulse'); }
}));

// Keyboard: arrows walk the shelf, Enter takes a slip down.
$('wall').addEventListener('keydown', (e) => {
  const cols = getComputedStyle($('wall')).gridTemplateColumns.split(' ').length;
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -1e6, End: 1e6 }[e.key];
  if (!step) return;
  e.preventDefault();
  focusCell(Math.max(0, Math.min(cells.length - 1, state.focus + step)));
});
function focusCell(i) {
  cells[state.focus].tabIndex = -1; state.focus = i; cells[i].tabIndex = 0; cells[i].focus();
}
$('wall').addEventListener('click', (e) => { const c = e.target.closest('.cell'); if (c) { state.focus = Number(c.dataset.i); openCase(Number(c.dataset.i)); } });
$('wall').addEventListener('focusin', (e) => { const c = e.target.closest('.cell'); if (c) { cells[state.focus].tabIndex = -1; state.focus = Number(c.dataset.i); c.tabIndex = 0; } });
$('ledge-list').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const i = state.wall.items.findIndex((it) => it.qid === Number(b.dataset.qid));
  cells[i].scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  cells[i].classList.remove('pulse'); void cells[i].offsetWidth; cells[i].classList.add('pulse');
  openCase(i);
});

/* ── A slip, taken off the shelf ────────────────────────────────────── */
let openIndex = -1, candidates = null;
function openCase(i) {
  const dlg = $('case-dialog');
  if (openIndex >= 0) cells[openIndex].classList.remove('out');
  openIndex = i; cells[i].classList.add('out');
  const it = state.wall.items[i], L = state.wall.meta.labels[it.top.label];
  const o = outcome(it, state.cutoff, state.promise);
  const mine = state.choices.find((c) => c && c.qid === it.qid);
  const promise = PROMISES[state.promise].name.toLowerCase();
  const said = { kept: `Recommended. It keeps the “${promise}” promise.`, other: `Recommended. It breaks the “${promise}” promise.`, missed: 'Passed, though this item would have kept the promise.', passed: 'Passed. This item would have broken the promise.' }[o];
  const judged = Object.entries(it.judged).map(([k, v]) => `${v} ${state.wall.meta.labels[k].name.toLowerCase()}`).join(', ');
  dlg.innerHTML = `
    <div class="sheet-bar">
      <span class="eyebrow num" id="case-title">Slip ${i + 1} of ${state.wall.items.length}</span>
      <div class="sheet-nav">
        <button data-go="-1" aria-label="Previous slip (less sure)"${i === 0 ? ' disabled' : ''}>←</button>
        <button data-go="1" aria-label="Next slip (more sure)"${i === cells.length - 1 ? ' disabled' : ''}>→</button>
        <button data-go="0">Put it back</button>
      </div>
    </div>
    <div class="sheet-body">
      <div class="mini-wrap"><div class="mini-slip"><p class="eyebrow">The shopper asked for</p><p class="query">${markShared(it.query, tokenSet(it.top.title))}</p></div></div>
      <p class="eyebrow" style="margin-bottom:8px">The assistant picked</p>
      <div class="label"><h2 class="title">${markShared(it.top.title, tokenSet(it.query))}</h2>${metaLine(it.top)}</div>
      <div class="board" aria-hidden="true" style="margin:0"></div>
      <dl class="status">
        <div><dt>The dataset calls this</dt><dd>${esc(L.name)}<small>${esc(L.meaning)}</small></dd></div>
        <div><dt>Model score</dt><dd class="num">${fmt(it.top.score)}<small>Precomputed offline. Not a probability.</small></dd></div>
        <div><dt>At your cutoff</dt><dd>${o === 'kept' || o === 'other' ? 'Recommend' : 'Pass'}<small>${said}</small></dd></div>
      </dl>
      ${mine ? `<p class="yourcall"><b>Your call at the counter: ${mine.choice === 'recommend' ? 'Recommend' : 'Pass'}.</b></p>` : ''}
      ${whyFold(it)}
      <details class="fold" id="cand-fold"><summary>All ${it.n} judged items for this search</summary><div class="fold-body" id="cand-body"><p>Fetching…</p></div></details>
      <details class="fold"><summary>Source IDs</summary><div class="fold-body">
        <dl><dt>query_id</dt><dd>${it.qid}</dd><dt>product_id</dt><dd>${esc(it.top.id)}</dd><dt>example_id</dt><dd>${it.top.example_id}</dd>
        <dt>Query source tag</dt><dd>${esc(it.source)}</dd><dt>Judged set</dt><dd>${judged}</dd>
        <dt>BM25’s first pick</dt><dd>${it.bm25_top.id === it.top.id ? 'the same item' : esc(it.bm25_top.id) + ' (' + esc(state.wall.meta.labels[it.bm25_top.label].name) + ')'}</dd></dl>
      </div></details>
    </div>`;
  dlg.querySelector('#cand-fold').addEventListener('toggle', async (e) => {
    if (!e.target.open) return;
    try {
      candidates ??= await json(`data/candidates-${BUNDLE}.json`);
      const rows = candidates.queries[it.qid].map((r, n) => `<tr><td class="n">${n + 1}</td><td>${esc(r[1])}</td><td><span class="tag ${r[2]}">${esc(state.wall.meta.labels[r[2]].name)}</span></td><td class="n">${fmt(r[3])}</td><td class="n">${r[5]}</td></tr>`).join('');
      $('cand-body').innerHTML = `<div class="why-scroll"><table class="cands"><thead><tr><th>Model rank</th><th>Title</th><th>Dataset label</th><th>Model score</th><th>BM25 rank</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } catch (err) { $('cand-body').innerHTML = `<p>Couldn’t fetch the candidate lists (${esc(err.message)}).</p>`; }
  });
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}
$('case-dialog').addEventListener('click', (e) => {
  const b = e.target.closest('[data-go]');
  if (e.target === e.currentTarget) return e.currentTarget.close();
  if (!b) return;
  const go = Number(b.dataset.go);
  if (go === 0) $('case-dialog').close(); else { state.focus = openIndex + go; openCase(openIndex + go); }
});
$('case-dialog').addEventListener('close', () => {
  if (openIndex < 0) return;
  cells[openIndex].classList.remove('out');
  cells.forEach((c, i) => { c.tabIndex = i === openIndex ? 0 : -1; });
  state.focus = openIndex; cells[openIndex].focus({ preventScroll: false }); openIndex = -1;
});
for (const id of ['method-dialog', 'receipt-dialog']) $(id).addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) e.currentTarget.close(); });

/* ── Readable alternative to the wall ───────────────────────────────── */
function renderList() {
  const { items, meta } = state.wall;
  const k = passedCount(items, state.cutoff);
  const rows = items.map((it, i) => {
    const o = outcome(it, state.cutoff, state.promise);
    return `<tr class="${i === k ? 'cut-row' : ''}"><td class="n">${i + 1}</td><td class="q"><button data-i="${i}">${esc(it.query)}</button></td><td>${esc(it.top.title)}</td><td class="n">${fmt(it.top.score)}</td><td><span class="tag ${it.top.label}">${esc(meta.labels[it.top.label].name)}</span></td><td>${o === 'kept' || o === 'other' ? '<b>Recommend</b>' : 'Pass'}</td></tr>`;
  }).join('');
  $('listview').innerHTML = `<table><caption class="vh">Every search on the wall, least sure first. The blue line is your cutoff.</caption><thead><tr><th>#</th><th>The shopper asked for</th><th>The assistant picked</th><th>Model score</th><th>Dataset label</th><th>At your cutoff</th></tr></thead><tbody>${rows}</tbody></table>`;
}
$('listview').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) openCase(Number(b.dataset.i)); });
$('toggle-list').addEventListener('click', (e) => {
  const on = $('listview').hidden;
  $('listview').hidden = !on; $('wall-frame').hidden = on;
  e.target.setAttribute('aria-pressed', on); e.target.textContent = on ? 'Back to the wall' : 'Read it as a list';
  if (on) renderList(); else placeDivider();
});

/* ── How this was measured ──────────────────────────────────────────── */
$('open-method').addEventListener('click', () => {
  const w = state.wall, m = w.metrics, s = w.meta.source, p = w.policy;
  const row = (name, x) => `<tr><td>${name}</td><td>${x.ndcg ?? '—'}</td><td>${x.ndcg_at_10 ?? '—'}</td><td>${(x.exact_at_1 * 100).toFixed(1)}%</td><td>${(x.exact_or_substitute_at_1 * 100).toFixed(1)}%</td></tr>`;
  const table = (part) => `<table><thead><tr><th>${part.bm25.queries.toLocaleString()} queries</th><th>NDCG</th><th>NDCG@10</th><th>Exact at rank 1</th><th>Exact or substitute at rank 1</th></tr></thead><tbody>${row('BM25 on titles', part.bm25)}${row('Learned ranker (' + esc(w.model.version) + ')', part.logreg)}${row('Random pick from the judged set', part.chance)}</tbody></table>`;
  const rel = w.reliability.test.map((b) => `<tr><td>${b.bin}</td><td>${b.n}</td><td>${b.mean_score.toFixed(3)}</td><td>${(b.exact_rate * 100).toFixed(1)}%</td></tr>`).join('');
  $('method-dialog').innerHTML = `
    <div class="sheet-bar"><span class="eyebrow" id="method-title">How this was measured</span><div class="sheet-nav"><button data-close>Close</button></div></div>
    <div class="sheet-body method">
      <h2>A reranking exercise, and only that.</h2>
      <p>Every search here comes with a fixed set of products that people already judged. The models only reorder that set. Nothing on this page says anything about purchases, satisfaction, or any live shopping system.</p>
      <h3>Source</h3>
      <p>Amazon Science, Shopping Queries Dataset (ESCI), US English, Task 1 ranking subset. Revision <code>${esc(s.revision)}</code>. Examples are joined to products on locale and product ID. The official train/test split is kept; validation is carved out of train by query.</p>
      <p class="num">Train ${w.meta.splits.train.queries.toLocaleString()} queries · validation ${w.meta.splits.validation.queries.toLocaleString()} · held-out test ${w.meta.splits.test.queries.toLocaleString()}. The wall is a fixed pseudo-random sample of ${w.meta.wall.size} complete test queries (${w.meta.wall.judgements.toLocaleString()} judged items).</p>
      <h3>Models</h3>
      <p><b>BM25</b> over product titles (k1 ${w.bm25.k1}, b ${w.bm25.b}). <b>${esc(w.model.version)}</b>: logistic regression on ${w.model.features.length} features of the query, title, brand and colour, trained to predict the Exact label. Fit on train, frozen, then run once on held-out queries. Ties: ${esc(w.model.tie_break)}.</p>
      <h3>Held-out test, all ${m.test.bm25.queries.toLocaleString()} queries</h3>${table(m.test)}
      <h3>The wall sample</h3>${table(m.wall_sample)}
      <p>NDCG uses the KDD Cup gains: Exact 1.0, Substitute 0.1, Complement 0.01, Irrelevant 0. The wall always shows the learned ranker’s first pick, whichever model scores better.</p>
      <h3>The cutoff</h3>
      <p>The divider starts at <b class="num">${p.cutoff}</b>. Rule, applied to validation data: ${esc(p.rule)}. On held-out test that setting recommended for ${(p.test.exact_shown + p.test.other_shown).toLocaleString()} of ${p.test.queries.toLocaleString()} queries; ${p.test.exact_shown.toLocaleString()} of those were Exact.</p>
      <h3>Why “model score” and not “probability”</h3>
      <p>The score is the logistic output. Held-out, first-ranked items by score band:</p>
      <table><thead><tr><th>Score band</th><th>Queries</th><th>Mean score</th><th>Share labelled Exact</th></tr></thead><tbody>${rel}</tbody></table>
      <p>The bands track loosely, not tightly, and nothing was recalibrated. So it stays a score.</p>
      <h3>What your browser computes</h3>
      <p>${esc(w.meta.precomputed)}</p>
      <h3>Reproduce it</h3>
      <pre>git clone https://github.com/mkhambatti/would-you-ship-this
cd would-you-ship-this && make reproduce</pre>
      <p>Bundle ${esc(w.meta.bundle)} · model ${esc(w.model.version)} · sample size ${w.items.length}.</p>
    </div>`;
  $('method-dialog').showModal();
});

/* ── Ship this setting ──────────────────────────────────────────────── */
function challengeLink() {
  const u = new URL(location.href);
  u.search = `?c=${state.version}`; u.hash = '';
  return u.toString();
}
$('ship').addEventListener('click', async () => {
  const t = tally(state.wall.items, state.cutoff, state.promise);
  const data = {
    choices: state.choices.filter(Boolean), rounds: state.rounds, promise: state.promise, promiseName: PROMISES[state.promise].name,
    cutoff: state.cutoff, tally: t, link: challengeLink(), challenge: state.version, model: state.wall.model.version,
    date: new Date().toISOString().slice(0, 10),
  };
  state.receipt = data;
  const canvas = document.createElement('canvas');
  await drawReceipt(canvas, data);
  const url = canvas.toDataURL('image/png');
  const dlg = $('receipt-dialog');
  dlg.innerHTML = `
    <div class="sheet-bar"><span class="eyebrow" id="receipt-title">Your receipt</span><div class="sheet-nav"><button data-close>Close</button></div></div>
    <div class="sheet-body receipt-body">
      <img id="receipt-img" src="${url}" width="1080" height="1350" alt="Receipt. ${esc(receiptSentence(data))}">
      <div class="receipt-side">
        <h2>Shipped.</h2>
        <p id="receipt-sentence">${esc(receiptSentence(data))}</p>
        <a class="btn btn-blue" id="print" download="would-you-ship-this-receipt.png" href="${url}" style="display:grid;place-items:center;text-decoration:none">Print my receipt</a>
        <label class="eyebrow" for="share-link">Challenge link: same five cases, no answers</label>
        <input class="share-link" id="share-link" readonly value="${esc(data.link)}">
        <button class="btn" id="copy-link">Copy challenge link</button>
        <p class="aside-note">The image is drawn in your browser from this run. Nothing is uploaded and there is no account.</p>
      </div>
    </div>`;
  dlg.showModal();
  $('copy-link').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(data.link); e.target.textContent = 'Copied'; } catch { $('share-link').select(); e.target.textContent = 'Select and copy'; }
  });
});

/* ── From one slip to all of them ───────────────────────────────────── */
function showWall() {
  $('main').hidden = true; $('wallview').hidden = false;
  document.body.dataset.view = 'wall';
  buildWall(); applyPolicy();
  const mine = state.choices.findLast?.(Boolean);
  if (mine) state.focus = state.wall.items.findIndex((it) => it.qid === mine.qid);
  cells.forEach((c, i) => { c.tabIndex = i === state.focus ? 0 : -1; });
}

async function pullBack() {
  const view = $('wallview');
  if (reduced()) { showWall(); view.classList.add('view-fade'); scrollTo(0, 0); $('wallview').querySelector('h1').focus?.(); return; }

  const big = $('slip-wrap'), from = big.getBoundingClientRect();
  const chips = [...$('rounds').children].map((li) => li.getBoundingClientRect());
  const flyer = big.cloneNode(true);
  flyer.removeAttribute('id'); flyer.classList.remove('deal'); flyer.classList.add('flyer');
  // The clone is laid out unrotated; start it where the original sits.
  const w = big.offsetWidth, h = big.offsetHeight;
  Object.assign(flyer.style, { left: from.left + (from.width - w) / 2 + 'px', top: from.top + (from.height - h) / 2 + 'px', width: w + 'px', height: h + 'px', transform: 'rotate(-1.6deg)', transformOrigin: '50% 50%' });
  document.body.append(flyer);

  view.classList.add('arriving');
  showWall();
  scrollTo(0, 0);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const idx = state.choices.map((c) => state.wall.items.findIndex((it) => it.qid === c.qid));
  const lastIdx = idx[idx.length - 1];
  const target = cells[lastIdx].querySelector('.mark').getBoundingClientRect();
  const start = flyer.getBoundingClientRect();
  const cx = target.left + target.width / 2, cy = target.top + target.height / 2;
  const sx = target.width / w, sy = target.height / h;
  const dx = cx - (start.left + start.width / 2), dy = cy - (start.top + start.height / 2);

  // Every other slip rises in a ripple that starts where the big one will land.
  const far = Math.hypot(innerWidth, view.offsetHeight);
  cells.forEach((c, i) => {
    if (idx.includes(i)) { c.style.opacity = 0; return; }
    const r = c.getBoundingClientRect();
    const dist = Math.hypot(r.left - cx, r.top - cy) / far;
    c.animate([{ opacity: 0, transform: 'translateY(10px) scale(.4)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120 + dist * 950, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  });

  for (const el of flyer.querySelectorAll('.eyebrow, .query, .slip-foot')) el.animate([{ opacity: 1 }, { opacity: 1, offset: .45 }, { opacity: 0 }], { duration: 800, fill: 'forwards' });
  const colour = getComputedStyle(cells[lastIdx].querySelector('.mark')).backgroundColor;
  flyer.querySelector('.slip').animate([{ backgroundColor: '#FFFDF7' }, { backgroundColor: '#FFFDF7', offset: .55 }, { backgroundColor: colour }], { duration: 1250, fill: 'forwards' });
  const flight = flyer.animate([
    { transform: 'rotate(-1.6deg)' },
    { transform: `translate(${dx * .2}px, ${dy * .2 - 14}px) rotate(-3deg) scale(${1 - (1 - sx) * .45}, ${1 - (1 - sy) * .45})`, offset: .34 },
    { transform: `translate(${dx}px, ${dy}px) rotate(-7deg) scale(${sx}, ${sy})` },
  ], { duration: 1250, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });

  // The four earlier cases leave the sign rail and find their places too.
  const minis = idx.slice(0, -1).map((i, n) => {
    const m = document.createElement('div');
    const a = chips[n], b = cells[i].querySelector('.mark').getBoundingClientRect();
    m.className = 'flyer-mini';
    Object.assign(m.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px', background: getComputedStyle(cells[i].querySelector('.mark')).backgroundColor === 'rgba(32, 33, 30, 0.11)' ? '#cfcbc2' : getComputedStyle(cells[i].querySelector('.mark')).backgroundColor });
    document.body.append(m);
    m.animate([{ transform: 'none' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) rotate(-7deg) scale(${b.width / a.width}, ${b.height / a.height})` }], { duration: 900, delay: 250 + n * 90, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
    return m;
  });

  await flight.finished;
  for (const i of idx) cells[i].style.opacity = '';
  flyer.remove(); minis.forEach((m) => m.remove());
  view.classList.remove('arriving');
  for (const i of idx) cells[i].classList.add('pulse');
  placeDivider();
}

$('skip-wall').addEventListener('click', async () => { await wallReady; showWall(); scrollTo(0, 0); });

if (asked && asked !== BUNDLE) {
  challengeReady.then(() => { $('call').insertAdjacentHTML('beforeend', `<p style="grid-column:1/-1">That link asked for challenge “${esc(asked)}”. This build carries ${BUNDLE}, so that is what’s on the counter.</p>`); });
}
if (location.hash === '#wall') wallReady.then(() => { showWall(); });

// For the tests and for the curious: the exact state the page is computing from.
window.__wyst = { state, tally: () => tally(state.wall.items, state.cutoff, state.promise), setPassed, challengeLink };
