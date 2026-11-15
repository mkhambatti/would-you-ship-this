// Captures from the real page: the three design-review frames, the social preview, and the
// frames for the README recording. Nothing here is mocked; it drives the same build visitors get.
//
//   npm run serve &   then   node scripts/captures.mjs   then   python scripts/make_gif.py
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = 'docs/captures', FRAMES = 'data/work/frames';
mkdirSync(OUT, { recursive: true }); rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const CALLS = ['pass', 'recommend', 'recommend', 'pass', 'pass'];

async function play(page, pause = 0) {
  for (let i = 0; i < 5; i++) {
    await page.click(`[data-choice="${CALLS[i]}"]`);
    await page.waitForSelector('.verdict');
    if (pause) await page.waitForTimeout(pause);
    if (i < 4) await page.click('[data-next="case"]');
  }
}

// 1. The first case on a 390px phone
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/first-case-phone-390.png` });
  await page.close();
}

// 2. The social preview: the opening case as rendered, 1200 × 630
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '?card', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'site/img/social-preview.png' });
  await page.close();
}

// 3. The full wall on desktop, after a real five-round game; then the receipt from that run
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await play(page);
  await page.click('[data-next="wall"]');
  await page.waitForSelector('#wallview:not(.arriving) .cell.mine');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/shelf-wall-desktop.png` });
  await page.click('#ship');
  await page.waitForSelector('#receipt-img');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#print')]);
  await download.saveAs(`${OUT}/receipt.png`);
  await context.close();

  // The receipt the way a feed shows it: small, among other things.
  const thumb = await browser.newPage({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 2 });
  await thumb.setContent(`<body style="margin:0;background:#fff;display:grid;place-items:center;height:100vh"><img id="r" style="width:240px;border-radius:10px"></body>`);
  const b64 = (await import('node:fs')).readFileSync(`${OUT}/receipt.png`).toString('base64');
  await thumb.evaluate((b) => { document.getElementById('r').src = 'data:image/png;base64,' + b; }, b64);
  await thumb.waitForTimeout(200);
  await thumb.screenshot({ path: `${OUT}/receipt-feed-thumbnail.png` });
  await thumb.close();
}

// 4. Frames for the README recording
{
  const page = await browser.newPage({ viewport: { width: 880, height: 600 }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  let n = 0; const t0 = Date.now();
  const hold = async (ms) => { const end = Date.now() + ms; do { await page.screenshot({ path: `${FRAMES}/${String(n++).padStart(4, '0')}.png` }); } while (Date.now() < end); };
  await hold(1300);
  await page.hover('[data-choice="pass"]'); await hold(400);
  await page.click('[data-choice="pass"]'); await hold(2000);
  for (let i = 1; i < 5; i++) {
    await page.click('[data-next="case"]'); await hold(i === 1 ? 900 : 450);
    await page.click(`[data-choice="${CALLS[i]}"]`); await hold(i === 1 ? 1300 : 650);
  }
  await page.click('[data-next="wall"]'); await hold(3800);
  for (const k of [386, 340, 290, 240, 190, 140, 100, 60, 100, 160, 220, 280]) {
    await page.evaluate((k) => { const el = document.getElementById('cutoff'); el.value = k; el.dispatchEvent(new Event('input', { bubbles: true })); }, k);
    await hold(150);
  }
  await hold(700);
  await page.check('input[name="promise"][value="substitute"]'); await hold(1600);
  await page.click('.cell.mine'); await hold(1500);
  await page.keyboard.press('Escape'); await hold(300);
  await page.click('#ship'); await hold(2400);
  (await import('node:fs')).writeFileSync(`${FRAMES}/meta.json`, JSON.stringify({ frames: n, ms: Date.now() - t0 }));
  console.log(`${n} frames in ${Date.now() - t0} ms`);
  await page.close();
}
await browser.close();
console.log('captures written to', OUT);
