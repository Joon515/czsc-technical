import { PineTS, Indicator } from 'pinets';
import { readFile } from 'node:fs/promises';

let sourceCache;

function provider(data) {
  return {
    configure() { },
    async getSymbolInfo() {
      return {
        ticker: 'FIXTURE', tickerid: 'TEST:FIXTURE', main_tickerid: 'TEST:FIXTURE',
        prefix: 'TEST', description: 'Deterministic synthetic test data, not market data',
        type: 'crypto', basecurrency: 'TEST', currency: 'USD', timezone: 'Etc/UTC',
        session: '24x7', volumetype: 'base', mintick: 0.01, minmove: 1,
        pricescale: 100, pointvalue: 1, mincontract: 1,
      };
    },
    async getMarketData(symbol, timeframe, limit, from, to) {
      if (String(timeframe) !== '5') {
        throw new Error(`The same-chart fixture cannot request ${timeframe}; expected 5`);
      }
      let bars = data.filter(bar => (from === undefined || bar.openTime >= from) && (to === undefined || bar.openTime <= to));
      if (limit && bars.length > limit) bars = bars.slice(-limit);
      return bars.map(bar => ({ ...bar }));
    },
  };
}

export async function source() {
  return sourceCache ??= readFile(new URL('../../pine/chanlun.pine', import.meta.url), 'utf8');
}

export async function execute({ data, inputs = {}, nativeSource, append = '' }) {
  if (!data?.length) throw new Error('Native Pine execution requires nonempty deterministic OHLC data');
  const runtime = new PineTS(provider(data), 'TEST:FIXTURE', '5', data.length);
  runtime.setAlertMode('all');
  return runtime.run(new Indicator(`${nativeSource ?? await source()}\n${append}`, inputs));
}

export function drawings(context, type) {
  // PineTS routes force_overlay drawings to a separate container. Keep both real snapshots.
  const regular = context.plots[`__${type}__`]?.data.at(-1)?.value ?? [];
  const overlay = context.plots[`__${type}_overlay__`]?.data.at(-1)?.value ?? [];
  return regular.length ? (overlay.length ? regular.concat(overlay) : regular) : overlay;
}
