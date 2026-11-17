# Card Odds Lab

Monte Carlo odds and best-play advice for ten card games. Pick a game, enter the cards you can see and the money involved, and the site deals out the rest of the hand thousands of times to find what you should do.

| Game | What it tells you | Method |
|---|---|---|
| Texas Hold'em | Win/tie/lose %, equity vs. pot odds, fold/call/raise | Monte Carlo |
| Omaha | Same, using exactly 2 hole + 3 board cards | Monte Carlo |
| Seven-Card Stud | Equity with opponents' up-cards removed | Monte Carlo |
| Five-Card Draw | Best cards to keep, then fold/call/raise | Monte Carlo (all 32 holds) |
| Blackjack | EV of stand / hit / double / split / surrender, plus basic strategy | Monte Carlo over the actual shoe |
| Spanish 21 | Same, with no 10s, player 21 always wins, 5+ card and 6-7-8 / 7-7-7 bonuses, double on any cards, optional redoubling | Monte Carlo |
| Video Poker (9/6 Jacks or Better) | Best hold and its expected return | Exact for ≤3-card draws, sampled otherwise |
| Three Card Poker | Play or fold | Exact (all dealer hands) |
| Pai Gow Poker (53 cards, joker) | Best way to split 7 cards into 5 + 2 | Monte Carlo vs. a simulated dealer "house way" |
| Baccarat | Best bet and house edge for the remaining shoe | Monte Carlo |

## Bet sizing (poker games)

Tick **Bet sizing** to enter your stack and each opponent's stack. The site then suggests a dollar amount: bigger bets with a bigger edge (half pot to full pot), all-in when the stack is small relative to the pot, capped at the effective stack (the most the biggest opponent can call). It also shows the largest call that is still profitable.

## Opponent stats (poker games)

Tick **Opponent stats** to describe each opponent: pick a preset (Rock, TAG, LAG, Calling station, Maniac) or enter VPIP, PFR, AF, 3-bet % and WTSD %, plus what they did this hand.

- **Ranges:** opponents are dealt only hands consistent with their stats and actions (e.g. an open-raise from a 9% PFR player = roughly the top 9% of starting hands; a postflop bet from a high-AF player = a wider, bluffier range).
- **Fold equity:** how often each opponent folds to a bet comes from WTSD and the bet size.
- **Decision:** the simulation compares fold / check / call against several bet or raise sizes (and all-in when stacks are entered) and recommends the highest average result, including bluffs when folds make them profitable.

Starting-hand strength is ranked by equity against a random hand (Hold'em) or a heuristic score (Omaha, Stud, Draw). The model assumes no betting after the current decision.

## Run locally

It's a static site with no build step, but ES modules need a web server (opening `index.html` directly from disk won't work):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish on GitHub Pages

Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**. The site appears at `https://<user>.github.io/<repo>/`.

## Tests

```sh
node tests/run.js
```

The tests check the hand evaluators against exact combinatorial counts and the simulators against published odds (e.g. AA vs. a random hand ≈ 85%, the Three Card Poker Q-6-4 play/fold boundary, and baccarat house edges).

## Layout

```
index.html          page shell
css/style.css       styles
js/cards.js         deck, 5–7 card evaluator, Omaha, 3-card, video poker paytable
js/render.js        result-panel HTML helpers
js/app.js           UI: tabs, card pickers, inputs, time-sliced simulation runner
js/games/*.js       one module per game: fields, validate(), simulate() generator, render()
tests/run.js        sanity checks
```

To add a game, create a module with `id`, `name`, `description`, `fields`, `validate(state)`, a generator `simulate(state, quality)` that yields progress (0–1) and returns a result, and `render(result, state)`; then add it to `js/games/index.js`.

## Assumptions

- Poker opponents are dealt random cards. Real opponents who keep betting tend to hold stronger hands, so treat the advice as an upper bound on your chances.
- Poker advice compares your equity against the pot odds for the current bet only; it doesn't model future betting rounds.
- Blackjack and Spanish 21: after your first move, later decisions follow regular blackjack basic strategy; no re-splitting; dealer has peeked for blackjack. Spanish 21 suited bonuses are not counted.
- Pai Gow: the dealer sets hands to maximize the strength of both halves, an approximation of the casino house way.
- Bet sizing is a rule of thumb, not a solver: it ignores future betting rounds and opponents' tendencies.
