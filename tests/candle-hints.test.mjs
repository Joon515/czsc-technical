import test from 'node:test';
import assert from 'node:assert/strict';
import { drawings } from './support/pine-runtime.mjs';
import { nativeMethods, pointBars } from './support/native-probes.mjs';

test('confirmation-candle hints merge same-side layers, separate opposite sides and do not backdate to pivots', async () => {
  const data = pointBars([
    { close: 100, high: 102, low: 98 },
    { close: 105, high: 109, low: 101 },
    { close: 103, high: 107, low: 99 },
  ]);
  const scene = String.raw`
array.clear(fresh)
if bar_index == 1
    for id = 1 to 3
        Signal event = Signal.new(id, 3, id < 3 ? 1 : -1, false, time[1], time_close, bar_index, close[1])
        event.auxMa := 1
        event.auxMacd := 1
        event.auxVol := 1
        event.auxSupported := true
        event.auxTip := "Synthetic confirmed event"
        array.push(fresh, event)
f_candleHints(root)
`;
  const context = await nativeMethods(scene, data);
  const locations = drawings(context, 'labels')
    .filter(label => !label._deleted)
    .map(label => [label.x, label.y, label.yloc])
    .sort((a, b) => a[1] - b[1]);
  assert.deepEqual(locations, [
    [data[1].openTime, data[1].low, 'bl'],
    [data[1].openTime, data[1].high, 'ab'],
  ]);
});
