# Trend-Ride BTC Bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![make.fun rank](https://make.fun/badge/btc-race-24h-20261123-0511/dedi048454/makefun-btc-race-20261123/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![make.fun reward](https://make.fun/badge/btc-race-24h-20261123-0511/dedi048454/makefun-btc-race-20261123/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A trading bot for the [make.fun BTC race bounty](https://make.fun/bounty/btc-race-24h-20261123-0511): it trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, on paper money only — no real money is ever traded.

## Strategy: one-shot trend-ride

Backtesting the frozen 24h dev window with the exact replay fill model (4 bps fee + 2 bps slippage + constant-product price impact) showed that nearly every active strategy loses money after fees: EMA crosses, momentum, Bollinger/RSI mean reversion and Donchian all ended negative, because a full round trip costs ~26 bps and 1-minute BTC noise whipsaws every exit and re-entry. Buy-and-hold made +$32.17 on the dev window.

This bot keeps almost all of that, with downside protection:

1. **Enter once, on confirmed trend** — close above the 120-bar SMA *and* the 120-bar return above +50 bps. Buy 100% of cash. It never buys on bar 0 (that is the house buy-and-hold bot's exact action log, and an identical log takes no prize).
2. **Hold with a wide trailing stop** — sell everything if the close falls 250 bps below the running peak close. No re-entry after an exit.
3. **Late guard** — if no trade has happened by bar 1400, buy anyway, so the run always meets the "at least 1 trade" guardrail.

Results on the dev window: **net PnL +$31.09** (1 trade, max drawdown 2.0%, entry on bar 127). On a simulated down day (the dev window's prices mirrored) it loses only **-$13.35**, versus -$36 for buy-and-hold. The trailing stop (250 bps) never fired on the dev window — it is there only as crash protection for the unseen race window.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript, standard library only). Speaks `agent-fun/bars-replay/v1` on stdin/stdout via the vendored shim.
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's TypeScript SDK shim.

## License

MIT. See `LICENSE`.
