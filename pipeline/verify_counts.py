"""An independent count of the wall policy, straight from the scored rows with pandas.

    python -m pipeline.verify_counts

It never reads the browser bundle or site/js/policy.js. The end-to-end test drives the real
page to the same settings and compares what is on screen with results/independent_counts.json.
Scores are rounded to 6 decimal places first, because that is what the bundle ships.
"""
import json

import pandas as pd

from . import config as C

PASSED_SETTINGS = [0, 1, 60, 120, 240, 300, 400, 470, 479, 480]


def count(top: pd.DataFrame, cutoff: float, keeps: set[str]) -> dict:
    shown = top[top.score >= cutoff]
    passed = top[top.score < cutoff]
    return {"kept": int(shown.esci_label.isin(keeps).sum()), "other": int((~shown.esci_label.isin(keeps)).sum()),
            "passed": len(passed), "passed_keepable": int(passed.esci_label.isin(keeps).sum()),
            "exact_shown": int((shown.esci_label == "E").sum()), "substitute_shown": int((shown.esci_label == "S").sum())}


def main() -> None:
    df = pd.read_parquet(C.ROOT / "data" / "work" / "scored_heldout.parquet")
    top = df[df.on_wall & (df.rank_model == 1)].copy()
    top["score"] = top.score.round(6)
    top = top.sort_values(["score", "query_id"]).reset_index(drop=True)
    frozen = json.loads((C.RESULTS / "metrics.json").read_text())["policy"]["cutoff"]

    settings = [{"name": "frozen default", "cutoff": frozen}]
    for k in PASSED_SETTINGS:
        cutoff = 0.0 if k == 0 else 2.0 if k >= len(top) else float(top.score[k])
        settings.append({"name": f"divider after slip {k}", "slider": k, "cutoff": cutoff})
    for s in settings:
        s["exact"] = count(top, s["cutoff"], {"E"})
        s["substitute"] = count(top, s["cutoff"], {"E", "S"})
        for promise in ("exact", "substitute"):
            c = s[promise]
            assert c["kept"] + c["other"] + c["passed"] == len(top)
    out = {"queries": len(top), "settings": settings}
    (C.RESULTS / "independent_counts.json").write_text(json.dumps(out, indent=1) + "\n")
    for s in settings:
        print(f"{s['name']:24s} cutoff={s['cutoff']:.6f} exact={s['exact']} ")


if __name__ == "__main__":
    main()
