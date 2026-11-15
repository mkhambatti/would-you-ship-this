// "Why did it rank first?" The model is a logistic regression, so its score decomposes exactly:
//
//   logit = intercept + Σ weight_i × (value_i − mean_i) / std_i
//   model score = 1 / (1 + e^−logit)
//
// The weights, means and stds ship in the bundle. This file redoes the arithmetic in the
// browser from the shipped feature values, so the table is computed, not pasted.

export function contributions(model, values) {
  return model.features.map((f, i) => {
    const z = (values[i] - f.mean) / f.std;
    return { name: f.name, description: f.description, value: values[i], weight: f.weight, contribution: f.weight * z };
  });
}

export function logit(model, values) {
  return contributions(model, values).reduce((sum, c) => sum + c.contribution, model.intercept);
}

export function score(model, values) {
  return 1 / (1 + Math.exp(-logit(model, values)));
}

// Rows for the table: the winner beside the runner-up, largest gap first.
export function compare(model, winner, runnerUp) {
  const a = contributions(model, winner);
  const b = runnerUp ? contributions(model, runnerUp) : null;
  const rows = a.map((c, i) => ({
    name: c.name, description: c.description,
    value: c.value, contribution: c.contribution,
    otherValue: b ? b[i].value : null, otherContribution: b ? b[i].contribution : null,
    gap: b ? c.contribution - b[i].contribution : c.contribution,
  }));
  return rows.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap) || Math.abs(y.contribution) - Math.abs(x.contribution));
}
