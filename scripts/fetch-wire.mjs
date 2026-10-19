// Multi-category wire fetcher: News via RSS, Finance via Finnhub.
// Writes src/_data/wire.json grouped by category for the Eleventy build.
// Feeds that fail are skipped; if nothing new arrives, the previous
// wire.json is kept so the site still builds.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const execFileAsync = promisify(execFile);
const parser = new Parser({ timeout: 25000 });
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const helper = path.join(
  process.env.HOME,
  "workspace/custom-connectors/custom.finnhub/bin/finnhub.py"
);

const RSS_FEEDS = [
  { category: "News", name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { category: "News", name: "NPR", url: "https://feeds.npr.org/1001/rss.xml" },
];
const ORDER = ["News", "Finance"];
const PER_CATEGORY = 12;

const groups = { News: [], Finance: [] };
const seen = new Set();

function add({ category, headline, source, url, datetime }) {
  if (!url || !headline || seen.has(url)) return false;
  seen.add(url);
  // Finnhub gives unix seconds; RSS gives ISO/pubDate strings.
  const ms = typeof datetime === "number" ? datetime * 1000 : Date.parse(datetime);
  const iso = isNaN(ms) ? null : new Date(ms).toISOString();
  groups[category].push({ headline, source, url, datetime: iso, _ts: iso ? Date.parse(iso) : 0 });
  return true;
}

for (const feed of RSS_FEEDS) {
  try {
    const data = await parser.parseURL(feed.url);
    let n = 0;
    for (const entry of data.items || []) {
      if (n >= PER_CATEGORY) break;
      if (add({ category: feed.category, headline: entry.title, source: feed.name, url: entry.link, datetime: entry.isoDate || entry.pubDate })) n++;
    }
    console.log(`wire: ${feed.name} ok (${n} items)`);
  } catch (e) {
    console.warn(`wire: ${feed.name} failed, skipping`);
  }
}

const to = new Date().toISOString().slice(0, 10);
const from = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

async function finnhubNewsViaApi(symbol) {
  const r = await fetch(
    `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_KEY}`
  );
  if (!r.ok) throw new Error(`finnhub ${r.status}`);
  return r.json();
}

async function finnhubNewsViaHelper(symbol) {
  const { stdout } = await execFileAsync(
    "python3", [helper, "news", "--symbol", symbol, "--from", from, "--to", to],
    { timeout: 30000 }
  );
  return JSON.parse(stdout);
}

for (const symbol of ["SPY", "QQQ", "AAPL", "NVDA"]) {
  if (groups.Finance.length >= PER_CATEGORY) break;
  try {
    const news = FINNHUB_KEY ? await finnhubNewsViaApi(symbol) : await finnhubNewsViaHelper(symbol);
    for (const n of news.slice(0, 10)) {
      if (groups.Finance.length >= PER_CATEGORY) break;
      add({ category: "Finance", headline: n.headline, source: n.source || "Finnhub", url: n.url, datetime: n.datetime });
    }
  } catch (e) {
    console.warn(`wire: Finnhub ${symbol} failed, skipping`);
  }
}

const total = ORDER.reduce((s, c) => s + groups[c].length, 0);
if (total === 0) {
  console.warn("wire: nothing fetched, keeping existing wire.json");
  process.exit(0);
}
for (const c of ORDER) {
  groups[c].sort((a, b) => b._ts - a._ts);
  groups[c] = groups[c].slice(0, PER_CATEGORY).map(({ _ts, ...rest }) => rest);
}

const outDir = path.join(root, "src", "_data");
await mkdir(outDir, { recursive: true });

// Mixed "latest" list for the homepage What's News rail.
const latestAll = [];
for (const c of ORDER) for (const it of groups[c]) latestAll.push({ ...it, category: c });
latestAll.sort((a, b) => b._ts - a._ts);
const latest = latestAll.slice(0, 8).map(({ _ts, ...rest }) => rest);

await writeFile(
  path.join(outDir, "wire.json"),
  JSON.stringify({ updated: new Date().toISOString(), order: ORDER, groups, latest }, null, 2)
);
console.log(`wire: wrote ${total} items (${ORDER.map((c) => `${c}:${groups[c].length}`).join(", ")})`);
