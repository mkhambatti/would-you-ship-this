# Social post drafts

Each project has its own X and LinkedIn draft below. The demos and results are public. These are drafts only.

## Would You Ship This? · X

Search: “glider without ottoman.” Top result: a glider with an ottoman. Would you recommend it?

I made a one-minute game to test the trade-off. About 4 in 5 picks are exact only if the ranker passes on 81.6% of searches. I’d hold launch.

https://mkhambatti.github.io/would-you-ship-this/

## Would You Ship This? · LinkedIn

When should a shopping assistant make a recommendation, and when should it pass?

I built a small interactive experiment using Amazon Science’s public Shopping Queries Dataset. You review five real searches, then set the confidence cutoff for a ranker across 480 held-out searches.

The trade-off surprised me. To make roughly 4 in 5 recommendations exact matches, the assistant had to stay quiet on 81.6% of searches. It also passed on 4,558 searches where its first result was correct. The learned ranker’s NDCG improvement over BM25 was small, so my decision was to hold the launch.

The project includes the data pipeline, evaluation, limits, and the case that most challenged my conclusion. It measures reranking on products with existing human judgments. It says nothing about purchases or a live shopping system.

Try the experiment: https://mkhambatti.github.io/would-you-ship-this/
Code and results: https://github.com/mkhambatti/would-you-ship-this

## Quick Autoresearch · X

I tried autoresearch on analytics. Quick proposed SQL experiments. A local runner checked answers and timed them.

On 20 flight queries, a prepared summary cut warm-cache DuckDB time from 19.77s to 13ms. Build time: 5.117s.

https://github.com/mkhambatti/aws-quick-autoresearch

## Quick Autoresearch · LinkedIn

What if an analytics assistant could test its own ideas against the answers a team already trusts?

I built an open-source prototype that connects AWS Quick to a local experiment runner through MCP. Quick proposes a SQL change, the runner checks whether the results still match, measures how long the queries take, and returns evidence for the next experiment.

In the published flight-data run, Quick explored eight candidates. The winning change prepared grouped totals for each dashboard panel once. On the same held-out batch of 20 queries, local warm-cache query time went from 19.77 seconds to 13 milliseconds. Preparing the summary took 5.117 seconds. Those figures measure this DuckDB setup, not a cloud service or a single page load.

The repository includes the runner, data-source setup, experiment history, benchmark limits, and a live dashboard. The idea is to make data work reproducible: define the questions, protect correctness, and let measured results guide the next attempt.

Code and experiment: https://github.com/mkhambatti/aws-quick-autoresearch
Flight dashboard: https://mkhambatti.github.io/aws-quick-autoresearch/flight-operations.html
