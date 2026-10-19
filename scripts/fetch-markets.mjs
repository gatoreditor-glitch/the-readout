// Markets strip fetcher — index/futures proxies via the Finnhub connector.
// Writes src/_data/markets.json for the Eleventy build (rendered under the masthead).
// If the fetch fails, the existing markets.json is kept so the site still builds.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const helper = path.join(
  process.env.HOME,
  "workspace/custom-connectors/custom.finnhub/bin/finnhub.py"
);

// ETF proxies for the big benchmarks (labeled as such in the README).
const INSTRUMENTS = [
  { label: "Dow Jones", symbol: "DIA" },
  { label: "S&P 500", symbol: "SPY" },
  { label: "Nasdaq 100", symbol: "QQQ" },
  { label: "Gold", symbol: "GLD" },
  { label: "Crude Oil", symbol: "USO" },
];

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

async function quoteViaApi(symbol) {
  const r = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
  );
  if (!r.ok) throw new Error(`finnhub ${r.status}`);
  const q = await r.json();
  if (typeof q.c !== "number" || !q.c) throw new Error("no quote");
  return q;
}

async function quoteViaHelper(symbol) {
  const { stdout } = await execFileAsync(
    "python3", [helper, "quote", "--symbol", symbol],
    { timeout: 30000 }
  );
  return JSON.parse(stdout);
}

const items = [];
for (const { label, symbol } of INSTRUMENTS) {
  try {
    const q = FINNHUB_KEY ? await quoteViaApi(symbol) : await quoteViaHelper(symbol);
    if (typeof q.c !== "number") throw new Error("no quote");
    items.push({ label, symbol, price: q.c, change: q.d, pct: q.dp });
  } catch (e) {
    console.warn(`markets: ${symbol} failed, skipping`);
  }
}

if (!items.length) {
  console.warn("markets: nothing fetched, keeping existing markets.json");
  process.exit(0);
}

const outDir = path.join(root, "src", "_data");
await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, "markets.json"),
  JSON.stringify({ updated: new Date().toISOString(), items }, null, 2)
);
console.log(`markets: wrote ${items.length} quotes`);
