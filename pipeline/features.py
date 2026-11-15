"""The thirteen features the learned ranker sees. All come from the query, title, brand and colour."""
from __future__ import annotations

import math

from .text import measures, numbers

FEATURES = [
    ("title_coverage", "Share of the shopper's words found in the title"),
    ("rare_word_coverage", "The same share, weighted so rarer words count more"),
    ("phrase_match", "The whole query appears in the title, in order"),
    ("word_pair_coverage", "Share of adjacent word pairs from the query found in the title"),
    ("numbers_matched", "Share of the query's numbers found in the title"),
    ("numbers_missing", "Share of the query's numbers absent from the title"),
    ("units_matched", "Share of number+unit pairs (16 oz, 2 pack) found in the title"),
    ("units_conflict", "Share of number+unit pairs where the title has that unit with a different number"),
    ("brand_in_query", "The listing's brand is named in the query"),
    ("colour_in_query", "The listing's colour is named in the query"),
    ("early_match", "How near the front of the title the first shared word sits"),
    ("title_length", "Title length (log of word count)"),
    ("query_length", "Query length (log of word count); the same for every candidate of a query"),
]
FEATURE_NAMES = [name for name, _ in FEATURES]


def _contains_phrase(needle: list[str], hay: list[str]) -> bool:
    n = len(needle)
    if n == 0 or n > len(hay):
        return False
    first = needle[0]
    for i in range(len(hay) - n + 1):
        if hay[i] == first and hay[i:i + n] == needle:
            return True
    return False


def featurise(q: list[str], title: list[str], brand: list[str], colour: list[str], idf) -> list[float]:
    """q, title, brand, colour are token lists from text.tokens(); idf is a callable term -> weight."""
    q_set, t_set = set(q), set(title)
    shared = q_set & t_set

    coverage = len(shared) / len(q_set) if q_set else 0.0
    idf_total = sum(idf(t) for t in q_set)
    rare = sum(idf(t) for t in shared) / idf_total if idf_total > 0 else 0.0

    phrase = 1.0 if _contains_phrase(q, title) else 0.0
    q_pairs = set(zip(q, q[1:]))
    pairs = len(q_pairs & set(zip(title, title[1:]))) / len(q_pairs) if q_pairs else 0.0

    q_nums = numbers(q)
    t_nums = numbers(title)
    nums_matched = len(q_nums & t_nums) / len(q_nums) if q_nums else 0.0
    nums_missing = len(q_nums - t_nums) / len(q_nums) if q_nums else 0.0

    q_meas = measures(q)
    t_meas = measures(title)
    if q_meas:
        t_units = {u for _, u in t_meas}
        units_matched = len(q_meas & t_meas) / len(q_meas)
        units_conflict = sum(1 for m in q_meas if m not in t_meas and m[1] in t_units) / len(q_meas)
    else:
        units_matched = units_conflict = 0.0

    brand_in_query = 1.0 if brand and _contains_phrase(brand, q) else 0.0
    colour_in_query = 1.0 if colour and any(c in q_set for c in colour) else 0.0

    early = 0.0
    for i, tok in enumerate(title):
        if tok in q_set:
            early = 1.0 - i / len(title)
            break

    return [
        coverage, rare, phrase, pairs,
        nums_matched, nums_missing, units_matched, units_conflict,
        brand_in_query, colour_in_query, early,
        math.log1p(len(title)), math.log1p(len(q)),
    ]
