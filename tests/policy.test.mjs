// node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PASS_ALL, agrees, changedByPromise, cutoffForPassed, outcome, passedCount, tally } from '../site/js/policy.js';
import { compare, contributions, score } from '../site/js/explain.js';

const item = (s, label) => ({ top: { score: s, label } });
const shelf = [item(0.2, 'E'), item(0.4, 'S'), item(0.4, 'I'), item(0.6, 'C'), item(0.8, 'E'), item(0.9, 'S')];

test('the three counts always account for every query', () => {
  for (const cut of [0, 0.2, 0.4, 0.41, 0.8, 0.9, PASS_ALL]) for (const promise of ['exact', 'substitute']) {
    const t = tally(shelf, cut, promise);
    assert.equal(t.kept + t.other + t.passed, shelf.length);
    assert.equal(t.shown, t.kept + t.other);
  }
});

test('extremes: recommend everything, pass on everything', () => {
  assert.deepEqual(pick(tally(shelf, 0, 'exact')), { kept: 2, other: 4, passed: 0, passedKeepable: 0 });
  assert.deepEqual(pick(tally(shelf, PASS_ALL, 'exact')), { kept: 0, other: 0, passed: 6, passedKeepable: 2 });
  assert.deepEqual(pick(tally(shelf, PASS_ALL, 'substitute')), { kept: 0, other: 0, passed: 6, passedKeepable: 4 });
});

test('a score equal to the cutoff is recommended, and ties stay together', () => {
  assert.equal(passedCount(shelf, 0.4), 1);
  assert.equal(cutoffForPassed(shelf, 2), 0.4); // asks to split the tie; both 0.4 items end up recommended
  assert.equal(passedCount(shelf, cutoffForPassed(shelf, 2)), 1);
  assert.equal(cutoffForPassed(shelf, 6), PASS_ALL);
});

test('changing the promise changes verdicts on substitutes only, and moves nothing', () => {
  const changed = changedByPromise(shelf, 0.5, 'exact', 'substitute');
  assert.deepEqual(changed, [1, 5]);
  assert.equal(outcome(shelf[5], 0.5, 'exact'), 'other');
  assert.equal(outcome(shelf[5], 0.5, 'substitute'), 'kept');
  assert.equal(outcome(shelf[1], 0.5, 'exact'), 'passed');
  assert.equal(outcome(shelf[1], 0.5, 'substitute'), 'missed');
  assert.equal(tally(shelf, 0.5, 'exact').shown, tally(shelf, 0.5, 'substitute').shown);
});

test('game scoring: recommend agrees with Exact only', () => {
  assert.ok(agrees('recommend', 'E')); assert.ok(agrees('pass', 'S'));
  assert.ok(!agrees('recommend', 'S')); assert.ok(!agrees('pass', 'E'));
});

function pick(t) { return { kept: t.kept, other: t.other, passed: t.passed, passedKeepable: t.passedKeepable }; }

// ── Against the shipped bundle ──────────────────────────────────────────────
const wall = JSON.parse(readFileSync(new URL('../site/data/wall-v1.json', import.meta.url)));
const independent = JSON.parse(readFileSync(new URL('../results/independent_counts.json', import.meta.url)));

test('browser arithmetic reproduces every offline model score on the wall', () => {
  for (const it of wall.items) for (const p of [it.top, it.runner_up].filter(Boolean)) {
    assert.ok(Math.abs(score(wall.model, p.f) - p.score) < 2e-5, `${it.qid} ${p.id}`);
  }
});

test('contributions sum to the logit, and the winner out-scores the runner-up', () => {
  for (const it of wall.items.filter((x) => x.runner_up)) {
    const rows = compare(wall.model, it.top.f, it.runner_up.f);
    const gap = rows.reduce((s, r) => s + r.gap, 0);
    assert.ok(gap >= -1e-4, `runner-up beats winner for ${it.qid}`);
    const total = contributions(wall.model, it.top.f).reduce((s, c) => s + c.contribution, wall.model.intercept);
    assert.ok(Math.abs(1 / (1 + Math.exp(-total)) - it.top.score) < 2e-5);
  }
});

test('policy.js agrees with the independent pandas count at every checked setting', () => {
  assert.equal(wall.items.length, independent.queries);
  for (const s of independent.settings) for (const promise of ['exact', 'substitute']) {
    const t = tally(wall.items, s.cutoff, promise), want = s[promise];
    assert.deepEqual({ kept: t.kept, other: t.other, passed: t.passed, passed_keepable: t.passedKeepable, exact_shown: t.exactShown, substitute_shown: t.substituteShown }, want, `${s.name} / ${promise}`);
  }
});
