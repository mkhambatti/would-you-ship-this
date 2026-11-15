# Would You Ship This?

**You run a shopping assistant. Decide when it should recommend a product and when it should keep quiet.**

A shopper types “glider without ottoman.” The first result is a glider **with** an ottoman. Would you show it?

[Play the five searches →](https://mkhambatti.github.io/would-you-ship-this/)

## How the game works

Each round shows you one shopper’s request and the assistant’s top pick. Click **Recommend** or **Pass**. The card flips to show how a human reviewer labeled the product. It could be an exact match, a substitute, an accessory or other related item, or something unrelated. You get a point if your call agrees with the reviewer about whether to show it as an exact match. [Where the searches come from](https://github.com/amazon-science/esci-data)

Why did that chair come first? Before you played, the model scored 40 products for that search. It looked for clues like matching words, sizes and brand names. The chair got the highest score. That’s what *ranking* means here. Your clicks keep score for your five rounds. Everyone plays the same five picks.

## Now decide for 480 shoppers

Move one slider. It sets the lowest score you’re willing to recommend. At or above the line, the shopper sees the product. Below it, they get no suggestion. Watch the counts change as you move your line. If you’d be happy to offer a substitute, flip **A substitute is OK** and see how many more of your recommendations keep that promise. Click **Ship this setting** to get a receipt for your decision. [How the counts work](site/js/policy.js)

[![Five shopping searches and the slider for choosing which products to recommend](docs/demo.gif)](https://mkhambatti.github.io/would-you-ship-this/)

## My call

I’d hold the launch. At my setting, 94 of the 480 shoppers would get a recommendation and 76 would get exactly what they asked for. Then I looked at the 386 searches where the assistant would stay quiet. **On 253 of them, its first pick was already an exact match.** Turning the slider up had hidden a lot of good answers.

You can inspect those misses yourself. The full evaluation covers 8,956 searches, including one where a face covering beat a sword because of words in the listing’s colour field. [My launch decision](SHIP_DECISION.md) · [Full results](results/metrics.json)

## Run it yourself

To play locally, run these commands and open [localhost:4173](http://localhost:4173). The saved rankings come with the game.

```bash
git clone https://github.com/mkhambatti/would-you-ship-this
cd would-you-ship-this
python3 -m http.server 4173 --directory site
```

To recreate the rankings, run `make reproduce` from the same folder with Python, Node.js, npm and Make installed. It downloads about 1.1 GB of source data, trains the model, rebuilds the files the game reads, and runs the checks.

<details>
<summary>How the search models compare</summary>

The comparison uses a keyword search method called BM25 and a model that learns how much weight to give 13 clues from the search, title, brand and colour. On the full test set, BM25 put an exact match first 64.6% of the time. The learned model did so 65.5% of the time. The game shows the learned model’s pick.

The results also include NDCG. That measure looks at the whole list and gives more credit for putting good matches near the top. BM25 scored 0.8263 and the learned model scored 0.8325. [Model inputs](pipeline/features.py) · [Training and scoring code](pipeline/run.py) · [Full results](results/metrics.json)

</details>

## Suggest a case

Found a search on the shelf that would make a good opening round? Send the shopper’s words, the product the model picked, and why you’d show it or pass. If you’re working from a fork, the five opening cases are listed in `CHALLENGE_V1`. [Open an issue](https://github.com/mkhambatti/would-you-ship-this/issues) · [Case list](pipeline/config.py)

## Licence

The code is licensed under MIT, the shopping data under Apache 2.0, and the fonts under the SIL Open Font License. This is an independent project. [Code licence](LICENSE) · [Data and font credits](NOTICE)
