// Deterministic synthetic data for exercising structure confirmation; these are not exchange prices.
export function structureFixture() {
  const segments = [10, 30, 18, 42, 27, 51, 38, 65, 50, 72, 58, 85,
    63, 80, 61, 79, 62, 81, 60, 82, 65, 104, 87, 117, 96, 129,
    106, 125, 102, 123, 103, 126, 98, 120, 89, 112, 75, 99,
    65, 89, 58, 78, 47, 68, 39, 63, 42, 68, 51, 79];
  const endpoints = [segments[0]];
  for (let i = 1; i < segments.length; i++) {
    const first = segments[i - 1], delta = segments[i] - first;
    endpoints.push(first + 0.7 * delta, first + 0.3 * delta, segments[i]);
  }
  const start = Date.UTC(2024, 0, 1), data = [], barsPerStroke = 9;
  let previous = endpoints[0];
  function append(close) {
    const open = previous;
    data.push({
      openTime: start + data.length * 300000,
      closeTime: start + (data.length + 1) * 300000,
      open, high: Math.max(open, close) + 0.08,
      low: Math.min(open, close) - 0.08, close,
    });
    previous = close;
  }
  for (let i = 1; i < endpoints.length; i++) {
    for (let j = 1; j <= barsPerStroke; j++) {
      append(endpoints[i - 1] + (endpoints[i] - endpoints[i - 1]) * j / barsPerStroke);
    }
  }
  for (let j = 0; j < 30; j++) append(previous + (j < 15 ? -0.5 : 0.5));
  return data;
}

export function penEndpointFixture(endpoints, { barsPerPen = 9, prefix = [], tail = [] } = {}) {
  const data = [], start = Date.UTC(2024, 0, 1);
  const points = [...prefix, ...endpoints, ...tail];
  function append(price) {
    data.push({
      openTime: start + data.length * 300000,
      closeTime: start + (data.length + 1) * 300000,
      open: price, high: price, low: price, close: price,
    });
  }
  append(points[0]);
  for (let i = 1; i < points.length; i++) {
    for (let j = 1; j <= barsPerPen; j++) {
      append(points[i - 1] + (points[i] - points[i - 1]) * j / barsPerPen);
    }
  }
  return data;
}

export function segmentEndpointFixture(endpoints, options = {}) {
  const pens = [endpoints[0]];
  for (let i = 1; i < endpoints.length; i++) {
    const first = endpoints[i - 1], delta = endpoints[i] - first;
    pens.push(first + 0.7 * delta, first + 0.3 * delta,
      first + 0.85 * delta, first + 0.6 * delta, endpoints[i]);
  }
  return penEndpointFixture(pens, { prefix: [2], ...options });
}

// Price interpolation only, not a JavaScript copy of Chan state.
export function recursiveFixture({ barsPerPen = 5, macroEndpoints = [40,160,70,230,125,310,190,370,245,345,225,350,210,400,270,460] } = {}) {
  let endpoints = macroEndpoints;
  for (let depth = 0; depth < 2; depth++) {
    const expanded = [endpoints[0]];
    for (let i = 1; i < endpoints.length; i++) {
      const a = endpoints[i - 1], delta = endpoints[i] - a;
      expanded.push(a + 0.7 * delta, a + 0.3 * delta, a + 0.85 * delta, a + 0.6 * delta, endpoints[i]);
    }
    endpoints = expanded;
  }
  return segmentEndpointFixture(endpoints, { prefix: [60], barsPerPen });
}
