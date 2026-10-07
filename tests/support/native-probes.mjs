import { execute, source } from './pine-runtime.mjs';

export function pointBars(points) {
  const start = Date.UTC(2024, 0, 1);
  return points.map((point, index) => {
    const close = typeof point === 'number' ? point : point.close;
    return {
      openTime: start + index * 300000, closeTime: start + (index + 1) * 300000,
      open: close, high: typeof point === 'number' ? close : point.high,
      low: typeof point === 'number' ? close : point.low, close,
    };
  });
}

// Execute production Pine methods, with native inputs and no JavaScript state model.
async function nativeSlices() {
  const native = await source();
  const methodsEnd = native.indexOf('float chartSeconds = timeframe.in_seconds()');
  const consumerStart = native.indexOf('var array<int> confluenceTimes');
  const consumerEnd = native.indexOf('alertcondition(strictBuy', consumerStart);
  if (methodsEnd < 0 || consumerStart < methodsEnd || consumerEnd < consumerStart) throw new Error('Native probe boundaries are unavailable');
  return { methods: native.slice(0, methodsEnd) + '\nvar Root root = f_root()\n', consumer: native.slice(consumerStart, consumerEnd) };
}

export async function nativeMethods(body, data, append, inputs = {}) {
  const { methods } = await nativeSlices();
  return execute({ data, inputs, nativeSource: methods + body, append });
}

export const memberScene = String.raw`
Frame testFrame = array.get(root.frames, 0)
Level testLevel = testFrame.structure
array.clear(fresh)
if bar_index > 0
    Leg member = Leg.new(close > close[1] ? 1 : -1, close[1], close, time[1], time, bar_index - 1, bar_index, time_close, math.max(high, high[1]), math.min(low, low[1]), high > high[1] ? time : time[1], low < low[1] ? time : time[1])
    f_levelPart(root, testFrame, member, time_close)
plot(testLevel.departure, "test_departure")
plot(testLevel.searchStart, "test_search_start")
`;


export async function nativeConsumer(scene, data, inputs = {}, append = '') {
  const { methods, consumer } = await nativeSlices();
  return execute({ data, inputs, append, nativeSource: methods + scene + '\n' + consumer });
}

export const consumerScene = String.raw`
array.clear(fresh)
if bar_index == 0
    array.push(fresh, Signal.new(1,3,1,false,time,time_close,0,100))
if bar_index == 1
    array.push(fresh, Signal.new(2,3,-1,false,time,time_close,1,101))
if bar_index == 2
    array.push(fresh, Signal.new(2,2,1,true,time,time_close,2,102))
if bar_index == 3
    array.push(fresh, Signal.new(2,3,1,false,time,time_close,3,103))
if bar_index == 4
    array.push(fresh, Signal.new(2,3,1,false,time[1],time_close[1],3,103))
if bar_index == 5
    array.push(fresh, Signal.new(3,1,1,true,time,time_close,5,105))
if bar_index == 6
    array.push(fresh, Signal.new(1,1,1,true,time,time_close,6,106))
if bar_index == 7
    array.push(fresh, Signal.new(3,3,-1,false,time,time_close,7,107))
if bar_index == 8
    array.push(fresh, Signal.new(3,0,0,false,time,time_close,8,108))
if bar_index == 9
    array.push(fresh, Signal.new(1,2,-1,true,time,time_close,9,109))
if bar_index == 22
    array.push(fresh, Signal.new(3,3,1,false,time,time_close,22,122))
if bar_index == 24
    array.push(fresh, Signal.new(1,3,1,false,time,time_close,24,124))
`;


export const rawRangeScene = String.raw`
f_ingest(root, time, time_close, high, low)
float testBoundaryLow = na
float testNormalizedLow = na
if barstate.islast
    Point a = Point.new(-1,6,8,time[3],0)
    Point b = Point.new(1,10,10,time[1],2)
    array.push(root.pens, f_leg(root,a,b,time_close))
    [h,l,ht,lt] = f_range(root,time[1],8,time[1],10)
    testBoundaryLow := l
    K merged = array.get(root.candles,2)
    testNormalizedLow := merged.l
plot(testBoundaryLow,"test_boundary_low")
plot(testNormalizedLow,"test_normalized_low")
`;

export const nodeRangeScene = String.raw`
f_ingest(root,time,time_close,high,low)
Frame bottom = array.get(root.frames,0)
Frame higher = array.get(root.frames,1)
var float testFeatureH = na
var float testFeatureL = na
var int testFeatureHT = na
var int testFeatureLT = na
if bar_index == 1 or bar_index >= 4
    int offset = bar_index == 4 ? 3 : 1
    float a = close[offset]
    int at = time[offset]
    [h,l,ht,lt] = f_range(root,at,a,time,close)
    int index = array.size(bottom.structure.parts)
    Leg unit = Leg.new(close>a?1:-1,a,close,at,time,index,index+1,time_close,h,l,ht,lt)
    array.push(bottom.structure.parts,unit)
    if index == 1
        Feature feature = f_feature(unit,index)
        testFeatureH := feature.h
        testFeatureL := feature.l
        testFeatureHT := feature.ht
        testFeatureLT := feature.lt
    f_segments(root,higher,bottom.structure.parts,time_close)
plot(testFeatureH,"test_feature_h")
plot(testFeatureL,"test_feature_l")
plot(testFeatureHT,"test_feature_ht")
plot(testFeatureLT,"test_feature_lt")

`;

export const higherBuilderScene = String.raw`
f_ingest(root,time,time_close,high,low)
Frame bottom = array.get(root.frames,0)
Frame higher = array.get(root.frames,1)
if bar_index > 0
    Leg lower = Leg.new(close > close[1] ? 1 : -1,close[1],close,time[1],time,bar_index-1,bar_index,time_close,math.max(high,high[1]),math.min(low,low[1]),high>high[1]?time:time[1],low<low[1]?time:time[1])
    array.push(bottom.structure.parts,lower)
    f_segments(root,higher,bottom.structure.parts,time_close)
`;

export const attachedPivotScene = String.raw`
f_ingest(root,time,time_close,high,low)
Frame bottom = array.get(root.frames,0)
Frame higher = array.get(root.frames,1)
if (bar_index > 0 and bar_index < 4) or bar_index >= 5
    int offset = bar_index == 5 ? 2 : 1
    float a = close[offset]
    int at = time[offset]
    [h,l,ht,lt] = f_range(root,at,a,time,close)
    int index = array.size(bottom.structure.parts)
    array.push(bottom.structure.parts,Leg.new(close>a?1:-1,a,close,at,time,index,index+1,time_close,h,l,ht,lt))
    if bar_index == 7
        higher.builder.dir := 1
        higher.builder.anchorPrice := 0
        higher.builder.anchorTime := time[7]
        f_segmentConfirm(root,higher,bottom.structure.parts,3,11,time[4],time_close)
    else if bar_index > 7
        f_segments(root,higher,bottom.structure.parts,time_close)
`;

