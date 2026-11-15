"""Every frozen choice in one place. Change something here and the bundle version should change too."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
RESULTS = ROOT / "results"
SITE_DATA = ROOT / "site" / "data"

# --- Source -----------------------------------------------------------------
SOURCE_REPO = "https://github.com/amazon-science/esci-data"
SOURCE_REVISION = "7916cdf6ab75a462e77f20ab40428a10923998d5"
SOURCE_FILES = {
    # name -> sha256 of the file at SOURCE_REVISION (Git LFS objects, fetched via /raw/)
    "shopping_queries_dataset_examples.parquet": "4a735b693b4a424a6fc67f5be6e4c811495c488bbf66d02a602d308b2744263a",
    "shopping_queries_dataset_products.parquet": "25124442d064d64b26f74082d6fa09438d679efc0c183cf28d19064a2b65a265",
    "shopping_queries_dataset_sources.csv": "a5fed8ecc016443de40bf3c63098f0e3f23bbe4daa4236f1c38b8c3184778c50",
}
LOCALE = "us"
VERSION_COLUMN = "small_version"  # the Task 1 "ranking" subset

# --- Splits -----------------------------------------------------------------
# The official train/test split is kept as published. Validation is carved out of
# official-train by query: a query is validation when sha256("wyst-val:<query_id>") % 5 == 0.
VALIDATION_SALT = "wyst-val"
VALIDATION_MODULUS = 5

# --- Wall sample ------------------------------------------------------------
# Official-test queries are ordered by sha256("wyst-wall-v1:<query_id>") and the first
# WALL_SIZE are kept, each with its complete judged candidate set.
WALL_SALT = "wyst-wall-v1"
WALL_SIZE = 480

# --- Models -----------------------------------------------------------------
BM25_K1 = 1.2
BM25_B = 0.75
LOGREG_C = 1.0  # scikit-learn default, not tuned
MODEL_VERSION = "title-logreg-v1"
BUNDLE_VERSION = "v1"

# Official KDD Cup 2022 Task 1 gains.
NDCG_GAINS = {"E": 1.0, "S": 0.1, "C": 0.01, "I": 0.0}

# --- Selected challenges (hand-picked from the wall sample; see pipeline/find_challenges.py)
CHALLENGE_V1: list[int] = [45968, 111136, 15936, 106960, 45120]

# --- Cutoff rule -------------------------------------------------------------
# Among validation cutoffs, take the lowest one where at least CUTOFF_MIN_EXACT_SHARE of
# recommended first-ranked items are labelled Exact, and the assistant still recommends
# for at least CUTOFF_MIN_SHOWN_SHARE of queries.
#
# History, because it matters: the first version of this rule had no volume floor and
# required the 80% share to hold at every stricter cutoff too. On validation that
# produced a cutoff of 0.843, above every held-out score, i.e. "recommend nothing".
# The floor was added after seeing that, using validation data only. See SHIP_DECISION.md.
CUTOFF_MIN_EXACT_SHARE = 0.80
CUTOFF_MIN_SHOWN_SHARE = 0.05
