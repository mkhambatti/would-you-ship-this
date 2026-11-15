// The launch policy. Pure functions, no DOM: the page and the tests import the same file.
//
// A wall item is one held-out search with the model's first-ranked product:
//   { top: { score: number, label: 'E' | 'S' | 'C' | 'I' } }
// Scores and rankings are precomputed offline. Everything below runs in the browser
// each time the visitor moves the cutoff or changes the promise.

export const PROMISES = {
  exact: { name: 'Exact match only', keeps: ['E'] },
  substitute: { name: 'A substitute is OK', keeps: ['E', 'S'] },
};

// A cutoff above every possible score: the assistant passes on everything.
export const PASS_ALL = 2;

export function decide(score, cutoff) {
  return score >= cutoff ? 'recommend' : 'pass';
}

export function keepsPromise(label, promise) {
  return PROMISES[promise].keeps.includes(label);
}

// What one slip looks like under the current setting.
//   kept    recommended, and the label keeps the promise
//   other   recommended, and it does not
//   missed  passed, though the first-ranked item would have kept the promise
//   passed  passed, and the first-ranked item would not have kept it
export function outcome(item, cutoff, promise) {
  const ok = keepsPromise(item.top.label, promise);
  if (decide(item.top.score, cutoff) === 'recommend') return ok ? 'kept' : 'other';
  return ok ? 'missed' : 'passed';
}

// The three counts on the dock. kept + other + passed === total, always.
export function tally(items, cutoff, promise) {
  const t = { total: items.length, shown: 0, kept: 0, exactShown: 0, substituteShown: 0, other: 0, passed: 0, passedKeepable: 0 };
  for (const item of items) {
    const { score, label } = item.top;
    if (decide(score, cutoff) === 'recommend') {
      t.shown += 1;
      if (label === 'E') t.exactShown += 1;
      if (label === 'S') t.substituteShown += 1;
      if (keepsPromise(label, promise)) t.kept += 1; else t.other += 1;
    } else {
      t.passed += 1;
      if (keepsPromise(label, promise)) t.passedKeepable += 1;
    }
  }
  return t;
}

// Items must be sorted by score ascending. Returns how many are passed at this cutoff.
export function passedCount(items, cutoff) {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].top.score < cutoff) lo = mid + 1; else hi = mid;
  }
  return lo;
}

// The cutoff that passes exactly the first k items (or the nearest tie boundary below it).
export function cutoffForPassed(items, k) {
  if (k <= 0) return 0;
  if (k >= items.length) return PASS_ALL;
  return items[k].top.score;
}

// Which slips change verdict when the promise changes and nothing else does.
export function changedByPromise(items, cutoff, from, to) {
  const out = [];
  items.forEach((item, i) => {
    if (outcome(item, cutoff, from) !== outcome(item, cutoff, to)) out.push(i);
  });
  return out;
}

// For the five-case game: did the visitor's call match what the label implies under the promise?
export function agrees(choice, label, promise = 'exact') {
  return (choice === 'recommend') === keepsPromise(label, promise);
}
