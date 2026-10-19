"""Compute the Base Rates database: historical probabilities for classic market
setups, from SPY daily history (Twelve Data, free tier).

Methodology:
- Universe: SPY daily closes, 2010-01-01 to present.
- Signals are clustered: after a signal fires, the next 63 trading days are
  skipped, so each episode counts once instead of once per day.
- Only signals with a full forward window of future data are counted.
- Output: src/_data/base_rates.json
"""
import json, os, subprocess, statistics, sys
from datetime import datetime, date

REPO = "/home/hatch/workspace/news-blog-prototype"

def fetch():
    key = os.environ.get("TWELVEDATA_API_KEY")
    if key:
        # CI/deploy path: call Twelve Data directly.
        import urllib.request, urllib.parse
        qs = urllib.parse.urlencode({"symbol": "SPY", "interval": "1day",
                                     "apikey": key, "start_date": "2010-01-01",
                                     "end_date": date.today().isoformat(),
                                     "outputsize": 5000})
        with urllib.request.urlopen(
                f"https://api.twelvedata.com/time_series?{qs}",
                timeout=120) as resp:
            vals = json.load(resp).get("values", [])
    else:
        out = subprocess.run(
            ["python3", "/home/hatch/workspace/custom-connectors/custom.twelvedata/bin/twelvedata.py",
             "series", "--symbol", "SPY", "--interval", "1day",
             "--start", "2010-01-01", "--end", date.today().isoformat(),
             "--outputsize", "5000"],
            capture_output=True, text=True, timeout=120)
        vals = json.loads(out.stdout).get("values", [])
    if not vals:
        print("Twelve Data fetch failed", file=sys.stderr)
        sys.exit(1)
    bars = sorted((datetime.strptime(v["datetime"], "%Y-%m-%d").date(), float(v["close"])) for v in vals)
    return bars

def fetch_safe():
    # In CI without a key and without the local helper, keep the committed
    # data instead of crashing the build.
    try:
        return fetch()
    except SystemExit:
        raise
    except Exception as e:
        print(f"base-rates: fetch failed ({e}), keeping existing data", file=sys.stderr)
        sys.exit(0)

def cluster(idxs, gap=63):
    out, last = [], -10**9
    for i in sorted(idxs):
        if i - last >= gap:
            out.append(i); last = i
    return out

def stats(idxs, horizon, closes):
    rs = []
    for i in idxs:
        j = i + horizon
        if j < len(closes):
            rs.append((closes[j][1] / closes[i][1] - 1) * 100)
    if not rs:
        return None
    return {"n": len(rs),
            "median_pct": round(statistics.median(rs), 1),
            "positive_pct": round(sum(1 for r in rs if r > 0) / len(rs) * 100)}

def sma(vals, i, n):
    w = vals[max(0, i - n + 1):i + 1]
    return sum(w) / len(w) if len(w) == n else None

def main():
    closes = fetch_safe()
    px = [c for _, c in closes]
    n = len(closes)
    print(f"{n} bars: {closes[0][0]} -> {closes[-1][0]}", flush=True)

    # trailing 252d highs
    hi252 = [max(px[max(0, i - 251):i + 1]) for i in range(n)]

    setups = []

    dd10 = cluster([i for i in range(252, n) if px[i] / hi252[i] - 1 <= -0.10])
    setups.append(("drawdown10", "Market falls 10% from its 52-week high",
                   "The classic correction. Buying fear has the best base rate in the database.",
                   dd10, 252))

    dd20 = cluster([i for i in range(252, n) if px[i] / hi252[i] - 1 <= -0.20])
    setups.append(("drawdown20", "Market falls 20% from its 52-week high",
                   "Bear-market territory. Deep drawdowns have historically been the best buying opportunities.",
                   dd20, 252))

    newhi = cluster([i for i in range(252, n) if px[i] >= hi252[i] and px[i] > px[i - 1]])
    setups.append(("newhigh", "New 52-week high",
                   "Strength begets strength more often than the 'buy low' crowd admits.",
                   newhi, 252))

    # monthly closes
    months = []
    for d, c in closes:
        m = d.strftime("%Y-%m")
        if not months or months[-1][0] != m:
            months.append([m, c])
        else:
            months[-1][1] = c
    down3 = []
    for k in range(3, len(months)):
        if all(months[k - j][1] < months[k - j - 1][1] for j in range(3)):
            m = months[k][0]
            bi = max(i for i, (d, _) in enumerate(closes) if d.strftime("%Y-%m") == m)
            down3.append(bi)
    setups.append(("down3mo", "Three straight down months",
                   "Rare and miserable — and historically a launchpad, not a trapdoor.",
                   cluster(down3), 126))

    bigdown = cluster([i for i in range(1, n) if px[i] / px[i - 1] - 1 <= -0.03])
    setups.append(("bigdown", "Single-day drop of 3% or more",
                   "Panic days tend to get bought within a quarter.",
                   bigdown, 63))

    bigup = cluster([i for i in range(1, n) if px[i] / px[i - 1] - 1 >= 0.03])
    setups.append(("bigup", "Single-day rally of 3% or more",
                   "Explosive up days usually mark panic bottoms, not tops.",
                   bigup, 63))

    below200, above200 = [], []
    for i in range(200, n):
        ma = sma(px, i, 200)
        prev_above = all(px[j] >= sma(px, j, 200) for j in range(i - 20, i) if sma(px, j, 200))
        prev_below = all(px[j] < sma(px, j, 200) for j in range(i - 20, i) if sma(px, j, 200))
        if ma and px[i] < ma and prev_above:
            below200.append(i)
        if ma and px[i] >= ma and prev_below:
            above200.append(i)
    setups.append(("below200", "Closes below the 200-day average (first break)",
                   "Counterintuitive: since 2010, losing the trend line has usually marked fear worth buying, not the start of something worse.",
                   cluster(below200), 126))
    setups.append(("above200", "Reclaims the 200-day average after 20+ days below",
                   "Getting the trend back has been a reliable all-clear.",
                   cluster(above200), 252))

    streak5 = cluster([i for i in range(5, n) if all(px[i - j] > px[i - j - 1] for j in range(5))])
    setups.append(("streak5up", "Five straight up days",
                   "Short-term overbought — the market usually digests, rarely collapses.",
                   streak5, 21))

    # January barometer: January down -> rest of year
    jan = []
    for k in range(1, len(months)):
        if months[k][0].endswith("-01") and months[k][1] < months[k - 1][1]:
            m = months[k][0]
            bi = max(i for i, (d, _) in enumerate(closes) if d.strftime("%Y-%m") == m)
            jan.append(bi)
    setups.append(("january", "January finishes down (January barometer)",
                   "The old saying has failed lately: since 2010, down Januarys were bought more often than not.",
                   jan, 231))

    results = []
    for key, title, takeaway, idxs, horizon in setups:
        s = stats(idxs, horizon, closes)
        if not s:
            continue
        yrs = horizon / 252
        label = f"{horizon}-day" if horizon < 200 else ("6-month" if horizon <= 130 else "12-month")
        results.append({"key": key, "title": title, "takeaway": takeaway,
                        "forward_window": label, **s})

    payload = {"computed_at": datetime.now().isoformat(timespec="seconds"),
               "data_from": str(closes[0][0]), "data_to": str(closes[-1][0]),
               "universe": "SPY daily closes (dividends excluded)",
               "method": ("Signals clustered: after a signal fires, the next 63 trading days "
                          "are skipped so each episode counts once. Only signals with a full "
                          "forward window are counted."),
               "setups": results}
    path = f"{REPO}/src/_data/base_rates.json"
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"wrote {path} with {len(results)} setups")
    for r in results:
        print(f"  {r['title']}: n={r['n']}, {r['forward_window']} median {r['median_pct']:+.1f}%, positive {r['positive_pct']:.0f}%")

if __name__ == "__main__":
    main()
