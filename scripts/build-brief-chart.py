#!/usr/bin/env python3
"""Build the data-brief chart: CPI YoY (FRED CPIAUCSL, pc1 units), last 5 years.
Terminal-styled PNG to match the site's Bloomberg feel. Prints summary stats
for whoever writes the brief text."""
import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
FRED = Path.home() / "workspace/custom-connectors/custom.fred/bin/fred.py"
OUT = ROOT / "src/assets/charts/cpi-yoy.png"

start = f"{date.today().year - 5}-{date.today().month:02d}-01"
fred_key = os.environ.get("FRED_API_KEY")
if fred_key:
    # CI/deploy path: call the FRED API directly.
    import urllib.request, urllib.parse
    qs = urllib.parse.urlencode({"series_id": "CPIAUCSL", "api_key": fred_key,
                                 "file_type": "json", "units": "pc1",
                                 "observation_start": start})
    with urllib.request.urlopen(
            f"https://api.stlouisfed.org/fred/series/observations?{qs}",
            timeout=60) as resp:
        data = json.load(resp)
else:
    proc = subprocess.run(
        ["python3", str(FRED), "observations", "--series", "CPIAUCSL",
         "--units", "pc1", "--start", start],
        capture_output=True, text=True, timeout=60,
    )
    data = json.loads(proc.stdout)
obs = [(datetime.strptime(o["date"], "%Y-%m-%d"), float(o["value"]))
       for o in data["observations"] if o["value"] != "."]
dates = [o[0] for o in obs]
vals = [o[1] for o in obs]

# --- summary stats for the brief writer ---
latest, latest_d = vals[-1], dates[-1].strftime("%b %Y")
def ago(n):
    return vals[-1 - n], dates[-1 - n].strftime("%b %Y")
v3, d3 = ago(3); v6, d6 = ago(6); v12, d12 = ago(12)
print(f"latest: {latest:.1f}% ({latest_d})")
print(f"3mo ago: {v3:.1f}% ({d3}) | 6mo ago: {v6:.1f}% ({d6}) | 1y ago: {v12:.1f}% ({d12})")
print(f"period max: {max(vals):.1f}% | min: {min(vals):.1f}%")

# --- chart ---
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["Arial", "Helvetica", "DejaVu Sans"]
fig, ax = plt.subplots(figsize=(10, 5.2), dpi=150)
fig.patch.set_facecolor("#0d0d0d")
ax.set_facecolor("#0d0d0d")

ax.plot(dates, vals, color="#ff5a00", linewidth=2.4, zorder=3)
ax.axhline(2.0, color="#0a7a3d", linestyle="--", linewidth=1.4, alpha=0.9)
ax.text(dates[-1], 2.12, "2% target", color="#0a7a3d", fontsize=10, ha="right", va="bottom")
ax.scatter([dates[-1]], [latest], color="#ff5a00", s=55, zorder=4, edgecolors="white", linewidths=1)
ax.text(dates[-1], latest + 0.28, f"{latest:.1f}%", color="white", fontsize=13,
        fontweight="bold", ha="right", va="bottom")

ax.set_title("CPI Inflation, Year-over-Year", color="white", fontsize=17,
             fontweight="bold", loc="left", pad=14)
ax.text(0, 1.06, "FRED CPIAUCSL · percent change from a year ago",
        transform=ax.transAxes, color="#9a9a9a", fontsize=11, va="bottom", ha="left")

ax.tick_params(colors="#9a9a9a", labelsize=10)
for spine in ax.spines.values():
    spine.set_visible(False)
ax.grid(axis="y", color="#2a2a2a", linewidth=0.7, linestyle="--", alpha=0.9)
ax.set_axisbelow(True)
ax.xaxis.set_major_locator(mdates.YearLocator())
ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
ax.set_xlim(dates[0], dates[-1])
ax.set_ylim(min(min(vals), 1.5) - 0.4, max(vals) + 0.9)

fig.tight_layout(pad=1.6)
OUT.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(OUT, facecolor=fig.get_facecolor())
print(f"wrote {OUT}")
