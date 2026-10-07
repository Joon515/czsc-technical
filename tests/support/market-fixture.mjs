import { readFile } from 'node:fs/promises';

// Exact captured Binance BTCUSDT OHLC prices, replayed on a fixed historical
// clock. Keeping every original five-minute interval avoids future/realtime
// bars when deterministic generated OHLC is appended, including in CI.
export async function marketFixture() {
  const fixture = JSON.parse(await readFile(new URL('./btc-5m-10000.json', import.meta.url), 'utf8'));
  const start = Date.UTC(2024, 0, 1);
  return fixture.ohlc.map(([open, high, low, close], index) => ({
    openTime: start + index * fixture.step,
    closeTime: start + (index + 1) * fixture.step,
    open, high, low, close,
  }));
}
