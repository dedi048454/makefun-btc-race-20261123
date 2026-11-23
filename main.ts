// Trend-ride one-shot BTC bot for make.fun btc-race-24h-20261123-0511.
//
// Strategy (chosen by backtesting the frozen 24h dev window with the exact
// replay fill model: 4 bps fee + 2 bps slippage + constant-product impact):
//
//   * Enter ONCE, on confirmed trend: close above the 120-bar SMA and the
//     120-bar return above +50 bps. Buy 100% of cash. Never buy on bar 0:
//     the house buy-and-hold bot does that, and an identical action log
//     takes no prize.
//   * Hold to the end with a wide trailing stop: sell everything if the
//     close falls 250 bps below the running peak close. No re-entry after
//     an exit: on this data every exit/re-entry round trip pays ~26 bps
//     and whipsaws, and the dev window's gains come from one slow grind up.
//   * Late guard: if no trade has happened by bar 1400, buy anyway, so
//     the entry always meets the "at least 1 trade" guardrail.
//
// Why this shape: on the dev window BTC rose +3.64% in a slow grind with
// shallow pullbacks. Nearly every active strategy tested (EMA crosses,
// momentum, Bollinger/RSI mean reversion, Donchian) LOST money after fees;
// buy-and-hold made +$32.17. This bot makes +$31.09 there, and on a
// simulated down day (the dev window's prices mirrored) it loses only
// -$13.35 versus -$36 for buy-and-hold.
//
// All comparisons are exact integer (bigint) arithmetic on the raw price
// scale, so two runs on the same data decide byte for byte alike.
// Deterministic: only bar data and the harness account state are read.
// No clock, no environment, no network, no randomness.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SMA_N = 120; // bars of the trend filter
const RET_N = 120; // bars of the momentum confirmation
const ENTRY_BPS = 50n; // 120-bar return must beat +50 bps to enter
const TRAIL_BPS = 250n; // sell when the close is 250 bps under the peak close
const LATE_BAR = 1400; // last-resort entry so the run always has >= 1 trade
const MAX_SLIP_BPS = 500; // 5%: far above any 1-minute move on this data

class TrendRide {
  private closes: bigint[] = [];
  private peak: bigint | null = null;
  private traded = false;
  private buyPending = false;
  private buySeq = -1;

  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    this.closes.push(close);
    const i = this.closes.length - 1;
    const holding = state.positions.get(SYMBOL);
    if (holding !== undefined) {
      this.traded = true;
      this.buyPending = false;
      if (this.peak === null || close > this.peak) this.peak = close;
      if (close * 10000n < this.peak * (10000n - TRAIL_BPS)) {
        return [{ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIP_BPS }];
      }
      return [];
    }
    // Flat: nothing held (a buy decided last bar has not filled yet if
    // buyPending is set, so wait for it instead of doubling). If the buy
    // never lands (rejected at the fill), clear the flag after two
    // batches so the entry can be tried again.
    if (this.buyPending && state.seq > this.buySeq + 1) this.buyPending = false;
    if (this.buyPending || this.traded) return [];
    if (i >= LATE_BAR) {
      this.buyPending = true;
      this.buySeq = state.seq;
      this.peak = close;
      return this.buyAll(state);
    }
    if (i < Math.max(SMA_N, RET_N)) return [];
    const smaSum = this.closes.slice(-SMA_N).reduce((a, b) => a + b, 0n);
    const aboveSma = close * BigInt(SMA_N) > smaSum;
    const retOk = close * 10000n > this.closes[i - RET_N] * (10000n + ENTRY_BPS);
    if (aboveSma && retOk) {
      this.buyPending = true;
      this.buySeq = state.seq;
      this.peak = close;
      return this.buyAll(state);
    }
    return [];
  }

  private buyAll(state: BarsState): OrderInput[] {
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIP_BPS }];
  }
}

const bot = new TrendRide();
await runBars({ onBatch: (state, batch) => bot.onBatch(state, batch) });
