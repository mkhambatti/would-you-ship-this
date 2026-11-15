// The souvenir. Drawn on a canvas from the visitor's actual run; nothing leaves the browser.
// 1080 × 1350 (4:5), so it holds up in a feed and still reads at thumbnail size:
// a white slip with one clipped corner on an ultramarine field.

const INK = '#20211E', BLUE = '#2948D8', SLIP = '#FFFDF7', SOFT = 'rgba(32,33,30,.62)';
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif';

export function receiptSentence(d) {
  const t = d.tally;
  let s = `I’d recommend an item for ${t.shown} of ${t.total} searches. ${t.exactShown} of those were exact matches.`;
  if (d.promise === 'substitute') s += ` ${t.substituteShown} were substitutes, which I allowed.`;
  return s;
}

export function cutoffText(d) {
  if (d.tally.shown === 0) return 'pass on everything';
  if (d.tally.passed === 0) return 'recommend everything';
  return `model score ≥ ${d.cutoff.toFixed(3)}`;
}

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function clip(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
  return text.trimEnd() + '…';
}

export async function drawReceipt(canvas, d) {
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (document.fonts) {
    await Promise.all([document.fonts.load(`400 80px ${SERIF}`), document.fonts.load(`italic 400 40px ${SERIF}`), document.fonts.load(`600 24px ${SANS}`), document.fonts.load(`400 24px ${SANS}`)]);
  }
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, H);

  // The slip, a little off-axis, with the clipped upper-right corner.
  const x = 88, y = 74, w = W - 176, h = H - 148, cut = 124;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.rotate(-1.4 * Math.PI / 180); ctx.translate(-W / 2, -H / 2);
  ctx.shadowColor = 'rgba(10,16,60,.38)'; ctx.shadowBlur = 34; ctx.shadowOffsetY = 20;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.fillStyle = SLIP; ctx.fill();
  ctx.shadowColor = 'transparent';

  const L = x + 58, R = x + w - 58;
  let cy = y + 74;
  ctx.textBaseline = 'alphabetic'; ctx.fillStyle = SOFT;
  ctx.font = `600 22px ${SANS}`; ctx.letterSpacing = '2.2px';
  ctx.fillText('RECEIPT', L, cy);
  ctx.letterSpacing = '0px';
  cy += 22; ctx.fillStyle = INK; ctx.fillRect(L, cy, R - L - cut + 30, 2);

  // Headline
  cy += 116; ctx.fillStyle = INK; ctx.font = `400 136px ${SERIF}`;
  ctx.fillText('I shipped this.', L - 4, cy);

  // Five calls
  cy += 50; ctx.font = `600 20px ${SANS}`; ctx.fillStyle = SOFT; ctx.letterSpacing = '2px';
  ctx.fillText('MY FIVE CALLS', L, cy); ctx.letterSpacing = '0px';
  cy += 18;
  const rows = d.choices.length ? d.choices : [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    cy += 54;
    ctx.fillStyle = 'rgba(32,33,30,.16)'; ctx.fillRect(L, cy - 39, R - L, 1);
    ctx.fillStyle = SOFT; ctx.font = `600 24px ${SANS}`; ctx.fillText(String(i + 1), L, cy);
    const tag = c.choice === 'recommend' ? 'RECOMMEND' : 'PASS';
    ctx.font = `700 22px ${SANS}`; ctx.letterSpacing = '1.5px';
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = c.choice === 'recommend' ? BLUE : INK;
    ctx.fillText(tag, R - tw, cy); ctx.letterSpacing = '0px';
    ctx.fillStyle = INK; ctx.font = `400 40px ${SERIF}`;
    ctx.fillText(clip(ctx, c.query, R - L - 44 - tw - 30), L + 44, cy + 2);
  }
  if (!rows.length) { cy += 58; ctx.fillStyle = INK; ctx.font = `italic 400 38px ${SERIF}`; ctx.fillText('Skipped the counter, went straight to the wall.', L, cy); }
  cy += 24; ctx.fillStyle = INK; ctx.fillRect(L, cy, R - L, 2);
  if (rows.length) {
    cy += 40; ctx.font = `400 24px ${SANS}`; ctx.fillStyle = SOFT;
    const got = rows.filter((c) => c.agree).length;
    ctx.fillText(`${got} of ${rows.length} matched the dataset’s labels. Which ones, I’m not saying.`, L, cy);
  }

  // The sentence, computed from the chosen policy. Shrink until it fits three lines.
  ctx.fillStyle = INK;
  let size = 62, lines;
  do { ctx.font = `400 ${size}px ${SERIF}`; lines = wrap(ctx, receiptSentence(d), R - L); size -= 3; } while (lines.length > 3 && size > 36);
  const lead = Math.round((size + 3) * 1.1);
  cy += 22 + lead;
  for (const line of lines) { ctx.fillText(line, L, cy); cy += lead; }

  // The three counts, big enough to survive a thumbnail
  const t = d.tally;
  const footTop = y + h - 150;
  const cols = d.promise === 'substitute'
    ? [[t.exactShown, 'exact shown'], [t.substituteShown, 'substitutes shown'], [t.other, 'other shown'], [t.passed, 'passed']]
    : [[t.exactShown, 'exact matches shown'], [t.other, 'other items shown'], [t.passed, 'queries passed']];
  const colW = (R - L) / cols.length;
  cols.forEach(([n, label], i) => {
    const cx = L + i * colW;
    ctx.fillStyle = i === 0 ? BLUE : INK; ctx.font = `400 92px ${SERIF}`;
    ctx.fillText(String(n), cx - 3, footTop - 34);
    ctx.fillStyle = SOFT; ctx.font = `600 21px ${SANS}`;
    ctx.fillText(label, cx, footTop);
  });

  // Foot: project name, challenge link, and the setting
  ctx.fillStyle = INK; ctx.fillRect(L, footTop + 26, R - L, 2);
  ctx.font = `italic 400 46px ${SERIF}`; ctx.fillStyle = INK;
  ctx.fillText('Would You Ship This?', L, footTop + 80);
  ctx.font = `600 25px ${SANS}`; ctx.fillStyle = BLUE;
  ctx.fillText(clip(ctx, d.link.replace(/^https?:\/\//, ''), R - L), L, footTop + 120);
  ctx.fillStyle = INK; ctx.font = `600 20px ${SANS}`;
  const setting = `${d.promiseName} · ${cutoffText(d)}`;
  ctx.fillText(setting, R - ctx.measureText(setting).width, footTop + 62);
  ctx.fillStyle = SOFT; ctx.font = `400 18px ${SANS}`;
  const stamp = `${d.date} · challenge ${d.challenge} · ${d.model}`;
  ctx.fillText(stamp, R - ctx.measureText(stamp).width, footTop + 88);
  ctx.restore();
  return canvas;
}
