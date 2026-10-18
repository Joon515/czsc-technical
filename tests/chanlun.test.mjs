import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, drawings } from './support/pine-runtime.mjs';
import { nativeMethods, nativeConsumer, pointBars, memberScene, consumerScene, rawRangeScene, nodeRangeScene, higherBuilderScene, attachedPivotScene } from './support/native-probes.mjs';
import { marketFixture } from './support/market-fixture.mjs';
import { structureFixture, penEndpointFixture, segmentEndpointFixture, recursiveFixture } from './support/structure-fixture.mjs';

const snapshotProbe = String.raw`
f_testUnits(array<Leg> units) =>
    array<string> entries = array.new<string>()
    if array.size(units) > 0
        for i = 0 to array.size(units) - 1
            Leg p = array.get(units, i)
            array.push(entries, "{\"dir\":" + str.tostring(p.dir) + ",\"a\":" + str.tostring(p.a, "#.#########") + ",\"b\":" + str.tostring(p.b, "#.#########") + ",\"at\":" + str.tostring(p.at) + ",\"bt\":" + str.tostring(p.bt) + ",\"first\":" + str.tostring(p.first) + ",\"last\":" + str.tostring(p.last) + ",\"confirmed\":" + str.tostring(p.confirmed) + ",\"h\":" + str.tostring(p.h, "#.#########") + ",\"l\":" + str.tostring(p.l, "#.#########") + ",\"ht\":" + str.tostring(p.ht) + ",\"lt\":" + str.tostring(p.lt) + "}")
    "[" + array.join(entries, ",") + "]"
f_testCenters(array<Center> centers) =>
    array<string> entries = array.new<string>()
    if array.size(centers) > 0
        for i = 0 to array.size(centers) - 1
            Center z = array.get(centers, i)
            array.push(entries, "{\"zd\":" + str.tostring(z.zd, "#.#########") + ",\"zg\":" + str.tostring(z.zg, "#.#########") + ",\"gg\":" + str.tostring(z.gg, "#.#########") + ",\"dd\":" + str.tostring(z.dd, "#.#########") + ",\"at\":" + str.tostring(z.at) + ",\"bt\":" + str.tostring(z.bt) + ",\"formed\":" + str.tostring(z.formed) + ",\"broken\":" + str.tostring(z.broken) + "}")
    "[" + array.join(entries, ",") + "]"
if barstate.islast
    array<string> framesJSON = array.new<string>()
    for i = 0 to array.size(root.frames) - 1
        Frame frame = array.get(root.frames, i)
        array.push(framesJSON, "{\"id\":" + str.tostring(frame.id) + ",\"units\":" + f_testUnits(frame.structure.parts) + ",\"centers\":" + f_testCenters(frame.structure.centers) + "}")
    alert("{\"test_snapshot\":{\"halted\":" + str.tostring(root.halted) + ",\"rawCount\":" + str.tostring(array.size(root.raw)) + ",\"candleCount\":" + str.tostring(array.size(root.candles)) + ",\"pens\":" + f_testUnits(root.pens) + ",\"frames\":[" + array.join(framesJSON, ",") + "]}}", alert.freq_all)
`;

const run = async (data, inputs = {}, expectStop = false) => {
  const context = await execute({ data, inputs: { alertCandidates: true, ...inputs }, append: snapshotProbe });
  assert.equal(snapshot(context).halted, expectStop, 'Unexpected or missing structural stop');
  return context;
};
const records = context => context.alerts.filter(alert => alert.type === 'alert').map(alert => JSON.parse(alert.message));
const snapshot = context => {
  const result = records(context).findLast(record => record.test_snapshot)?.test_snapshot;
  assert.ok(result, 'native source must publish the observed Root snapshot');
  return result;
};
const events = context => records(context).flatMap(record => record.events ?? []);
const tradingEvents = context => events(context).filter(event => ['1?', '2?', '3'].includes(event.category));
const segments = context => drawings(context, 'lines').filter(line => !line._deleted && line.style === 'style_solid');
const drawnAs = (line, unit) => line.x1 === unit.at && line.y1 === unit.a && line.x2 === unit.bt && line.y2 === unit.b;
const boxes = context => drawings(context, 'boxes').filter(box => !box._deleted);
const rectangle = box => [box.left, box.bottom, box.right, box.top];
const frame = (context, id) => snapshot(context).frames.find(item => item.id === id);
const units = (context, id = 1) => frame(context, id).units;
const mirror = data => data.map(bar => ({ ...bar, open: -bar.open, high: -bar.low, low: -bar.high, close: -bar.close }));
const hasSegment = (context, a, b) => units(context).some(unit => Math.abs(unit.a - a) < 1e-8 && Math.abs(unit.b - b) < 1e-8);
const penScene = (points, tail) => penEndpointFixture(points, { prefix: [2], tail });
const pointTime = (data, index) => data[9 + 45 * index].openTime;
const centerWith = (context, zd, zg) => frame(context, 1).centers.find(center => center.zd === zd && center.zg === zg);

function assertNodeRanges(context, data) {
  const state = snapshot(context);
  const byTime = new Map(data.map(bar=>[bar.openTime,bar]));
  for (const current of state.frames) {
    const higher = current.units, lower = current.id===1 ? state.pens : state.frames.find(item=>item.id===current.id-1).units;
    for (let i=0;i<higher.length;i++) {
      const unit = higher[i];
      assert.ok(unit.last-unit.first>=3 && unit.last<=lower.length);
      assert.ok(unit.at<unit.bt && unit.bt<=unit.confirmed);
      assert.equal(unit.dir,unit.b>unit.a?1:-1);
      assert.deepEqual([unit.a,unit.at],[lower[unit.first].a,lower[unit.first].at]);
      assert.deepEqual([unit.b,unit.bt],[lower[unit.last-1].b,lower[unit.last-1].bt]);
      for (let j=unit.first;j<unit.last-1;j++) assert.deepEqual([lower[j].b,lower[j].bt],[lower[j+1].a,lower[j+1].at]);
      const bars = data.filter(bar=>bar.openTime>=unit.at && bar.openTime<=unit.bt);
      assert.ok(bars.length>0);
      assert.ok(Math.abs(unit.h-Math.max(...bars.map(bar=>bar.high)))<1e-7);
      assert.ok(Math.abs(unit.l-Math.min(...bars.map(bar=>bar.low)))<1e-7);
      assert.ok(unit.ht>=unit.at && unit.ht<=unit.bt && unit.lt>=unit.at && unit.lt<=unit.bt);
      assert.ok(Math.abs(byTime.get(unit.ht).high-unit.h)<1e-7);
      assert.ok(Math.abs(byTime.get(unit.lt).low-unit.l)<1e-7);
      if(i) assert.deepEqual([unit.a,unit.at],[higher[i-1].b,higher[i-1].bt]);
      if(current.id>1) assert.ok(!lower.some(part=>part.at===unit.at && part.bt===unit.bt && part.a===unit.a && part.b===unit.b));
    }
    for (const center of current.centers) {
      const index = higher.findIndex(unit=>unit.at===center.at);
      assert.ok(index>=0);
      const members = higher.slice(index,index+3);
      assert.equal(members.length,3);
      assert.ok(Math.abs(center.zd-Math.max(...members.map(unit=>unit.l)))<1e-7);
      assert.ok(Math.abs(center.zg-Math.min(...members.map(unit=>unit.h)))<1e-7);
      assert.ok(higher.some(unit=>unit.bt===center.bt));
    }
  }
}
for (const inverted of [false, true]) {
  const sign = inverted ? -1 : 1, suffix = inverted ? ' (mirror)' : '';
  const transform = data => inverted ? mirror(data) : data;
  test(`71: first destructive unit must strictly break its endpoint${suffix}`, async () => {
    const touched = await run(transform(penScene([0,4,1,7,5,8,3,6,3,8.5], [7,8,6])), { overlayLevels: false });
    assert.ok(snapshot(touched).pens.some(pen => pen.b === 8 * sign));
    assert.ok(!hasSegment(touched, 0, 8 * sign));
    const broken = await run(transform(penScene([0,4,1,7,5,8,3,6,3,6.5,2.9], [5,2,4])), { overlayLevels: false });
    assert.ok(hasSegment(broken, 0, 8 * sign));
  });
  test(`71: an internal reverse fractal in a contained first range cannot terminate the segment${suffix}`, async () => {
    const context = await run(transform(penScene([0,4,1,7,5,8,3,6,3.2,5,4.5,5.5,4,5,4.5,5.5,5,6], [5,6,5.5])), { overlayLevels: false });
    assert.ok(snapshot(context).pens.some(pen => pen.b === 8 * sign));
    assert.ok(!hasSegment(context, 0, 8 * sign));
  });
  test(`78: a new original-direction extreme cancels the unpublished gap pivot${suffix}`, async () => {
    const context = await run(transform(penScene([0,4,1,7,5,10,8,9,7.5,11,10], [10.5,9.5,10])), { overlayLevels: false });
    assert.ok(snapshot(context).pens.some(pen => pen.b === 11 * sign));
    assert.ok(!hasSegment(context, 0, 10 * sign));
  });
  test(`67: local characteristic inclusion and a reverse fractal need not fill the first gap${suffix}`, async () => {
    const context = await run(transform(penScene([0,2,1,10,5,8,4,7,5.5,8,6,9], [7,8,6])), { overlayLevels: false });
    assert.ok(hasSegment(context, 0, 10 * sign));
  });
}

test('closed single-price intersection has full member coordinates, not confirmation coordinates', async () => {
  const data = segmentEndpointFixture([0,2,-1,0,-0.5,1,-0.8,1.2,-0.6,1.4]);
  const context = await run(data, { overlayLevels: false });
  assert.ok(hasSegment(context, 0, 2));
  assert.ok(hasSegment(context, 2, -1));
  assert.ok(hasSegment(context, -1, 0));
  const center = centerWith(context, 0, 0);
  assert.ok(center);
  assert.equal(center.at, pointTime(data, 0));
  assert.ok(center.formed > pointTime(data, 3));
  const box = boxes(context).find(box => box.bottom === 0 && box.top === 0);
  assert.equal(box.left, center.at);
  assert.equal(box.right, center.bt);
  assert.notEqual(box.right, center.formed);
});

for (const inverted of [false, true]) {
  test(`20: third-point equality remains a confirmed noncandidate${inverted ? ' (mirror)' : ''}`, async () => {
    const data = segmentEndpointFixture([0,4,2,6,3,7,4,9,5,10,6,11,7,12]);
    const output = tradingEvents(await run(inverted ? mirror(data) : data, { overlayLevels: false }));
    const third = output.find(event => event.category === '3' && event.price === (inverted ? -4 : 4) && event.direction === (inverted ? 'sell' : 'buy'));
    assert.ok(third);
    assert.equal(third.candidate, false);
    assert.equal(third.event_time, pointTime(data, 6));
  });
}

const boxEndpoints = [0,4,2,4,3,7,5,9,6,10,7,11,8,12];
const boxData = segmentEndpointFixture(boxEndpoints);

test('pending departure freezes the old center; permanent break excludes the connector from the next center', async () => {
  const context = await run(boxData, { overlayLevels: false });
  const old = centerWith(context, 2, 4), next = centerWith(context, 6, 7);
  assert.ok(old?.broken);
  assert.ok(next);
  assert.deepEqual([old.at, old.zd, old.bt, old.zg], [pointTime(boxData, 0), 2, pointTime(boxData, 4), 4]);
  assert.deepEqual([next.at, next.zd, next.bt, next.zg], [pointTime(boxData, 5), 6, pointTime(boxData, 8), 7]);
  assert.deepEqual(rectangle(boxes(context).find(box => box.bottom === 2 && box.top === 4)), [pointTime(boxData, 0), 2, pointTime(boxData, 4), 4]);
  assert.deepEqual(rectangle(boxes(context).find(box => box.bottom === 6 && box.top === 7)), [pointTime(boxData, 5), 6, pointTime(boxData, 8), 7]);
  assert.ok(old.formed > pointTime(boxData, 3));
});

const candidateEndpoints = [0,20,8,30,18,41,28,52,37,50,35,49,36,51,34,53,40,75,58,88,65,94,76,92,72,90,74,93,70,89,81,112,95,123,99,119,96,117,97,121,98,127,108,141,119,145,121,140,120,143,116,148];
const candidateData = segmentEndpointFixture(candidateEndpoints);

test('1?/2? remain purely structural candidates; second candidates are unique and can exceed their parent', async () => {
  const output = tradingEvents(await run(candidateData, { overlayLevels: false }));
  assert.ok(output.some(event => event.category === '1?' && event.candidate));
  assert.ok(output.some(event => event.category === '2?' && event.candidate));
  assert.ok(output.some(event => event.category === '3' && !event.candidate));
  const seconds = output.filter(event => event.category === '2?');
  assert.ok(seconds.some(second => output.some(first => first.category === '1?' && first.direction === second.direction && first.event_time < second.event_time && (second.direction === 'sell' ? second.price > first.price : second.price < first.price))));
  const ids = seconds.map(event => `${event.level}:${event.category}:${event.direction}:${event.event_time}`);
  assert.equal(new Set(ids).size, ids.length);
  for (const event of output) assert.equal(event.candidate, event.category !== '3');
});

test('center entry/exit are independent of point/category/direction filters', async () => {
  const context = await run(candidateData, { overlayLevels: false, alertPoints: false, classFilter: '3', directionFilter: '只买' });
  const output = events(context);
  assert.ok(output.some(event => event.category === 'center_enter' && event.kind === 'center' && event.direction === 'inside'));
  assert.ok(output.some(event => event.category === 'center_exit' && event.kind === 'center' && ['outside_above','outside_below'].includes(event.direction)));
  assert.ok(!output.some(event => ['1?','2?','3'].includes(event.category)));
  for (const event of output) assert.equal(event.candidate, false);
});

test('an unconfirmed right-hand bar cannot mutate frozen units, broken boxes, or historical events', async () => {
  const future = Date.UTC(2100, 0, 1);
  const data = candidateData.map(bar => ({ ...bar }));
  Object.assign(data.at(-1), { openTime: future, closeTime: future + 300000 });
  const changedData = data.map(bar => ({ ...bar }));
  Object.assign(changedData.at(-1), { high: data.at(-1).high + 100, low: data.at(-1).low - 100, close: data.at(-1).close + 50 });
  const original = await run(data), changed = await run(changedData);
  assert.ok(units(original).some(unit => unit.a === 0 && unit.b === 20));
  assert.deepEqual(snapshot(changed), snapshot(original));
  assert.deepEqual(events(changed), events(original));
  assert.deepEqual(boxes(changed).map(rectangle), boxes(original).map(rectangle));
});

test('bar budget stops the chain without rebuilding drawings or emitting later events', async () => {
  const data = candidateData, budget = 500;
  const atLimit = await run(data.slice(0, budget), { barBudget: budget });
  const longer = await run(data, { barBudget: budget }, true);
  assert.ok(units(atLimit).some(unit => unit.a === 0 && unit.b === 20));
  assert.equal(snapshot(longer).rawCount, budget);
  assert.deepEqual(snapshot(longer).frames, snapshot(atLimit).frames);
  assert.deepEqual(snapshot(longer).pens, snapshot(atLimit).pens);
  assert.deepEqual(events(longer), events(atLimit));
  assert.deepEqual(boxes(longer).map(rectangle), boxes(atLimit).map(rectangle));
});

const layeredData = recursiveFixture();
let layeredContext;
const layered = () => layeredContext ??= run(layeredData, { stateBudget: 15000, barBudget: 60000 });

test('default enabled S2/S3 recursively form distinct units; disabling the overlay leaves confirmed S1 unchanged', async () => {
  const all = await layered();
  const one = await run(layeredData, { overlayLevels: false, stateBudget: 15000, barBudget: 60000 });
  assert.deepEqual(units(one), units(all));
  assert.deepEqual(frame(one, 1).centers, frame(all, 1).centers);
  assert.deepEqual(events(one).filter(event => event.level === 1 && event.level_count === 1), events(all).filter(event => event.level === 1 && event.level_count === 1));
  assert.deepEqual(snapshot(one).frames.map(item=>item.id),[1]);
  assert.deepEqual(snapshot(all).frames.map(item=>item.id),[1,2,3]);
  assert.ok(units(all, 2).some(unit => unit.a === 40 && unit.b === 124));
  assert.ok(units(all, 3).some(unit => unit.a === 40 && unit.b === 160));
  assert.ok(units(all, 2).some(unit => segments(all).some(line => drawnAs(line, unit))));
  assert.ok(units(all, 3).some(unit => segments(all).some(line => drawnAs(line, unit))));
  assert.ok(segments(one).every(line => units(one).some(unit => drawnAs(line, unit))));
});

test('recursive units map real raw extrema and confirmed connected-node spans without copying layer output', async () => {
  const context = await layered();
  for(const id of [1,2,3]) assert.ok(units(context,id).length>=3);
  assertNodeRanges(context,layeredData);
});

test('all native JSON events are finite, same-chart, chronologically available and carry exact distinct layer IDs', async () => {
  const output = events(await layered());
  assert.ok(output.some(event => event.level === 1));
  assert.ok(output.some(event => event.level === 2));
  assert.ok(output.some(event => event.level === 3));
  for (const event of output) {
    for (const key of ['event_time','confirmed_time','observed_time','price']) assert.ok(Number.isFinite(event[key]), `${event.kind}.${key}`);
    assert.ok(event.event_time <= event.confirmed_time && event.confirmed_time <= event.observed_time);
    assert.ok(event.observed_time <= layeredData.at(-1).closeTime);
    assert.equal(event.timeframe, '5');
    assert.equal(event.level_count, event.levels.length);
    assert.equal(new Set(event.levels).size, event.levels.length);
    assert.ok(event.levels.every(id => Number.isInteger(id) && id >= 1 && id <= 3));
    if (event.level_count === 1) assert.deepEqual(event.levels, [event.level]);
    for (const obsolete of ['source_count','timeframes','source_confirmed_time','mode']) assert.ok(!(obsolete in event));
  }
});


const methods = (body, data, inputs = {}) => nativeMethods(body, data, snapshotProbe, inputs);
const plotLast = (context, name) => context.plots[name].data.at(-1).value;

test('native center stages freeze pending leaves and admit leave+return only on return', async () => {
  const data = pointBars([0,4,2,4,3,7,2]);
  const formed = await methods(memberScene, data.slice(0, 4));
  assert.deepEqual(rectangle(boxes(formed)[0]), [data[0].openTime,2,data[3].openTime,4]);
  assert.equal(centerWith(formed, 2, 4).formed, data[3].closeTime);
  const extended = await methods(memberScene, data.slice(0, 5));
  assert.deepEqual(rectangle(boxes(extended)[0]), [data[0].openTime,2,data[4].openTime,4]);
  const pending = await methods(memberScene, data.slice(0, 6));
  assert.deepEqual(rectangle(boxes(pending)[0]), rectangle(boxes(extended)[0]));
  assert.equal(plotLast(pending, 'test_departure'), 4);
  const returned = await methods(memberScene, data);
  assert.deepEqual(rectangle(boxes(returned)[0]), [data[0].openTime,2,data[6].openTime,4]);
  const z = centerWith(returned, 2, 4);
  assert.deepEqual([z.zd,z.zg,z.gg,z.dd,z.broken], [2,4,7,0,false]);
  assert.equal(plotLast(returned, 'test_departure'), -1);
});

test('native third break freezes permanently and skips the connecting member in new search', async () => {
  const data = pointBars(boxEndpoints);
  const broken = await methods(memberScene, data.slice(0, 7));
  const appended = await methods(memberScene, data);
  const expected = [data[0].openTime,2,data[4].openTime,4];
  assert.deepEqual(rectangle(boxes(broken)[0]), expected);
  assert.equal(centerWith(broken, 2, 4).broken, true);
  assert.equal(plotLast(broken, 'test_search_start'), 5);
  assert.deepEqual(rectangle(boxes(appended)[0]), expected);
  const next = centerWith(appended, 6, 7);
  assert.deepEqual([next.at,next.zd,next.bt,next.zg], [data[5].openTime,6,data[8].openTime,7]);
});

test('native center intersection and departure use actual H/L rather than endpoints', async () => {
  const data = pointBars([0,4,2,4,3,{close:3.5,high:6,low:3.5}]);
  const context = await methods(memberScene, data);
  assert.equal(plotLast(context, 'test_departure'), 4);
  assert.equal(centerWith(context, 2, 4).bt, data[4].openTime);
  assert.deepEqual(rectangle(boxes(context)[0]), [data[0].openTime,2,data[4].openTime,4]);
  const actual = await methods(memberScene, pointBars([{close:3,high:5,low:0},4,2,3]));
  assert.deepEqual([centerWith(actual, 2, 3).zd,centerWith(actual, 2, 3).zg], [2,3]);
  assert.ok(!frame(actual, 1).centers.some(z => z.zd === 3 && z.zg === 3));
});

test('native initial single-price box right edge is exactly the third member pivot', async () => {
  const data = pointBars([0,2,-1,0]);
  const context = await methods(memberScene, data);
  assert.deepEqual(rectangle(boxes(context)[0]), [data[0].openTime,0,data[3].openTime,0]);
  assert.equal(centerWith(context, 0, 0).formed, data[3].closeTime);
});


test('appending confirmed行情 cannot change frozen endpoints or a broken historical rectangle', async () => {
  const original = await run(boxData);
  const appendedData = segmentEndpointFixture([...boxEndpoints,9,15,11,16,12,17]);
  const appended = await run(appendedData);
  const before = snapshot(original).frames, after = snapshot(appended).frames;
  for (const id of [1,2,3]) assert.deepEqual(after[id-1].units.slice(0,before[id-1].units.length), before[id-1].units);
  assert.ok(hasSegment(original,0,4));
  assert.deepEqual(after[0].centers.find(z=>z.zd===2 && z.zg===4), before[0].centers.find(z=>z.zd===2 && z.zg===4));
  assert.deepEqual(rectangle(boxes(appended).find(box => box.bottom === 2 && box.top === 4)), [pointTime(boxData,0),2,pointTime(boxData,4),4]);
  assert.deepEqual(events(appended).filter(event => event.observed_time <= boxData.at(-1).closeTime), events(original));
});

test('state object budget stops every layer rather than recomputing after additional行情', async () => {
  const stopped = await run(candidateData.slice(0,180), { stateBudget:100 }, true);
  const appended = await run(candidateData, { stateBudget:100 }, true);
  assert.equal(snapshot(stopped).candleCount,100);
  assert.ok(snapshot(stopped).pens.some(pen => pen.a === 0 && pen.b === 14));
  assert.deepEqual(snapshot(appended),snapshot(stopped));
  assert.deepEqual(events(appended),events(stopped));
  assert.deepEqual(boxes(appended).map(rectangle),boxes(stopped).map(rectangle));
});

test('drawing eviction deletes boxes only, never frozen units, center state, or events', async () => {
  const points = [0];
  for (let i = 1; i <= 1200; i++) points.push(i % 2 ? 4 + 3 * Math.floor(i / 2) : 2 + 3 * (i / 2 - 1));
  const data = pointBars(points);
  const drawn = await nativeConsumer(memberScene, data, {}, snapshotProbe);
  const hidden = await nativeConsumer(memberScene, data, { showCenters:false }, snapshotProbe);
  assert.ok(frame(drawn,1).centers.length > boxes(drawn).length);
  assert.ok(boxes(drawn).length > 0);
  assert.ok(!boxes(drawn).some(box=>box.left===frame(drawn,1).centers[0].at));
  assert.deepEqual(boxes(drawn).map(rectangle),frame(drawn,1).centers.slice(-boxes(drawn).length).map(z=>[z.at,z.zd,z.bt,z.zg]));
  assert.deepEqual(boxes(hidden),[]);
  assert.deepEqual(snapshot(hidden),snapshot(drawn));
  assert.ok(events(drawn).some(event => event.category === '3' && event.direction === 'buy' && event.price === 8 && event.event_time === data[6].openTime));
  assert.deepEqual(events(hidden),events(drawn));
});


test('raw whole-bar ranges exclude the post-pivot inclusion extreme and retain the true in-range second extreme', async () => {
  const data = pointBars([{close:6,high:8,low:3},{close:7,high:9,low:4},{close:8,high:10,low:5},{close:7,high:10,low:1}]);
  const context = await methods(rawRangeScene,data);
  const pen = snapshot(context).pens[0];
  assert.deepEqual([pen.at,pen.bt,pen.h,pen.l,pen.ht,pen.lt], [data[0].openTime,data[2].openTime,10,3,data[2].openTime,data[0].openTime]);
  assert.equal(plotLast(context,'test_boundary_low'),5);
  assert.equal(plotLast(context,'test_normalized_low'),5);
  assert.notEqual(pen.l,data[3].low);
});

test('higher features follow connected nodes despite reversed internal extrema, while the parent keeps the real range', async () => {
  const data = pointBars([79600,75605,77000,74967,76111,75350,76304,75400,76304,75500,76305,75450]);
  const touch = await methods(nodeRangeScene,data.slice(0,9));
  assert.equal(snapshot(touch).halted,false);
  assert.deepEqual(units(touch,2),[]);
  const context = await methods(nodeRangeScene,data);
  assert.equal(snapshot(context).halted,false);
  const lower = units(context,1)[1], parent = units(context,2)[0];
  assert.deepEqual([lower.dir,lower.a,lower.b,lower.h,lower.l,lower.ht,lower.lt], [1,75605,76111,77000,74967,data[2].openTime,data[3].openTime]);
  assert.deepEqual(['test_feature_h','test_feature_l','test_feature_ht','test_feature_lt'].map(key=>plotLast(context,key)), [76111,75605,data[4].openTime,data[1].openTime]);
  assert.deepEqual([parent.dir,parent.a,parent.at,parent.b,parent.bt,parent.first,parent.last,parent.h,parent.l,parent.ht,parent.lt], [-1,79600,data[0].openTime,75350,data[5].openTime,0,3,79600,74967,data[0].openTime,data[3].openTime]);
});

const consumerData = pointBars(Array.from({length:25}, (_,index)=>100+index));
const cohorts = context => events(context).filter(event=>['confluence','candidate_confluence'].includes(event.kind));

test('native confluence isolates category/side/candidate, uses real different layer IDs, expires in bar_index space and deduplicates', async () => {
  const context = await nativeConsumer(consumerScene,consumerData,{alertCandidates:true});
  assert.deepEqual(cohorts(context).map(event=>[event.observed_time,event.category,event.direction,event.candidate,event.levels]), [
    [consumerData[3].closeTime,'3','buy',false,[1,2]],
    [consumerData[6].closeTime,'1?','buy',true,[1,3]],
    [consumerData[7].closeTime,'3','sell',false,[2,3]],
    [consumerData[22].closeTime,'3','buy',false,[2,3]],
    [consumerData[24].closeTime,'3','buy',false,[1,3]],
  ]);
  assert.equal(events(context).filter(event=>event.price===103 && event.kind==='point').length,1);
  assert.ok(!cohorts(context).some(event=>event.observed_time===consumerData[4].closeTime));
  assert.ok(events(context).some(event=>event.kind==='center' && event.level===3 && event.category==='center_enter'));
  for (const event of cohorts(context)) {
    assert.equal(event.level_count,event.levels.length);
    for (const id of event.levels) assert.ok(events(context).some(peer=>peer.level===id && peer.category===event.category && peer.direction===event.direction && peer.candidate===event.candidate && peer.confirmed_time<=event.observed_time));
  }
});

test('native confluence gates default candidate eligibility, shown layers, selected level, category, and side independently', async () => {
  const defaults = await nativeConsumer(consumerScene,consumerData);
  assert.deepEqual(cohorts(defaults).map(event=>event.price),[103,107,122,124]);
  assert.ok(!events(defaults).some(event=>event.candidate));
  const one = await nativeConsumer(consumerScene,consumerData,{overlayLevels:false,alertCandidates:true});
  assert.deepEqual(cohorts(one),[]);
  assert.ok(events(one).some(event=>event.level===1 && event.price===100));
  assert.ok(!events(one).some(event=>event.level!==1));
  const chosen = await nativeConsumer(consumerScene,consumerData,{alertLevel:2,alertCandidates:true});
  assert.deepEqual(cohorts(chosen),[]);
  assert.ok(events(chosen).some(event=>event.level===2 && event.price===103));
  assert.ok(!events(chosen).some(event=>event.level!==2));
  const buyThree = await nativeConsumer(consumerScene,consumerData,{directionFilter:'只买',classFilter:'3',alertCandidates:true});
  assert.deepEqual(cohorts(buyThree).map(event=>event.price),[103,122,124]);
  assert.ok(events(buyThree).some(event=>event.kind==='center' && event.level===3));
  const centersOnly = await nativeConsumer(consumerScene,consumerData,{alertPoints:false,alertConfluence:false,directionFilter:'只卖',classFilter:'2?'});
  assert.deepEqual(events(centersOnly).map(event=>[event.kind,event.category,event.level]),[['center','center_enter',3]]);
});


test('center crossings are evaluated independently for every recursive layer against the same previous raw close', async () => {
  const context = await layered();
  for (const id of [1,2,3]) {
    const output = events(context).filter(event=>event.kind==='center' && event.level===id);
    assert.ok(output.some(event=>event.category==='center_enter'), 'S'+id+' enters its own center');
    assert.ok(output.some(event=>event.category==='center_exit'), 'S'+id+' exits its own center');
    for (const event of output) {
      const index = layeredData.findIndex(bar=>bar.closeTime===event.confirmed_time);
      assert.ok(index>0);
      const previous = layeredData[index-1].close, current = layeredData[index].close;
      const center = frame(context,id).centers.filter(z=>z.formed<event.confirmed_time).at(-1);
      assert.ok(center);
      const inside = value=>value>=center.zd && value<=center.zg;
      assert.equal(inside(previous),event.category==='center_exit');
      assert.equal(inside(current),event.category==='center_enter');
      assert.ok(Math.abs(event.price-current)<0.011);
      assert.equal(event.confirmed_time,event.observed_time);
    }
  }
});


test('recursive layers expose exact independent raw pivots, member windows and configured active-layer counts', async () => {
  const all = await layered();
  for (const [id,endIndex,endPrice] of [[1,30,98.8],[2,130,124],[3,630,160]]) {
    const unit = units(all,id)[0];
    assert.deepEqual([unit.a,unit.at,unit.b,unit.bt,unit.h,unit.l,unit.ht,unit.lt], [40,layeredData[5].openTime,endPrice,layeredData[endIndex].openTime,endPrice,40,layeredData[endIndex].openTime,layeredData[5].openTime]);
    assert.ok(unit.confirmed>unit.bt);
  }
  assert.deepEqual(frame(all,3).centers.map(z=>[z.at,z.zd,z.bt,z.zg]), [
    [layeredData[5].openTime,70,layeredData[2505].openTime,160],
    [layeredData[3130].openTime,245,layeredData[8755].openTime,310],
  ]);
  const two = await run(layeredData,{levelCount:2,stateBudget:15000,barBudget:60000});
  for (const id of [1,2]) {
    assert.deepEqual(units(two,id),units(all,id));
    assert.deepEqual(frame(two,id).centers,frame(all,id).centers);
  }
  assert.deepEqual(snapshot(two).frames.map(item=>item.id),[1,2]);
  assert.ok(!events(two).some(event=>event.levels.includes(3)));
});


test('unknown left-edge startup rebases only unpublished state and then confirms real S1 units and centers', async () => {
  const context = await run(structureFixture());
  assert.deepEqual(units(context).slice(0,3).map(p=>[p.a,p.at,p.b,p.bt,p.first,p.last]), [
    [15.92,1704072300000,42.08,1704091200000,1,8],
    [42.08,1704091200000,26.92,1704099300000,8,11],
    [26.92,1704099300000,51.08,1704107400000,11,14],
  ]);
  assert.deepEqual(frame(context,1).centers.slice(0,2).map(z=>[z.at,z.zd,z.bt,z.zg]), [
    [1704072300000,26.92,1704115500000,42.08],
    [1704123600000,57.92,1704228900000,65.08],
  ]);
  assert.ok(events(context).some(event=>event.level===1 && event.kind==='center'));
  assert.ok(segments(context).some(line=>line.x1===1704072300000 && line.y1===15.92 && line.x2===1704091200000 && line.y2===42.08));
});

test('native higher segmentation preserves 78 whole-range extremes and immutable confirmed pivots', async () => {
  const points = [4,1,8,3,11,5,15,8,17,9,16,7,14,2,10,1,8,3,9,2,7,3,10,4,11,5];
  const data = pointBars(points);
  const context = await methods(higherBuilderScene,data);
  assert.equal(snapshot(context).halted,false);
  const unit = units(context,2)[0];
  assert.deepEqual([unit.a,unit.at,unit.b,unit.bt,unit.first,unit.last,unit.h,unit.l,unit.ht,unit.lt], [4,data[0].openTime,1,data[15].openTime,0,15,17,1,data[8].openTime,data[15].openTime]);
  const appended = await methods(higherBuilderScene,pointBars([...points,100,20,80,30]));
  assert.equal(snapshot(appended).halted,false);
  assert.deepEqual(units(appended,2)[0],unit);
});

test('attached reverse local extrema must respect the frozen anchor and still confirm a later genuine reversal', async () => {
  const points = [0,5,2,{close:11,high:11,low:1},{close:12,high:12,low:10},4,8,6,10,9,16,14,18,13,17,15,20,16,21,2,9,1,8,3,10,4,11,5,12,6];
  const data = pointBars(points);
  const local = await methods(attachedPivotScene,data.slice(0,19));
  assert.equal(snapshot(local).halted,false);
  assert.deepEqual(units(local,2).map(p=>[p.a,p.at,p.b,p.bt]), [[0,data[0].openTime,11,data[3].openTime]]);
  const reversed = await methods(attachedPivotScene,data);
  assert.equal(snapshot(reversed).halted,false);
  assert.deepEqual(units(reversed,2)[0],units(local,2)[0]);
  const second = units(reversed,2)[1];
  assert.deepEqual([second.a,second.at,second.b,second.bt,second.first,second.last,second.h,second.l,second.ht,second.lt], [11,data[3].openTime,1,data[21].openTime,3,20,21,1,data[18].openTime,data[21].openTime]);
});


test('same-close native batch aggregates all distinct layers once before confluence and honors a three-layer threshold', async () => {
  const data = pointBars([{close:103,high:103,low:101},104,105]);
  const scene = ['array.clear(fresh)','if bar_index == 0','    for id = 1 to 3','        array.push(fresh,Signal.new(id,3,1,false,time,time_close,bar_index,101))','    array.push(fresh,Signal.new(2,3,1,false,time,time_close,bar_index,101))'].join('\n');
  for (const minimum of [2,3]) {
    const context = await nativeConsumer(scene,data,{minConfluenceLevels:minimum});
    assert.deepEqual(cohorts(context).map(event=>[event.category,event.level,event.levels,event.level_count,event.observed_time]), [['3',3,[1,2,3],3,data[0].closeTime]]);
    assert.deepEqual(events(context).filter(event=>event.kind==='point').map(event=>event.level),[1,2,3]);
    assert.equal(records(context).length,1);
  }
});

test('deterministic synthetic raw OHLC advances frozen S2/S3 with new pivots and a new center without reinitializing layers', async () => {
  const original = await layered();
  const tail = recursiveFixture({barsPerPen:4,macroEndpoints:[40,160,70,230,125,310,190,370]});
  const shift = layeredData.at(-1).closeTime - tail[0].openTime;
  const data = layeredData.concat(tail.map(bar=>({...bar,openTime:bar.openTime+shift,closeTime:bar.closeTime+shift,open:400-2*bar.open,high:400-2*bar.low,low:400-2*bar.high,close:400-2*bar.close})));
  const advanced = await run(data,{stateBudget:15000,barBudget:60000});
  const before = snapshot(original).frames, after = snapshot(advanced).frames;
  for (const id of [1,2,3]) {
    const prior = before[id-1], current = after[id-1];
    assert.deepEqual(current.units.slice(0,prior.units.length),prior.units);
    for (const center of prior.centers.filter(z=>z.broken)) assert.deepEqual(current.centers.find(z=>z.at===center.at),center);
  }
  assert.deepEqual(after[1].units.slice(-4).map(p=>[p.a,p.at,p.b,p.bt,p.first,p.last]), [
    [20,1707782700000,-232,1707812700000,525,530],
    [-232,1707812700000,-88,1707842700000,530,535],
    [-88,1707842700000,-286,1707872700000,535,540],
    [-286,1707872700000,-196,1707902700000,540,545],
  ]);
  assert.deepEqual(after[2].units.slice(-4).map(p=>[p.a,p.at,p.b,p.bt,p.first,p.last]), [
    [260,1707182700000,-60,1707332700000,85,90],
    [-60,1707332700000,150,1707482700000,90,95],
    [150,1707482700000,-220,1707632700000,95,100],
    [-220,1707632700000,20,1707782700000,100,105],
  ]);
  const next = after[2].centers.find(z=>z.at===1707332700000);
  assert.deepEqual([next.at,next.zd,next.bt,next.zg], [1707332700000,-60,1707782700000,20]);
  const output = events(advanced);
  assert.ok(output.some(event=>event.level===3 && event.kind==='point' && event.category==='3' && event.direction==='sell' && event.price===150 && event.event_time===1707482700000));
  assert.deepEqual(output.filter(event=>event.observed_time<=layeredData.at(-1).closeTime),events(original));
});


const capturedData = await marketFixture();
let capturedContext;
const captured = () => capturedContext ??= run(capturedData,{stateBudget:15000,barBudget:60000});

test('captured BTC OHLC historical-price replay advances S2 across reversed internal extrema using connected nodes', async () => {
  const context = await captured();
  assert.equal(snapshot(context).rawCount,10000);
  assert.equal(units(context,2).length,7);
  assert.deepEqual(units(context,3),[]);
  const internal = units(context,1)[34];
  assert.deepEqual([internal.dir,internal.a,internal.b,internal.l],[1,75605,76111,74967.97]);
  assert.ok(internal.ht<internal.lt);
  assert.ok(internal.h>internal.b);
  const resolved = units(context,2).find(unit=>unit.first===33);
  assert.deepEqual([resolved.a,resolved.at,resolved.b,resolved.bt,resolved.first,resolved.last,resolved.h,resolved.l,resolved.ht,resolved.lt], [79600,1705125300000,75250,1705294800000,33,38,79600,74967.97,1705125300000,1705206300000]);
  assert.deepEqual(units(context,2).slice(-2).map(unit=>[unit.a,unit.b,unit.first,unit.last]), [[79600,75250,33,38],[75250,85255,38,53]]);
  assertNodeRanges(context,capturedData);
});

test('a deterministic synthetic OHLC suffix after captured BTC prices matures S3 and preserves the new-source frozen prefix', async () => {
  const original = await captured();
  const tail = recursiveFixture({barsPerPen:4,macroEndpoints:[40,160,70,230,125,310,190,370]});
  const shift = capturedData.at(-1).closeTime-tail[0].openTime;
  const data = capturedData.concat(tail.map(bar=>({...bar,openTime:bar.openTime+shift,closeTime:bar.closeTime+shift,open:68000+60*bar.open,high:68000+60*bar.high,low:68000+60*bar.low,close:68000+60*bar.close})));
  const advanced = await run(data,{stateBudget:15000,barBudget:60000});
  const before = snapshot(original).frames, after = snapshot(advanced).frames;
  for(const id of [1,2,3]) {
    const prior = before[id-1], current = after[id-1];
    assert.deepEqual(current.units.slice(0,prior.units.length),prior.units);
    for(const center of prior.centers.filter(z=>z.broken)) assert.deepEqual(current.centers.find(z=>z.at===center.at),center);
  }
  assert.deepEqual(after[1].units.slice(-4).map(unit=>[unit.a,unit.at,unit.b,unit.bt,unit.first,unit.last]), [
    [79400,1707968400000,86960,1707998400000,226,231],
    [86960,1707998400000,82640,1708028400000,231,236],
    [82640,1708028400000,88580,1708058400000,236,241],
    [88580,1708058400000,85880,1708088400000,241,246],
  ]);
  assert.deepEqual(after[2].units.slice(-4).map(unit=>[unit.a,unit.at,unit.b,unit.bt,unit.first,unit.last]), [
    [72200,1707368400000,81800,1707518400000,18,23],
    [81800,1707518400000,75500,1707668400000,23,28],
    [75500,1707668400000,86600,1707818400000,28,33],
    [86600,1707818400000,79400,1707968400000,33,38],
  ]);
  assertNodeRanges(advanced,data);
  const center = after[2].centers[0];
  assert.deepEqual([center.at,center.zd,center.bt,center.zg],[1704069900000,72200,1707668400000,77600]);
  assert.equal(center.broken,true);
  const output = events(advanced);
  assert.ok(output.some(event=>event.level===3 && event.kind==='point' && event.category==='3' && event.direction==='buy' && event.price===79400 && event.event_time===1707968400000));
  assert.deepEqual(output.filter(event=>event.observed_time<=capturedData.at(-1).closeTime),events(original));
  for(const event of output) for(const key of ['event_time','confirmed_time','observed_time','price']) assert.ok(Number.isFinite(event[key]));
});

