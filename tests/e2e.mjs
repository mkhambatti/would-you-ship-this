// End-to-end check against a real browser (your installed Chrome, via playwright-core).
//
//   npm run serve &            # or set BASE_URL to the deployed Pages URL
//   node tests/e2e.mjs
//
// It plays the five rounds, drives the divider to its extremes, flips the promise, exports the
// receipt, opens the challenge link in a fresh browser profile, and compares every count on
// screen with results/independent_counts.json (computed by pandas, not by the page's code).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const independent = JSON.parse(readFileSync(new URL('../results/independent_counts.json', import.meta.url)));
const challenge = JSON.parse(readFileSync(new URL('../site/data/challenge-v1.json', import.meta.url)));
const QUERIES = challenge.cases.map((c) => c.query);
const CALLS = ['pass', 'recommend', 'recommend', 'pass', 'pass'];
const expectAgree = challenge.cases.filter((c, i) => (CALLS[i] === 'recommend') === (c.top.label === 'E')).length;
const done = [];
const ok = (name) => { done.push(name); console.log('  ✓', name); };

const browser = await chromium.launch({ channel: 'chrome' });

async function open(url, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, ...opts });
  const page = await context.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname.split('/').pop()));
  page.on('pageerror', (e) => { throw e; });
  await page.goto(url, { waitUntil: 'networkidle' });
  return { context, page, requests };
}

async function playFive(page, calls = CALLS) {
  const seen = [];
  for (let i = 0; i < 5; i++) {
    seen.push(await page.textContent('#query'));
    assert.equal(await page.locator('.verdict').count(), 0, 'the label is face down before the call');
    assert.ok(!/model score/i.test(await page.textContent('#main')), 'no score before the call');
    await page.click(`[data-choice="${calls[i]}"]`);
    await page.waitForSelector('.verdict');
    const want = challenge.meta.labels[challenge.cases[i].top.label].article;
    assert.ok((await page.textContent('.verdict')).includes(want), `round ${i + 1} reveals "${want}"`);
    if (i < 4) await page.click('[data-next="case"]');
  }
  return seen;
}

const readCounts = (page) => page.evaluate(() => ({
  kept: +document.getElementById('n-kept').textContent, other: +document.getElementById('n-other').textContent,
  passed: +document.getElementById('n-passed').textContent, passed_keepable: +document.getElementById('n-missed').textContent,
}));
const want = (s, promise) => ({ kept: s[promise].kept, other: s[promise].other, passed: s[promise].passed, passed_keepable: s[promise].passed_keepable });
const setSlider = (page, k) => page.evaluate((k) => { const el = document.getElementById('cutoff'); el.value = k; el.dispatchEvent(new Event('input', { bubbles: true })); }, k);

console.log(`Would You Ship This? end-to-end against ${BASE}`);

// 1. First paint and load order
{
  const { context, page, requests } = await open(BASE);
  assert.equal(await page.textContent('#query'), QUERIES[0]);
  assert.ok(requests.indexOf('first-case.json') < requests.indexOf('wall-v1.json'), 'first case is requested before the wall bundle');
  assert.ok(requests.indexOf('first-case.json') >= 0 && !requests.includes('candidates-v1.json'));
  const first = JSON.parse(readFileSync(new URL('../site/data/first-case.json', import.meta.url)));
  assert.ok(!('label' in first.case.top) && !('score' in first.case.top));
  ok('first case paints from its own small file, before the wall bundle, with no answer in it');

  // 2. Five rounds
  const seen = await playFive(page);
  assert.deepEqual(seen, QUERIES);
  assert.ok((await page.textContent('#call h2')).includes(`${expectAgree} of 5`));
  ok(`five-round flow: all five reveals correct, game score ${expectAgree} of 5 shown apart from the benchmark`);

  // 3. Pull back to the wall
  await page.click('[data-next="wall"]');
  await page.waitForSelector('#wallview:not(.arriving) .cell.mine');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.cell').count(), independent.queries);
  assert.equal(await page.locator('.cell.mine').count(), 5);
  const order = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((c) => +c.dataset.i));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  ok('wall: 480 slips, the five played slips flagged in place');

  // 4. Counts: frozen default, then a sweep including both extremes
  const frozen = independent.settings[0];
  assert.deepEqual(await readCounts(page), want(frozen, 'exact'));
  for (const s of independent.settings.slice(1)) {
    await setSlider(page, s.slider);
    const got = await readCounts(page);
    assert.deepEqual(got, want(s, 'exact'), s.name);
    assert.equal(got.kept + got.other + got.passed, independent.queries);
    const marks = await page.evaluate(() => { const n = {}; document.querySelectorAll('.cell').forEach((c) => { n[c.dataset.o] = (n[c.dataset.o] || 0) + 1; }); return n; });
    assert.equal((marks.kept || 0), got.kept); assert.equal((marks.other || 0), got.other);
    assert.equal((marks.missed || 0) + (marks.passed || 0), got.passed);
  }
  ok(`counts match the independent calculation at ${independent.settings.length} settings, incl. recommend-everything and pass-on-everything`);

  // 5. Substitute toggle: counts change, positions do not
  await setSlider(page, 240);
  const before = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((c) => [c.offsetLeft, c.offsetTop]));
  await page.check('input[name="promise"][value="substitute"]');
  const s240 = independent.settings.find((s) => s.slider === 240);
  assert.deepEqual(await readCounts(page), want(s240, 'substitute'));
  const after = await page.evaluate(() => [...document.querySelectorAll('.cell')].map((c) => [c.offsetLeft, c.offsetTop]));
  assert.deepEqual(after, before);
  const changed = s240.substitute.kept - s240.exact.kept + (s240.substitute.passed_keepable - s240.exact.passed_keepable);
  assert.ok((await page.textContent('#dock-note')).includes(`${changed} slips change verdict`));
  assert.ok((await page.textContent('#counts')).includes('Exact or substitute shown'));
  ok(`substitute toggle: ${changed} verdicts change, counts match, no slip moves`);

  // 6. Keyboard: arrows move the cutoff; a slip can be taken down and put back
  await page.focus('#cutoff');
  await page.keyboard.press('End');
  assert.equal((await readCounts(page)).passed, independent.queries);
  await page.keyboard.press('Home');
  assert.equal((await readCounts(page)).passed, 0);
  await page.keyboard.press('ArrowRight');
  assert.equal((await readCounts(page)).passed, 1);
  await page.locator('.cell').nth(100).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#case-dialog[open]');
  assert.ok((await page.textContent('#case-title')).includes('Slip 102 of 480'));
  await page.click('#case-dialog summary:has-text("Why did it rank first?")');
  assert.ok((await page.textContent('#case-dialog .why')).includes('rare word coverage'));
  await page.click('#case-dialog summary:has-text("judged items")');
  await page.waitForSelector('#case-dialog .cands');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.i), '101');
  ok('keyboard: slider Home/End/arrows, wall arrows, Enter opens a slip, Escape returns focus to it');

  // 7. Readable alternative
  await page.click('#toggle-list');
  assert.equal(await page.locator('#listview tbody tr').count(), independent.queries);
  await page.click('#toggle-list');
  ok('list view carries all 480 rows');

  // 8. Receipt, at a known setting
  await page.check('input[name="promise"][value="exact"]');
  await setSlider(page, 400);
  const s400 = independent.settings.find((s) => s.slider === 400);
  await page.click('#ship');
  await page.waitForSelector('#receipt-dialog[open] #receipt-img');
  const sentence = await page.textContent('#receipt-sentence');
  assert.equal(sentence, `I’d recommend an item for ${s400.exact.kept + s400.exact.other} of ${independent.queries} searches. ${s400.exact.exact_shown} of those were exact matches.`);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#print')]);
  const path = await download.path();
  const png = readFileSync(path);
  assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
  assert.ok(png.length > 40_000);
  const link = await page.inputValue('#share-link');
  assert.ok(link.endsWith('?c=v1') && link.startsWith(BASE));
  ok(`receipt: sentence computed from the run, PNG exported (1080×1350, ${(png.length / 1024).toFixed(0)} KB), link ${link}`);
  await context.close();

  // 9. The challenge link in a fresh browser profile
  const fresh = await open(link);
  const html = await fresh.page.content();
  assert.ok(!/calls this/.test(html) && !/Substitute|Irrelevant|Complement/.test(await fresh.page.textContent('body')));
  const again = await playFive(fresh.page, ['recommend', 'recommend', 'recommend', 'recommend', 'recommend']);
  assert.deepEqual(again, QUERIES);
  ok('shared challenge in a fresh profile: same five cases, same order, answers hidden until each call');
  await fresh.context.close();
}

// 10. Reduced motion and a phone
{
  const { context, page } = await open(BASE, { viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  const box = await page.locator('.actions').boundingBox();
  assert.ok(box.y + box.height <= 844, 'Recommend / Pass are on screen without scrolling at 390×844');
  const [a, b] = await page.locator('.actions .btn').all();
  assert.equal(Math.round((await a.boundingBox()).width), Math.round((await b.boundingBox()).width));
  await playFive(page);
  await page.tap('[data-next="wall"]');
  await page.waitForSelector('.cell.mine');
  assert.deepEqual(await readCounts(page), want(independent.settings[0], 'exact'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  ok('phone + reduced motion: actions in reach, equal weight, flow reaches the wall, no sideways scroll');
  await context.close();
}

await browser.close();
console.log(`\n${done.length} checks passed.`);
