"""Turn the scored held-out rows into the small, versioned files the browser loads.

    python -m pipeline.bundle

Everything here is a lookup or a reshape. No number is computed that pipeline.run did not
already write, apart from rounding (scores and feature values to 6 decimal places).
"""
from __future__ import annotations

import html
import json
import re

import pandas as pd
import pyarrow.dataset as ds

from . import config as C
from .features import FEATURE_NAMES

LABELS = {
    # Wording from the dataset paper (Reddy et al., 2022, arXiv:2206.06588), section 3.
    "E": {"name": "Exact", "article": "an exact match",
          "meaning": "The item is relevant for the query, and satisfies all the query specifications."},
    "S": {"name": "Substitute", "article": "a substitute",
          "meaning": "The item is somewhat relevant: it fails to fulfill some aspects of the query but the item can be used as a functional substitute."},
    "C": {"name": "Complement", "article": "a complement",
          "meaning": "The item does not fulfill the query, but could be used in combination with an exact item."},
    "I": {"name": "Irrelevant", "article": "irrelevant",
          "meaning": "The item is irrelevant, or it fails to fulfill a central aspect of the query."},
}
DETAIL_CAP = 1200


def clean(text) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t]+", " ", html.unescape(text)).strip()


def cap(text: str) -> dict:
    return {"text": text[:DETAIL_CAP], "truncated": len(text) > DETAIL_CAP}


def product(row, feats: bool = True) -> dict:
    out = {"id": row.product_id, "example_id": int(row.example_id), "title": clean(row.product_title),
           "brand": clean(row.product_brand), "color": clean(row.product_color)}
    if feats:
        out |= {"label": row.esci_label, "score": round(float(row.score), 6), "bm25": round(float(row.bm25), 4),
                "f": [round(float(getattr(row, f"f_{n}")), 6) for n in FEATURE_NAMES]}
    return out


def write(name: str, obj) -> None:
    path = C.SITE_DATA / name
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{name:26s} {path.stat().st_size / 1024:8.1f} KB")


def main() -> None:
    df = pd.read_parquet(C.ROOT / "data" / "work" / "scored_heldout.parquet")
    wall = df[df.on_wall].copy()
    wall["score"] = wall.score.round(6)
    assert wall.query_id.nunique() == C.WALL_SIZE
    results = json.loads((C.RESULTS / "metrics.json").read_text())
    model = json.loads((C.RESULTS / "model.json").read_text())

    top = wall[wall.rank_model == 1].set_index("query_id")
    second = wall[wall.rank_model == 2].set_index("query_id")
    bm_top = wall[wall.rank_bm25 == 1].set_index("query_id")
    counts = wall.groupby("query_id").esci_label.value_counts().unstack(fill_value=0)

    order = top.reset_index().sort_values(["score", "query_id"]).query_id.tolist()  # least sure first
    items = []
    for qid in order:
        t = top.loc[qid]
        item = {"qid": int(qid), "query": t["query"], "source": t.source, "n": int(counts.loc[qid].sum()),
                "judged": {k: int(v) for k, v in counts.loc[qid].items() if v},
                "top": product(t), "bm25_top": {"id": bm_top.loc[qid].product_id, "label": bm_top.loc[qid].esci_label}}
        if qid in second.index:
            item["runner_up"] = product(second.loc[qid])
        items.append(item)
    by_qid = {it["qid"]: it for it in items}

    meta = {
        "bundle": C.BUNDLE_VERSION, "model_version": C.MODEL_VERSION, "labels": LABELS,
        "source": results["source"], "splits": results["splits"], "wall": results["wall"],
        "precomputed": "Model scores, BM25 scores, feature values and rankings were computed offline by pipeline/run.py. "
                       "The browser recomputes recommend/pass decisions, every count, feature contributions and the receipt.",
    }
    slim_model = {"version": model["version"], "intercept": model["intercept"], "tie_break": model["tie_break"],
                  "features": model["features"]}

    # Listing details for the five challenge products only; the bundle stays small.
    ids = [by_qid[q]["top"]["id"] for q in C.CHALLENGE_V1]
    details = ds.dataset(C.RAW / "shopping_queries_dataset_products.parquet").to_table(
        columns=["product_id", "product_bullet_point", "product_description"],
        filter=(ds.field("product_locale") == C.LOCALE) & ds.field("product_id").isin(ids),
    ).to_pandas().set_index("product_id")

    cases = []
    for n, qid in enumerate(C.CHALLENGE_V1):
        it = json.loads(json.dumps(by_qid[qid]))
        d = details.loc[it["top"]["id"]]
        bullets = [clean(b) for b in (d.product_bullet_point or "").split("\n") if clean(b)]
        it["top"]["bullets"] = [cap(b)["text"] for b in bullets][:8]
        it["top"]["description"] = cap(clean(d.product_description))
        it["round"] = n + 1
        it["wall_index"] = order.index(qid)
        cases.append(it)

    # The opening case ships alone, with nothing that gives the answer away.
    first = cases[0]
    hidden = {"label", "score", "bm25", "f"}
    write("first-case.json", {"challenge": C.BUNDLE_VERSION, "rounds": len(cases), "case": {
        "qid": first["qid"], "query": first["query"], "n": first["n"],
        "top": {k: v for k, v in first["top"].items() if k not in hidden}}})
    write(f"challenge-{C.BUNDLE_VERSION}.json", {"challenge": C.BUNDLE_VERSION, "title": "Selected challenges",
          "note": "Hand-picked from the wall sample for variety and legibility. Not a benchmark.",
          "meta": meta, "model": slim_model, "cases": cases})
    write(f"wall-{C.BUNDLE_VERSION}.json", {"meta": meta, "model": slim_model, "metrics": results["metrics"],
          "policy": results["policy"], "bm25": results["bm25"], "ndcg_gains": results["ndcg_gains"],
          "reliability": results["reliability_of_rank1_score"], "challenge": C.CHALLENGE_V1, "items": items})

    cands = {}
    for qid, g in wall.sort_values(["query_id", "rank_model"]).groupby("query_id", sort=False):
        cands[int(qid)] = [[r.product_id, clean(r.product_title), r.esci_label, float(r.score), round(float(r.bm25), 3),
                            int(r.rank_bm25), int(r.example_id)] for r in g.itertuples()]
    write(f"candidates-{C.BUNDLE_VERSION}.json", {"columns": ["product_id", "title", "label", "model_score", "bm25",
          "bm25_rank", "example_id"], "queries": cands})

    for c in cases:
        r = c.get("runner_up", {})
        print(f"\n#{c['round']} wall[{c['wall_index']}] q{c['qid']} {c['query']!r} n={c['n']} {c['judged']}"
              f"\n   1st {c['top']['label']} {c['top']['score']:.3f} {c['top']['title']!r} brand={c['top']['brand']!r} color={c['top']['color']!r}"
              f"\n   2nd {r.get('label')} {r.get('score', 0):.3f} {r.get('title')!r}"
              f"\n   bullets={len(c['top']['bullets'])} desc={len(c['top']['description']['text'])}")


if __name__ == "__main__":
    main()
