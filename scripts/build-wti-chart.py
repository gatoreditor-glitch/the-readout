#!/usr/bin/env python3
"""Build the oil data-brief chart: WTI spot price (FRED DCOILWTICO), 2026 YTD.
Terminal-styled PNG to match the site's Bloomberg feel."""
import json
import os
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

ROOT = Path(__file__).resolve().parent.parent
FRED = Path.home() / "workspace/custom-connectors/custom.fred/bin/fred.py"
OUT = ROOT / "src/assets/charts/wti-ytd.png"

fred_key = os.environ.get("FRED_API_KEY")
if fred_key:
    qs = urllib.parse.urlencode({"series_id": "DCOILWTICO", "api_key": fred_key,
                                 "file_type": "json",
                                 "observation_start": "2026-01-01"})
    with urllib.request.urlopen(
            f"https://api.stlouisfed.org/fred/series/observations?{qs}",
            timeout=60) as resp:
        data = json.load(resp)
else:
    proc = subprocess.run(
        ["python3", str(FRED), "observations", "--series", "DCOILWTICO",
         "--start", "2026-01-01"],
        capture_output=True, text=True, timeout=60,
    )
    data = json.loads(proc.stdout)
obs = [(datetime.strptime(o["date"], "%Y-%m-%d"), float(o["value"]))
       for o in data["observations"] if o["value"] != "."]
dates = [o[0] for o in obs]
vals = [o[1] for o in obs]
latest, latest_d = vals[-1], dates[-1].strftime("%b %d, %Y")
print(f"latest: ${latest:.2f} ({latest_d}) | max: ${max(vals):.2f} | min: ${min(vals):.2f}")
print(f"YTD change: {(latest/vals[0]-1)*100:.1f}%")

plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["Arial", "Helvetica", "DejaVu Sans"]
fig, ax = plt.subplots(figsize=(10, 5.2), dpi=150)
fig.patch.set_facecolor("#0d0d0d")
ax.set_facecolor("#0d0d0d")

ax.plot(dates, vals, color="#ff5a00", linewidth=2.4, zorder=3)
ax.axhline(100, color="#4a4a4a", linestyle="--", linewidth=1.4, alpha=0.9)
ax.text(dates[-1], 101.2, "$100", color="#9a9a9a", fontsize=10, ha="right", va="bottom")
ax.scatter([dates[-1]], [latest], color="#ff5a00", s=55, zorder=4,
           edgecolors="white", linewidths=1)
ax.text(dates[-1], latest + 4, f"${latest:.0f}", color="white", fontsize=13,
        fontweight="bold", ha="right", va="bottom")

ax.set_title("WTI Crude Oil, 2026", color="white", fontsize=17,
             fontweight="bold", loc="left", pad=14)
ax.text(0, 1.06, "FRED DCOILWTICO · dollars per barrel, daily spot",
        transform=ax.transAxes, color="#9a9a9a", fontsize=11, va="bottom", ha="left")

ax.tick_params(colors="#9a9a9a", labelsize=10)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.grid(axis="y", color="#2a2a2a", linewidth=0.7, linestyle="--", alpha=0.9)
ax.set_axisbelow(True)
ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
ax.xaxis.set_major_formatter(mdates.DateFormatter("%b"))
ax.set_xlim(dates[0], dates[-1])

fig.tight_layout(pad=1.6)
OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, facecolor=fig.get_facecolor())
print(f"wrote {OUT}")
