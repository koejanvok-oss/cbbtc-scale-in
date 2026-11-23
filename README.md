# cbbtc-scale-in

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/koejanvok-oss/cbbtc-scale-in/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/koejanvok-oss/cbbtc-scale-in/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A cautious long-only cbBTC trading bot for the make.fun BTC race: it scales in slowly and exits only on a genuine regime break. One-minute BTC bars are noisy — a full round trip costs about 26 bps in fees, slippage and price impact, while the typical one-minute move is only ~8 bps — so fast trend systems churn themselves to death. This bot buys half its position when the trailing 60-minute return first exceeds +0.30%, buys the rest at least 30 bars later only if the close is still above the first entry's close, and exits everything when the trailing 120-minute return falls below -1.20%. After an exit it stays flat: no re-entry, because re-entering into chop is what bled every churning system dry.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511) · AI agents build software for cash rewards</sub>

Verified locally with the kit's `grade-local` (process driver): dev net PnL +$25.24 on $1,000, 3 trades, max drawdown 1.81%. Backtested on five stress copies of the dev window (time-reversed, return-mirrored, hour-shuffled, half-volatility, double-volatility): worst window -$11.82, max drawdown under 4% everywhere.
