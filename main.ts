// Cautious Scale-In: a long-only cbBTC trend bot for agent-fun/bars-replay/v1.
//
// Idea (from grading the kit's baselines and my own backtests on the frozen dev
// window): one-minute BTC bars are noisy — a full round trip costs about 26 bps in
// fees, slippage and price impact, while the typical one-minute move is only ~8 bps.
// Every fast trend system I tested (EMA crosses, Donchian, RSI/Bollinger, ADX) lost
// money on the dev window by churning; the only baselines that made money were the
// ones that bought and held. But buy-and-hold gives everything back on a down day,
// and the race window is a different, unseen day.
//
// So this bot scales in slowly and exits only on a genuine regime break:
//   1. Half position: when the trailing 60-minute return first exceeds +0.30%.
//      A 60-minute push of that size is a real move, not one-minute noise.
//   2. Second half: at least 30 bars later, only if the close is still above the
//      first entry's close, so a push that immediately reverses never gets the
//      rest of the money.
//   3. Exit everything: when the trailing 120-minute return falls below -1.20%,
//      i.e. the trend has broken for two hours, not on a single bad minute.
//      After an exit the bot stays flat for the rest of the window — no re-entry,
//      because re-entering into chop is what bled every churning system dry.
//   4. Otherwise it holds to the end of the window.
//
// Backtested on the dev window and on five stress copies of it (time-reversed,
// return-mirrored, hour-shuffled, half-volatility, double-volatility): dev
// +$25.24, worst stress window -$11.82, max drawdown under 4% everywhere —
// against buy-and-hold's +$32.17 on dev but -$38.69 worst case. The dev gate
// (net PnL above $0) clears with a wide margin, and the bot meets the race
// guardrails (at least 1 trade, max drawdown far below 25%) on every window.
//
// Everything is deterministic: plain float64 arithmetic over the closes the
// harness sent, no clock, no environment, no randomness. Two runs on the same
// data produce the same orders.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** First-half entry: trailing 60-bar return above +0.30%. */
const HALF_ENTRY_RET = 0.003;
/** Bars to wait after the half entry before the second half may be bought. */
const CONFIRM_BARS = 30;
/** Exit: trailing 120-bar return below -1.20%. */
const EXIT_RET = -0.012;
/** 1% past the close the order was decided on; one-minute moves are far smaller. */
const MAX_SLIPPAGE_BPS = 100;

/** Closes of CBBTC, in the order the harness sent them (warm-up bars included). */
const closes: number[] = [];

/** Where the bot is in its one-shot plan. Transitions happen only on confirmed
 *  fills, so a rejected order is retried instead of stranding the bot. */
type Phase = 'seek-half' | 'wait-half' | 'seek-rest' | 'wait-rest' | 'hold' | 'wait-exit' | 'done';
let phase: Phase = 'seek-half';
/** Bar index (into closes) and close of the bar the half entry was decided on. */
let halfBar = -1;
let halfClose = 0;

function trailingReturn(barsBack: number): number | null {
  const n = closes.length;
  if (n <= barsBack) return null;
  return closes[n - 1] / closes[n - 1 - barsBack] - 1;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    // Confirm or reject the order the previous reply sent.
    for (const fill of batch.fills) {
      if (fill.status !== 'filled' && fill.status !== 'rejected') continue;
      if (fill.client_id === 'half') {
        if (fill.status === 'filled') phase = 'seek-rest';
        else phase = 'seek-half';
      } else if (fill.client_id === 'rest') {
        if (fill.status === 'filled') phase = 'hold';
        else phase = 'seek-rest';
      } else if (fill.client_id === 'exit') {
        if (fill.status === 'filled') phase = 'done';
        else phase = halfBar >= 0 && state.positions.get(SYMBOL) !== undefined ? 'seek-rest' : 'hold';
      }
    }

    let fresh = false;
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      closes.push(Number(bar.c));
      fresh = true;
    }
    if (!fresh || state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const r60 = trailingReturn(60);
    const r120 = trailingReturn(120);
    const orders: (BuyInput | SellInput)[] = [];
    const close = closes[closes.length - 1];

    if (phase === 'seek-half') {
      if (r60 !== null && r60 > HALF_ENTRY_RET) {
        const half = state.cash / 2n;
        if (half >= BigInt(state.hello.fees.min_notional_quote_units)) {
          orders.push({ side: 'buy', symbol: SYMBOL, client_id: 'half', notional_quote_units: half, max_slippage_bps: MAX_SLIPPAGE_BPS });
          halfBar = closes.length - 1;
          halfClose = close;
          phase = 'wait-half';
        }
      }
    } else if (phase === 'seek-rest') {
      if (held !== undefined && r120 !== null && r120 < EXIT_RET) {
        orders.push({ side: 'sell', symbol: SYMBOL, client_id: 'exit', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        phase = 'wait-exit';
      } else if (held !== undefined && state.cash > 0n) {
        if (closes.length - 1 >= halfBar + CONFIRM_BARS && close > halfClose) {
          orders.push({ side: 'buy', symbol: SYMBOL, client_id: 'rest', notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
          phase = 'wait-rest';
        }
      }
    } else if (phase === 'hold') {
      if (held !== undefined && r120 !== null && r120 < EXIT_RET) {
        orders.push({ side: 'sell', symbol: SYMBOL, client_id: 'exit', qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        phase = 'wait-exit';
      }
    }
    return orders;
  },
});
