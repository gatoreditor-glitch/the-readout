// System Signals fetcher — daily market gauges from Massive (price action)
// + FRED (macro). Writes src/_data/signals.json for the Eleventy build.
//
// PROTOTYPE METHODOLOGY: thresholds below are illustrative placeholders.
// Replace them with the site's own system rules before launch.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOME = process.env.HOME;
const massive = path.join(HOME, "workspace/custom-connectors/custom.massive/bin/massive.py");
const fred = path.join(HOME, "workspace/custom-connectors/custom.fred/bin/fred.py");

const signals = [];
const fail = (id, label) =>
  signals.push({ id, label, value: "—", signal: "neutral", note: "Data unavailable in this build." });

const MASSIVE_KEY = process.env.MASSIVE_API_KEY;
const FRED_KEY = process.env.FRED_API_KEY;

async function massiveAggs(from, to) {
  if (MASSIVE_KEY) {
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${from}/${to}?apiKey=${MASSIVE_KEY}&limit=500&sort=asc`
    );
    if (!r.ok) throw new Error(`massive ${r.status}`);
    return ((await r.json()).results || []).map((b) => b.c);
  }
  const { stdout } = await execFileAsync(
    "python3",
    [massive, "aggs", "--ticker", "SPY", "--from", from, "--to", to, "--timespan", "day", "--limit", 400],
    { timeout: 60000 }
  );
  return JSON.parse(stdout).results.map((r) => r.c);
}

async function fredObs(series, { units, start } = {}) {
  // No --limit: FRED returns ascending, so take the tail for the latest values.
  if (FRED_KEY) {
    const p = new URLSearchParams({ series_id: series, api_key: FRED_KEY, file_type: "json" });
    if (units) p.set("units", units);
    if (start) p.set("observation_start", start);
    const r = await fetch(`https://api.stlouisfed.org/fred/series/observations?${p}`);
    if (!r.ok) throw new Error(`fred ${r.status}`);
    return ((await r.json()).observations || []).filter((o) => o.value !== ".");
  }
  const args = [fred, "observations", "--series", series];
  if (units) args.push("--units", units);
  if (start) args.push("--start", start);
  const { stdout } = await execFileAsync("python3", args, { timeout: 30000 });
  return JSON.parse(stdout).observations.filter((o) => o.value !== ".");
}

// --- Price action: SPY daily bars, ~1 year ---
try {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const bars = (await massiveAggs(from, to)).filter(Number.isFinite);
  if (bars.length < 210) throw new Error("not enough bars");
  const last = bars[bars.length - 1];
  const sma = (n) => bars.slice(-n).reduce((a, b) => a + b, 0) / n;
  const ma50 = sma(50);
  const ma200 = sma(200);
  const r63 = (last / bars[bars.length - 1 - 63] - 1) * 100;
  const rets = [];
  for (let i = bars.length - 20; i < bars.length; i++) rets.push(Math.log(bars[i] / bars[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  // Population SD by design (divide by N, per Matt's 2026-10-26 ruling): the gauge describes the full 20-day window.
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(252) * 100;

  const above50 = last > ma50;
  const above200 = last > ma200;
  signals.push({
    id: "trend",
    label: "Trend Regime",
    value: `SPY $${last.toFixed(2)}`,
    signal: above50 && above200 ? "bullish" : !above50 && !above200 ? "bearish" : "neutral",
    note:
      above50 && above200
        ? `Above 50-day ($${ma50.toFixed(0)}) and 200-day ($${ma200.toFixed(0)}) — uptrend intact.`
        : !above50 && !above200
          ? `Below 50-day ($${ma50.toFixed(0)}) and 200-day ($${ma200.toFixed(0)}) — downtrend.`
          : `Mixed — ${above50 ? "above" : "below"} 50-day, ${above200 ? "above" : "below"} 200-day.`,
  });
  signals.push({
    id: "momentum",
    label: "Momentum (3-mo)",
    value: `${r63 >= 0 ? "+" : ""}${r63.toFixed(1)}%`,
    signal: r63 > 5 ? "bullish" : r63 < -5 ? "bearish" : "neutral",
    note: "S&P 500 return over the last 63 trading days.",
  });
  signals.push({
    id: "vol",
    label: "Realized Volatility",
    value: `${vol.toFixed(1)}%`,
    signal: vol < 14 ? "bullish" : vol > 22 ? "bearish" : "neutral",
    note: `20-day annualized volatility (population SD) — ${vol < 14 ? "calm" : vol > 22 ? "elevated" : "normal"} conditions.`,
  });
} catch (e) {
  console.warn(`signals: price action failed (${e.message}), skipping`);
  ["trend", "momentum", "vol"].forEach((id, i) =>
    fail(id, ["Trend Regime", "Momentum (3-mo)", "Realized Volatility"][i])
  );
}

try {
  const d10 = await fredObs("DGS10", { start: "2025-01-01" });
  const d2 = await fredObs("DGS2", { start: "2025-01-01" });
  const spread = parseFloat(d10[d10.length - 1].value) - parseFloat(d2[d2.length - 1].value);
  signals.push({
    id: "curve",
    label: "Yield Curve (10Y–2Y)",
    value: `${spread >= 0 ? "+" : ""}${spread.toFixed(2)} pp`,
    signal: spread > 0.25 ? "bullish" : spread < -0.25 ? "bearish" : "neutral",
    note:
      spread > 0.25
        ? "Normal upward slope — no recession warning from the curve."
        : spread < -0.25
          ? "Inverted — historically a recession warning."
          : "Flat — watch for direction.",
  });
} catch (e) {
  console.warn("signals: yield curve failed, skipping");
  fail("curve", "Yield Curve (10Y–2Y)");
}

try {
  const cpi = await fredObs("CPIAUCSL", { units: "pc1", start: "2023-01-01" });
  const yoy = parseFloat(cpi[cpi.length - 1].value);
  signals.push({
    id: "inflation",
    label: "Inflation (CPI YoY)",
    value: `${yoy.toFixed(1)}%`,
    signal: yoy < 2.5 ? "bullish" : yoy > 3.5 ? "bearish" : "neutral",
    note: yoy < 2.5 ? "Near target — benign for stocks." : yoy > 3.5 ? "Hot — keeps the Fed hawkish." : "Above target but contained.",
  });
} catch (e) {
  console.warn("signals: inflation failed, skipping");
  fail("inflation", "Inflation (CPI YoY)");
}

try {
  const u = await fredObs("UNRATE", { start: "2023-01-01" });
  const cur = parseFloat(u[u.length - 1].value);
  const prev = parseFloat(u[u.length - 4].value);
  const chg = cur - prev;
  signals.push({
    id: "labor",
    label: "Unemployment",
    value: `${cur.toFixed(1)}%`,
    signal: chg >= 0.3 ? "bearish" : cur < 4.5 && chg <= 0 ? "bullish" : "neutral",
    note: `${chg > 0 ? "Up" : chg < 0 ? "Down" : "Flat"} ${Math.abs(chg).toFixed(1)}pp over 3 months — ${chg >= 0.3 ? "deteriorating" : "steady"}.`,
  });
} catch (e) {
  console.warn("signals: labor failed, skipping");
  fail("labor", "Unemployment");
}

const outDir = path.join(root, "src", "_data");
await mkdir(outDir, { recursive: true });

if (signals.every((s) => s.value === "—")) {
  console.warn("signals: all feeds failed, keeping existing signals.json");
  process.exit(0);
}

await writeFile(
  path.join(outDir, "signals.json"),
  JSON.stringify({ updated: new Date().toISOString(), signals }, null, 2)
);
console.log(`signals: wrote ${signals.length} gauges`);
