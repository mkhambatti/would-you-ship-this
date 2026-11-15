"""Offline experiment: join, split, fit, score, measure. Writes results/ and data/work/.

    python -m pipeline.run
"""
from __future__ import annotations

import hashlib
import json
import platform

import numpy as np
import pandas as pd
import pyarrow.dataset as ds
import sklearn
from sklearn.linear_model import LogisticRegression

from . import config as C
from .bm25 import BM25
from .features import FEATURE_NAMES, FEATURES, featurise
from .metrics import chance, rank_within_query, summarise
from .text import tokens

WORK = C.ROOT / "data" / "work"


def bucket(salt: str, query_id: int) -> int:
    return int(hashlib.sha256(f"{salt}:{query_id}".encode()).hexdigest(), 16)


def load() -> pd.DataFrame:
    ex = pd.read_parquet(C.RAW / "shopping_queries_dataset_examples.parquet")
    ex = ex[(ex.product_locale == C.LOCALE) & (ex[C.VERSION_COLUMN] == 1)].copy()
    products = ds.dataset(C.RAW / "shopping_queries_dataset_products.parquet").to_table(
        columns=["product_id", "product_locale", "product_title", "product_brand", "product_color"],
        filter=ds.field("product_locale") == C.LOCALE,
    ).to_pandas()
    assert not products.duplicated(["product_locale", "product_id"]).any()
    df = ex.merge(products, how="left", on=["product_locale", "product_id"], validate="many_to_one")
    assert len(df) == len(ex)
    assert not df.duplicated(["query_id", "product_id"]).any(), "a product is judged twice for one query"
    sources = pd.read_csv(C.RAW / "shopping_queries_dataset_sources.csv")
    df = df.merge(sources, how="left", on="query_id", validate="many_to_one")
    df["fold"] = df["split"]
    is_val = (df.split == "train") & df.query_id.map(lambda q: bucket(C.VALIDATION_SALT, q) % C.VALIDATION_MODULUS == 0)
    df.loc[is_val, "fold"] = "validation"
    return df.reset_index(drop=True)


def wall_query_ids(df: pd.DataFrame) -> list[int]:
    test_q = sorted(df.loc[df.fold == "test", "query_id"].unique())
    return sorted(test_q, key=lambda q: bucket(C.WALL_SALT, q))[: C.WALL_SIZE]


def cutoff_curve(top: pd.DataFrame) -> pd.DataFrame:
    """One row per distinct top-1 score: what happens if we recommend when score >= cutoff."""
    rows = []
    n = len(top)
    for cut in np.sort(top.score.unique()):
        shown = top[top.score >= cut]
        exact = int((shown.esci_label == "E").sum())
        rows.append({"cutoff": float(cut), "shown": len(shown), "exact_shown": exact,
                     "other_shown": len(shown) - exact, "passed": n - len(shown),
                     "exact_share_of_shown": exact / len(shown)})
    return pd.DataFrame(rows)


def policy_counts(top: pd.DataFrame, cutoff: float) -> dict:
    shown = top[top.score >= cutoff]
    passed = top[top.score < cutoff]
    return {
        "queries": len(top),
        "exact_shown": int((shown.esci_label == "E").sum()),
        "substitute_shown": int((shown.esci_label == "S").sum()),
        "other_shown": int((shown.esci_label != "E").sum()),
        "passed": len(passed),
        "passed_with_exact_at_rank_1": int((passed.esci_label == "E").sum()),
        "passed_with_exact_or_substitute_at_rank_1": int(passed.esci_label.isin(["E", "S"]).sum()),
    }


def reliability(top: pd.DataFrame, bins: int = 10) -> list[dict]:
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        sel = top[(top.score >= lo) & ((top.score < hi) | (hi == 1.0))]
        if len(sel):
            out.append({"bin": f"{lo:.1f}-{hi:.1f}", "n": len(sel),
                        "mean_score": round(float(sel.score.mean()), 4),
                        "exact_rate": round(float((sel.esci_label == "E").mean()), 4)})
    return out


def main() -> None:
    df = load()
    print(df.groupby("fold").agg(queries=("query_id", "nunique"), rows=("example_id", "count")))

    # Tokenise once per distinct string.
    q_tok = {q: tokens(q) for q in df["query"].unique()}
    prod = df.drop_duplicates("product_id").set_index("product_id")
    t_tok = {pid: tokens(t) for pid, t in prod.product_title.items()}
    b_tok = {pid: tokens(t) for pid, t in prod.product_brand.items()}
    c_tok = {pid: tokens(t) for pid, t in prod.product_color.items()}

    fit_products = df.loc[df.fold == "train", "product_id"].unique()
    bm25 = BM25(C.BM25_K1, C.BM25_B).fit(t_tok[p] for p in fit_products)
    print(f"bm25: {bm25.n_docs} titles, avgdl {bm25.avgdl:.1f}, vocab {len(bm25.df)}")

    X = np.empty((len(df), len(FEATURE_NAMES)))
    bm = np.empty(len(df))
    for i, (q, pid) in enumerate(zip(df["query"].values, df["product_id"].values)):
        qt, tt = q_tok[q], t_tok[pid]
        X[i] = featurise(qt, tt, b_tok[pid], c_tok[pid], bm25.idf)
        bm[i] = bm25.score(qt, tt)
    df["bm25"] = bm

    train = (df.fold == "train").values
    mean, std = X[train].mean(0), X[train].std(0)
    std[std == 0] = 1.0
    Z = (X - mean) / std
    y = (df.esci_label == "E").astype(int).values
    clf = LogisticRegression(C=C.LOGREG_C, max_iter=1000).fit(Z[train], y[train])
    coef, intercept = clf.coef_[0], float(clf.intercept_[0])
    # Score with plain arithmetic so it is the same computation the browser repeats.
    df["score"] = 1 / (1 + np.exp(-(Z @ coef + intercept)))
    for j, name in enumerate(FEATURE_NAMES):
        df[f"f_{name}"] = X[:, j]

    df["rank_bm25"] = rank_within_query(df, "bm25")
    df["rank_model"] = rank_within_query(df, "score")

    wall_ids = wall_query_ids(df)
    df["on_wall"] = df.query_id.isin(wall_ids)

    metrics = {}
    for fold in ["train", "validation", "test"]:
        part = df[df.fold == fold]
        metrics[fold] = {"bm25": summarise(part, "rank_bm25"), "logreg": summarise(part, "rank_model"),
                         "chance": chance(part)}
    wall = df[df.on_wall]
    metrics["wall_sample"] = {"bm25": summarise(wall, "rank_bm25"), "logreg": summarise(wall, "rank_model"),
                              "chance": chance(wall)}

    # Cutoff: chosen on validation with a rule fixed in config, then applied unchanged.
    top = df[df.rank_model == 1]
    curve_top = top[top.fold == "validation"]
    curve = cutoff_curve(curve_top)
    eligible = curve[(curve.exact_share_of_shown >= C.CUTOFF_MIN_EXACT_SHARE)
                     & (curve.shown >= C.CUTOFF_MIN_SHOWN_SHARE * len(curve_top))]
    # Round up to 4 places so the published number is at least as strict as the fitted one.
    cutoff = float(np.ceil(float(eligible.cutoff.min()) * 1e4) / 1e4) if len(eligible) else None
    curve.to_csv(C.RESULTS / "validation_cutoff_curve.csv", index=False, float_format="%.6f")

    policy = {"rule": f"lowest validation cutoff at which at least {C.CUTOFF_MIN_EXACT_SHARE:.0%} of recommended rank-1 "
                      f"items are Exact, while still recommending for at least {C.CUTOFF_MIN_SHOWN_SHARE:.0%} of queries",
              "cutoff": cutoff}
    if cutoff is not None:
        for name, part in [("validation", top[top.fold == "validation"]), ("test", top[top.fold == "test"]),
                           ("wall_sample", top[top.on_wall])]:
            policy[name] = policy_counts(part, cutoff)
    policy["always_recommend"] = {name: policy_counts(part, 0.0) for name, part in
                                  [("validation", top[top.fold == "validation"]), ("test", top[top.fold == "test"]),
                                   ("wall_sample", top[top.on_wall])]}

    model = {
        "version": C.MODEL_VERSION,
        "kind": "logistic regression on standardised features; target = label is Exact",
        "features": [{"name": n, "description": d, "mean": float(m), "std": float(s), "weight": float(w)}
                     for (n, d), m, s, w in zip(FEATURES, mean, std, coef)],
        "intercept": intercept,
        "C": C.LOGREG_C,
        "fit_rows": int(train.sum()),
        "fit_queries": int(df.loc[train, "query_id"].nunique()),
        "tie_break": "score descending, then product_id ascending",
    }
    results = {
        "source": {"repo": C.SOURCE_REPO, "revision": C.SOURCE_REVISION, "locale": C.LOCALE,
                   "subset": "Task 1 ranking (small_version == 1)", "sha256": C.SOURCE_FILES},
        "splits": {f: {"queries": int(df.loc[df.fold == f, "query_id"].nunique()), "judgements": int((df.fold == f).sum())}
                   for f in ["train", "validation", "test"]},
        "wall": {"size": len(wall_ids), "judgements": int(df.on_wall.sum()), "salt": C.WALL_SALT},
        "bm25": {"k1": C.BM25_K1, "b": C.BM25_B, "titles": bm25.n_docs, "avgdl": round(bm25.avgdl, 2)},
        "ndcg_gains": C.NDCG_GAINS,
        "metrics": metrics,
        "policy": policy,
        "reliability_of_rank1_score": {"validation": reliability(top[top.fold == "validation"]),
                                       "test": reliability(top[top.fold == "test"])},
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
                        "scikit_learn": sklearn.__version__},
    }
    C.RESULTS.mkdir(exist_ok=True)
    (C.RESULTS / "model.json").write_text(json.dumps(model, indent=2) + "\n")
    (C.RESULTS / "metrics.json").write_text(json.dumps(results, indent=2) + "\n")

    WORK.mkdir(parents=True, exist_ok=True)
    df[df.fold != "train"].to_parquet(WORK / "scored_heldout.parquet", index=False)
    print(json.dumps(metrics, indent=1))
    print(json.dumps(policy, indent=1))
    print(json.dumps(results["reliability_of_rank1_score"], indent=0))
    for f in model["features"]:
        print(f"{f['name']:22s} w={f['weight']:+.3f} mean={f['mean']:.3f} std={f['std']:.3f}")
    print("intercept", intercept)


if __name__ == "__main__":
    main()
