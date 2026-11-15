"""Okapi BM25 over product titles.

Collection statistics (document frequencies, average length) come from the unique products
seen in the fitting split only. At evaluation time an unseen term gets the maximum IDF.
"""
from __future__ import annotations

import math
from collections import Counter


class BM25:
    def __init__(self, k1: float = 1.2, b: float = 0.75):
        self.k1, self.b = k1, b
        self.n_docs = 0
        self.avgdl = 0.0
        self.df: Counter[str] = Counter()

    def fit(self, docs) -> "BM25":
        total = 0
        for toks in docs:
            self.n_docs += 1
            total += len(toks)
            self.df.update(set(toks))
        self.avgdl = total / max(self.n_docs, 1)
        return self

    def idf(self, term: str) -> float:
        df = self.df.get(term, 0)
        return math.log(1 + (self.n_docs - df + 0.5) / (df + 0.5))

    def score(self, query: list[str], doc: list[str]) -> float:
        if not doc:
            return 0.0
        tf = Counter(doc)
        norm = self.k1 * (1 - self.b + self.b * len(doc) / self.avgdl)
        s = 0.0
        for term in set(query):
            f = tf.get(term, 0)
            if f:
                s += self.idf(term) * f * (self.k1 + 1) / (f + norm)
        return s
