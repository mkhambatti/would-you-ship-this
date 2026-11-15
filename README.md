# 🚢 Would You Ship This?

> *"Technically it compiles."*

**Would You Ship This?** is a high-stakes, satirical web game where product managers, engineers, and AI builders put unhinged, AI-generated software ideas and cursed UI mockups on trial. 

You are presented with two side-by-side software projects born from raw "vibe-coding" and AI slop. Your job? Decide which one deserves to go to production—and which one belongs in the digital incinerator.

---

## 🎮 How It Works

1. **The Matchup:** Two random AI-generated projects clash head-to-head. 
2. **The Verdict:** Vote on the lesser of two evils (or the absolute stroke of genius).
3. **The Elo Leaderboard:** Every vote updates the global **Elo rating** of both projects. Watch the absolute worst code sink to the bottom while legendary tech disasters rise to the hall of fame.

👉 **[Play the live game →](https://mkhambatti.github.io/would-you-ship-this/)**

---

## 🧠 Behind the Simulation: Real ML, Real Trade-offs

While the core game is a fast-paced voting arena, the underlying evaluation engine is built on real-world search relevance data (powered by the [Amazon ESCI Dataset](https://github.com/amazon-science/esci-data)). 

### 1. The 5-Round Preview
Each round gives you a shopper’s query and the assistant’s top pick. Click **Recommend** or **Pass**, and the card flips to reveal how a human reviewer labeled it (exact match, substitute, accessory, or irrelevant). Your clicks keep score across five rounds against the same picks everyone else sees.

### 2. The Ranking Mechanics
Why did that specific product rank first? Before you play, a model scores products based on query matching, size, and brand names. **Ranking** is simply the sorting order of those calculated scores. 

### 3. The 480-Shopper Decision
Move the threshold slider to set the minimum score required for recommendation. Flip **A substitute is OK** to adjust your risk tolerance, then click **Ship this setting** to get your decision receipt. 
*(Want to inspect the code? Check [`site/js/policy.js`](site/js/policy.js))*

[![Five shopping searches and the slider for choosing which products to recommend](docs/demo.gif)](https://mkhambatti.github.io/would-you-ship-this/)

### 4. The Launch Verdict
> *"I’d hold the launch."* 
> At a balanced threshold, 94 of 480 shoppers get a recommendation (76 exact matches). But turning the slider up prematurely hides great answers—on 253 of the 386 quiet searches, the assistant's first pick was *already* an exact match. 

The full evaluation spans 8,956 searches (including edge cases where face coverings beat swords due to color-field text anomalies). 
* 📄 **[Read my full launch decision](SHIP_DECISION.md)**
* 📊 **[Explore full results (`results/metrics.json`)](results/metrics.json)**

---

## 🚀 Run It Locally

Want to play or hack on the game locally? Fire up the static server and open [http://localhost:4173](http://localhost:4173):

```bash
git clone [https://github.com/mkhambatti/would-you-ship-this](https://github.com/mkhambatti/would-you-ship-this)
cd would-you-ship-this
python3 -m http.server 4173 --directory site
