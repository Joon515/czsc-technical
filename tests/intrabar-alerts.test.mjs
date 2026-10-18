import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from './support/pine-runtime.mjs';
import { segmentEndpointFixture } from './support/structure-fixture.mjs';

// 夹具 close=high=low，只覆盖收盘路径；盘中 tick 不模拟。
const endpoints = [0, 20, 8, 30, 18, 41, 28, 52, 37, 50, 35, 49, 36, 51, 34, 53, 40, 75, 58, 88, 65, 94, 76, 92, 72, 90, 74, 93, 70, 89, 81, 112, 95, 123, 99, 119, 96, 117, 97, 121, 98, 127, 108, 141, 119, 145, 121, 140, 120, 143, 116, 148];
const data = segmentEndpointFixture(endpoints);
const EXIT_UP = '盘中离开既有中枢（上沿）';
const EXIT_DOWN = '盘中离开既有中枢（下沿）';
const ENTER = '盘中回到既有中枢内';
const INTRA = [EXIT_UP, EXIT_DOWN, ENTER];
const CLOSE_EXIT = '确认收盘离开既有中枢';
const CLOSE_ENTER = '确认收盘进入既有中枢';

const conditions = async inputs => (await execute({ data, inputs: { overlayLevels: false, ...inputs } })).alerts.filter(alert => alert.type === 'alertcondition');
const barsOf = (list, titles) => [...new Set(list.filter(alert => titles.includes(alert.title)).map(alert => alert.bar_index))].sort((a, b) => a - b);

test('intraday center conditions are absent when disabled while bar-close center alerts remain', async () => {
  const list = await conditions({ alertIntrabar: false });
  assert.equal(list.filter(alert => INTRA.includes(alert.title)).length, 0);
  assert.ok(barsOf(list, [CLOSE_EXIT]).length > 0);
});

test('intraday exits and re-entries fire on the same transitions as bar-close events and never repeat on consecutive bars', async () => {
  const list = await conditions({});
  const exits = barsOf(list, [EXIT_UP, EXIT_DOWN]);
  const enters = barsOf(list, [ENTER]);
  assert.ok(exits.length > 0 && enters.length > 0);
  assert.deepEqual(exits, barsOf(list, [CLOSE_EXIT]));
  assert.deepEqual(enters, barsOf(list, [CLOSE_ENTER]));
  for (const title of INTRA) {
    const bars = barsOf(list, [title]);
    assert.deepEqual(bars.filter(bar => bars.includes(bar - 1)), [], `${title} repeated on consecutive bars`);
  }
});
