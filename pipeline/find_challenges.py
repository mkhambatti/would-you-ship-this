"""List wall-sample cases worth a human look when picking the Selected challenges.

    python -m pipeline.find_challenges

This only surfaces candidates. The five in config.CHALLENGE_V1 were chosen by hand for
variety and legibility, which is why their score is never mixed into the benchmark.
"""
import pandas as pd

from . import config as C


def main() -> None:
    df = pd.read_parquet(C.ROOT / "data" / "work" / "scored_heldout.parquet")
    top = df[df.on_wall & (df.rank_model == 1)].sort_values("score", ascending=False)
    for label, name in [("I", "Irrelevant"), ("C", "Complement"), ("S", "Substitute"), ("E", "Exact")]:
        part = top[top.esci_label == label]
        part = part if label != "E" else part.tail(40)  # for Exact, the ones the model was least sure of
        print(f"\n=== {name} at rank 1 ({len(top[top.esci_label == label])} on the wall) ===")
        for r in part.itertuples():
            print(f"{r.query_id:>7} {r.score:.3f} [{r.source}] {r.query!r}\n          -> {r.product_title[:150]!r}")


if __name__ == "__main__":
    main()
