// Finance-only wire fetcher: free RSS sources, no API keys required.
// Writes src/_data/wire.json grouped by category for the Eleventy build.
// Feeds that fail are skipped; if nothing new arrives, the previous
// wire.json is kept so the site still builds.
import { writeFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Parser from "rss-parser";

const parser = new Parser({ timeout: 25000 });
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const RSS_FEEDS = [
  { category: "Finance", name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html" },
  { category: "Finance", name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss" },
];
const ORDER = ["Finance"];
const PER_CATEGORY = 12;

const groups = { Finance: [] };
const seen = new Set();

function add({ category, headline, source, url, datetime }) {
  if (!url || !headline || seen.has(url)) return false;
  seen.add(url);
  const ms = Date.parse(datetime);
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

// "Latest" list for the homepage rail (all finance now).
const latest = [...groups.Finance]
  .sort((a, b) => (b.datetime || "").localeCompare(a.datetime || ""))
  .slice(0, 8);

await writeFile(
  path.join(outDir, "wire.json"),
  JSON.stringify({ updated: new Date().toISOString(), order: ORDER, groups, latest }, null, 2)
);
console.log(`wire: wrote ${total} finance items`);
