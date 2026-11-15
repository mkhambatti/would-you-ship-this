# Launch post draft

Every figure here comes from `results/metrics.json` in this repo.

---

**Would you ship this?**

A shopper types "glider without ottoman". The ranking model's top pick is a glider *with* an ottoman.

Would you recommend it?

I built a small game around that question, using Amazon Science's public Shopping Queries Dataset. You judge five real searches. Then the view pulls back to 480 of them and gives you one control: how sure the assistant has to be before it recommends anything at all.

What I found when I set that control myself:

→ With no cutoff, the top pick is an exact match 65.5% of the time (8,956 held-out searches).
→ To get to about 4 in 5, the assistant has to stay quiet on 81.6% of searches.
→ In doing so it passes on 4,558 searches where its first pick was right.
→ My learned ranker beat plain BM25 by 0.006 NDCG. That's all.

My call was to hold the launch. The write-up is in the repo, including the case that might change my mind (a face mask that outranked a sword).

Play it, ship your own setting, and post your receipt. The link gives someone else the same five cases without the answers.

▶ https://mkhambatti.github.io/would-you-ship-this/
Code, data pipeline and tests: https://github.com/mkhambatti/would-you-ship-this

This is a reranking benchmark over products people already judged. It makes no claim about purchases or any live shopping system.

---

**Shorter version (X):**

A shopper types "glider without ottoman". The model's top pick is a glider with an ottoman. Would you recommend it?

Five real searches, then 480 you're responsible for. One control. Take your receipt.

https://mkhambatti.github.io/would-you-ship-this/
