"""Focused checks on the pieces that would silently corrupt the result if they were wrong."""
import json
import math

import pandas as pd
import pytest

from pipeline import config as C
from pipeline.bm25 import BM25
from pipeline.features import FEATURE_NAMES, featurise
from pipeline.metrics import ndcg, rank_within_query
from pipeline.text import measures, numbers, tokens

IDF = lambda term: 1.0  # noqa: E731
F = {name: i for i, name in enumerate(FEATURE_NAMES)}


def feats(query, title, brand="", colour=""):
    return featurise(tokens(query), tokens(title), tokens(brand), tokens(colour), IDF)


# --- text ---------------------------------------------------------------------
def test_tokens_split_numbers_from_units_and_keep_decimals():
    assert tokens("16oz Tumbler, 1.50 L") == ["16", "oz", "tumbler", "1.5", "l"]
    assert tokens("WH-1000XM4") == ["wh", "1000", "xm", "4"]


def test_plural_and_missing_values():
    assert tokens("Glasses socks") == ["glasse", "sock"]
    assert tokens(None) == [] and tokens(float("nan")) == []


def test_inch_mark_and_unit_synonyms_agree():
    assert measures(tokens('12" pan')) == measures(tokens("12 inch pan")) == {("12", "in")}
    assert measures(tokens("pack of 18")) == set()  # "18" is not followed by a unit
    assert numbers(tokens("can coke pack 12")) == {"12"}


# --- features -----------------------------------------------------------------
def test_coverage_and_phrase():
    f = feats("glider without ottoman", "Atoll Glider with Ottoman, Espresso/Beige")
    assert f[F["title_coverage"]] == pytest.approx(2 / 3)
    assert f[F["phrase_match"]] == 0.0
    assert feats("white guitar", "Fender White Guitar Strap")[F["phrase_match"]] == 1.0


def test_number_and_unit_agreement():
    f = feats("giant monkey stuffed animal 8 feet", "Plush Monkey Ollie, Brown 8 Inch (Pack of 1)")
    assert f[F["numbers_matched"]] == 1.0 and f[F["numbers_missing"]] == 0.0
    # Same number, different unit: no unit match, and not a "conflict" either (the title has no feet at all).
    assert f[F["units_matched"]] == 0.0 and f[F["units_conflict"]] == 0.0
    g = feats("tv 55 inch", "Smart TV 65 Inch 4K")
    assert g[F["units_conflict"]] == 1.0 and g[F["numbers_missing"]] == 1.0


def test_no_numbers_means_both_number_features_are_zero():
    f = feats("white guitar", "White Guitar")
    assert f[F["numbers_matched"]] == 0.0 and f[F["numbers_missing"]] == 0.0


def test_brand_and_colour():
    f = feats("nintendo switch gray", "Nintendo Switch Lite - Gray", brand="Nintendo", colour="Gray")
    assert f[F["brand_in_query"]] == 1.0 and f[F["colour_in_query"]] == 1.0


# --- bm25 ---------------------------------------------------------------------
def test_bm25_prefers_the_title_with_the_rarer_word():
    docs = [["red", "shoe"], ["red", "hat"], ["red", "scarf"], ["blue", "shoe"]]
    bm = BM25().fit(docs)
    assert bm.idf("scarf") > bm.idf("red")
    assert bm.score(["red", "scarf"], docs[2]) > bm.score(["red", "scarf"], docs[1])
    assert bm.score(["green"], docs[0]) == 0.0


# --- ranking ------------------------------------------------------------------
def test_ties_break_on_product_id_not_on_label():
    df = pd.DataFrame({"query_id": [1, 1, 1], "product_id": ["B2", "B1", "B3"], "s": [0.5, 0.5, 0.9],
                       "esci_label": ["E", "I", "S"]})
    assert rank_within_query(df, "s").tolist() == [3, 2, 1]


def test_ndcg_uses_official_gains():
    assert ndcg(["E", "S", "I"]) == 1.0
    worst = (0 + 0.1 / math.log2(3) + 1 / math.log2(4)) / (1 + 0.1 / math.log2(3))
    assert ndcg(["I", "S", "E"]) == pytest.approx(worst)
    assert ndcg(["I", "I"]) == 0.0


# --- the real run (skipped until `make reproduce` has produced it) -------------
WORK = C.ROOT / "data" / "work" / "scored_heldout.parquet"
needs_run = pytest.mark.skipif(not WORK.exists(), reason="run `python -m pipeline.run` first")


@needs_run
def test_wall_is_a_complete_sample_of_official_test_queries():
    df = pd.read_parquet(WORK)
    wall = df[df.on_wall]
    assert wall.query_id.nunique() == C.WALL_SIZE
    assert set(wall.split) == {"test"}
    assert set(df.fold) == {"validation", "test"}
    raw = pd.read_parquet(C.RAW / "shopping_queries_dataset_examples.parquet",
                          columns=["query_id", "product_locale", "small_version"])
    raw = raw[(raw.product_locale == C.LOCALE) & (raw.small_version == 1)]
    expected = raw[raw.query_id.isin(wall.query_id.unique())].groupby("query_id").size()
    assert wall.groupby("query_id").size().equals(expected), "a sampled query lost judged candidates"


@needs_run
def test_validation_and_test_share_no_queries():
    df = pd.read_parquet(WORK)
    assert not set(df[df.fold == "validation"].query_id) & set(df[df.fold == "test"].query_id)
    assert set(df[df.fold == "validation"].split) == {"train"}


@needs_run
def test_bundle_matches_the_run():
    wall = json.loads((C.SITE_DATA / f"wall-{C.BUNDLE_VERSION}.json").read_text())
    first = json.loads((C.SITE_DATA / "first-case.json").read_text())
    scores = [it["top"]["score"] for it in wall["items"]]
    assert scores == sorted(scores) and len(scores) == C.WALL_SIZE
    assert set(C.CHALLENGE_V1) <= {it["qid"] for it in wall["items"]}
    assert not {"label", "score", "f", "bm25"} & set(first["case"]["top"]), "the opening case leaks its answer"
    df = pd.read_parquet(WORK)
    top = df[df.on_wall & (df.rank_model == 1)].set_index("query_id")
    for it in wall["items"]:
        row = top.loc[it["qid"]]
        assert it["top"]["id"] == row.product_id and it["top"]["label"] == row.esci_label
        assert it["n"] == int((df.query_id == it["qid"]).sum())
