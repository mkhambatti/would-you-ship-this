"""Ranking metrics and the tie-break rule, kept separate so the tests can hit them directly."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .config import NDCG_GAINS


def rank_within_query(df: pd.DataFrame, score_col: str) -> pd.Series:
    """1-based rank. Higher score first; equal scores are broken by product_id ascending.

    The tie-break is arbitrary but fixed, and it does not look at the label.
    """
    order = df.sort_values(["query_id", score_col, "product_id"], ascending=[True, False, True], kind="mergesort")
    ranks = order.groupby("query_id", sort=False).cumcount() + 1
    return ranks.reindex(df.index)


def dcg(gains) -> float:
    return sum(g / math.log2(i + 2) for i, g in enumerate(gains))


def ndcg(labels_in_rank_order: list[str], k: int | None = None) -> float:
    gains = [NDCG_GAINS[label] for label in labels_in_rank_order]
    ideal = sorted(gains, reverse=True)
    if k:
        gains, ideal = gains[:k], ideal[:k]
    denom = dcg(ideal)
    return dcg(gains) / denom if denom > 0 else 0.0


def summarise(df: pd.DataFrame, rank_col: str) -> dict:
    """Query-averaged metrics for one ranking of one split."""
    ordered = df.sort_values(["query_id", rank_col])
    n10, nall, exact1, ok1, rr = [], [], [], [], []
    for _, labels in ordered.groupby("query_id", sort=False)["esci_label"]:
        labels = labels.tolist()
        n10.append(ndcg(labels, 10))
        nall.append(ndcg(labels))
        exact1.append(labels[0] == "E")
        ok1.append(labels[0] in "ES")
        rr.append(next((1 / (i + 1) for i, l in enumerate(labels) if l == "E"), 0.0))
    return {
        "queries": len(n10),
        "ndcg": round(float(np.mean(nall)), 4),
        "ndcg_at_10": round(float(np.mean(n10)), 4),
        "exact_at_1": round(float(np.mean(exact1)), 4),
        "exact_or_substitute_at_1": round(float(np.mean(ok1)), 4),
        "mrr_exact": round(float(np.mean(rr)), 4),
    }


def chance(df: pd.DataFrame) -> dict:
    """What a uniformly random pick from each candidate set would score at rank one."""
    per_query = df.assign(e=df.esci_label == "E", es=df.esci_label.isin(["E", "S"])).groupby("query_id")[["e", "es"]].mean()
    return {
        "queries": len(per_query),
        "exact_at_1": round(float(per_query.e.mean()), 4),
        "exact_or_substitute_at_1": round(float(per_query.es.mean()), 4),
    }
