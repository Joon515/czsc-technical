import { readFile } from 'node:fs/promises';

// This is the TradingView website's undocumented compilation endpoint, not a supported public API.
// It checks source diagnostics only; it neither runs chart data nor creates/sends TradingView alerts.
const endpoint = 'https://pine-facade.tradingview.com/pine-facade/translate_light/';
const paths = process.argv.slice(2);
if (!paths.length) paths.push('pine/chanlun.pine');
let failed = false;
for (const path of paths) {
  try {
    const source = await readFile(path, 'utf8');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Origin: 'https://www.tradingview.com',
        Referer: 'https://www.tradingview.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      body: new URLSearchParams({ source }),
      signal: AbortSignal.timeout(30000),
    });
    const reply = await response.json();
    console.log(JSON.stringify({ path, httpStatus: response.status, response: reply }));
    const errors = reply.result?.errors2 || reply.errors2 || [];
    failed ||= !response.ok || reply.success !== true || !reply.result || errors.length > 0;
  } catch (error) {
    failed = true;
    console.error(`${path}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
