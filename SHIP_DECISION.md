# Ship decision

**Recommendation: hold.** Do not launch this ranker behind an exact-match promise. The reasons and the numbers follow.

## The setting I froze

Recommend the first-ranked item when its model score is **at least 0.7064**. Otherwise pass.

The rule, applied to validation data only: take the lowest cutoff at which at least 80% of recommended first-ranked items are labelled Exact, while the assistant still recommends for at least 5% of queries. On the 4,177 validation queries that cutoff recommended for 744 (17.8%), and 595 of those (80.0%) were Exact.

One thing about how the rule came to be. Its first version had no 5% floor and required the 80% share to hold at every stricter cutoff as well. On validation that produced a cutoff of 0.843, which is above every score the model gave on held-out test (the highest is 0.840), so the assistant would have recommended nothing. I added the floor after seeing that, using validation data. The only held-out figure I had seen for a cutoff at that point was the all-pass result from the broken rule. The history is recorded in `pipeline/config.py`.

## The mistake I chose to tolerate

Passing when the right item was there. The promise to the shopper is an exact match, so an unwanted item shown with confidence breaks it, and a pass does not. I accepted a lot of silence to keep wrong recommendations to roughly one in five.

## How the frozen choice performed, held out

Official test split, 8,956 queries, cutoff unchanged:

| | Queries | Share |
|---|---|---|
| Recommended | 1,648 | 18.4% of all queries |
| of which Exact | 1,308 | 79.4% of recommended |
| of which Substitute | 144 | 8.7% of recommended |
| of which Complement or Irrelevant | 196 | 11.9% of recommended |
| Passed | 7,308 | 81.6% of all queries |
| of which had an Exact item at rank one | 4,558 | 62.4% of passed |

On the 480-query wall sample the same cutoff recommends for 94 queries; 76 are Exact, 7 Substitute, 11 Complement or Irrelevant. It passes on 386, of which 253 had an Exact item at rank one.

The 80% target from validation came in at 79.4% held out, so the cutoff transferred. That is the one good result here.

## Why hold

1. **It is quiet and still wrong one time in five.** The assistant speaks on 18.4% of searches. To get there it passes on 4,558 searches where its first pick was right. With no cutoff at all it is right 65.5% of the time; the cutoff buys 14 points of precision for 82 points of coverage.
2. **The ranker barely beats the baseline.** 0.8325 against 0.8263 NDCG for BM25 on held-out test. On exact-or-substitute at rank one, BM25 is slightly ahead (85.8% against 85.7%). The learned part adds little.
3. **Its confident errors are the embarrassing kind.** See below.

If the promise were "a substitute is OK", the same cutoff would keep it for 1,452 of 1,648 recommendations (88.1%) on held-out test. That is a better number and a different product. I would want it decided on purpose, not reached by relabelling misses.

## One real case that could change my mind

Slip 430 of 480 on the wall, `query_id` 115340.

> **The shopper asked for:** zabuza sword
>
> **The assistant picked:** XUSHEJA Men Women Reusable Popular Anime Zabuza Sword Mouth Cover Washable Face Guards Washable Balaclava with Activated Carbon Filter for Outdoor,Running.Hiking,Sports,Festivals
>
> **Dataset label:** Irrelevant. **Model score:** 0.751, above the cutoff, so it is recommended.

Open the slip and "Why did it rank first?" shows what happened. Every text feature is saturated: both query words are in the title, in order, and both are rare. The runner-up is an action figure with the sword, labelled Exact, and it matches the query equally well on all of those. What separates them is `colour_in_query` (+0.16 against −0.01): the face cover's colour field repeats words from the query. A feature meant to reward "red" in a search for a red dress put a face mask above the right item.

This case argues in both directions, which is why it is the one I would bring to the review.

- It argues for holding: no cutoff fixes this. The model was more sure of the mask than of 89% of the wall.
- It could change my mind toward shipping: if failures above the cutoff are mostly of this one kind (a title that contains the whole query but is a different type of product), then a product-type signal should remove most of them. If a rerun with that signal on the same harness showed complement and irrelevant items falling from 11.9% of recommendations to a low single-digit share at similar coverage, I would ship the selective setting.

## What I would do next

1. Add product-type agreement between query and listing, and rerun this exact harness.
2. Drop or rework `colour_in_query` so that it only fires on colour words.
3. Re-examine the 5% floor and the 80% target with whoever owns the promise to the shopper. Both are product judgements.

All figures come from [`results/metrics.json`](results/metrics.json), written by `pipeline/run.py`. This is a reranking benchmark over judged candidates. It says nothing about purchases, satisfaction, or any live system.
