# Social post drafts

## Would You Ship This? · X

You search for a glider without an ottoman. The first result comes with one. Would you show it?

I built a game where you judge five picks, then set one rule for 480 searches. My rule hid 253 exact matches. Try yours.

https://mkhambatti.github.io/would-you-ship-this/

## Would You Ship This? · LinkedIn

A shopper asks for a glider without an ottoman. The model picks one with an ottoman. It found both nouns and missed the word that mattered to the shopper.

I built a game around that decision using Amazon Science’s public shopping search data. You judge five picks yourself. Then you get 480 searches and one slider. How high a score does a product need before you’re willing to recommend it?

At my setting, the assistant would recommend 94 products. Of those, 76 were exact matches. What made me hold the launch was looking at the other side of the slider. On 253 searches, the assistant already had the exact match in first place and would have shown the shopper nothing.

Try the same five cases and see which mistakes you’re willing to live with.

https://mkhambatti.github.io/would-you-ship-this/
https://github.com/mkhambatti/would-you-ship-this

## Quick Autoresearch · X

My flight dashboard kept counting the same flights. I gave AWS Quick a way to try shortcuts and check every answer. Its best idea was to count by route, airline and time in advance. In a local test, 20 queries went from 19.77 s to 13 ms.

https://github.com/mkhambatti/aws-quick-autoresearch

## Quick Autoresearch · LinkedIn

How many February flights from Chicago to LaGuardia arrived late? The answer was 369. My dashboard kept reading through a file of seven million flights to count them again.

I borrowed Andrej Karpathy’s autoresearch idea and built a tool that lets AWS Quick run small experiments. Quick suggests a shortcut. My computer checks the answers, times it, and sends the result back so Quick can decide what to try next.

Quick tried eight ideas. The winner counted up what each dashboard panel needed and saved those totals in a small file. Building it took 5.1 seconds. With the data already warm on my machine, the full batch of 20 queries then took 13 milliseconds, down from 19.77 seconds. All 20 answers matched.

I’d use this on a report my team opens every morning. I can tell it which questions matter, check exactly what the shortcut buys us, and see what it costs to rebuild when the data changes. You can bring your own data and questions too.

https://mkhambatti.github.io/aws-quick-autoresearch/flight-operations.html
https://github.com/mkhambatti/aws-quick-autoresearch
