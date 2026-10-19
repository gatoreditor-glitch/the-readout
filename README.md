# The Readout — Free Prototype

A news-style blog with a Bloomberg-type look (black header bar, dense sans headlines, data-first layout), costing **$0/month** to run:

| Piece | Tool | Cost |
|---|---|---|
| Site generator | Eleventy (static HTML) | Free |
| Hosting | GitHub Pages or Cloudflare Pages | Free |
| Content editing | Markdown files (Decap CMS config included) | Free |
| News feeds | Scheduled GitHub Actions: BBC/NPR (news), Finnhub (finance) | Free |
| Markets strip | Build-time Finnhub quotes (ETF proxies for Dow/S&P/Nasdaq, plus gold & oil) | Free |
| System Signals dashboard | Scheduled job: 6 daily gauges from Massive price history + FRED macro data | Free |
| Data Brief charts | Build-time matplotlib charts from FRED, embedded in brief articles | Free |

## What's in the prototype

- **Homepage**: black header bar with wordmark, markets strip, section nav, lead story, a "Latest" live rail, and The Wire grouped by category.
- **Article pages** with bylines, dates, sections, and a "Sample" badge on placeholder content.
- **The Wire** (`/wire/`): news and finance headlines grouped by category, refreshed automatically on a schedule, each linking to the original publisher.
- **System Signals** (`/signals/`): six daily market gauges — trend regime, momentum, realized volatility, yield curve, inflation, unemployment — computed from Massive and FRED data. This is the site's unique content: readings no wire service publishes. Prototype thresholds are documented on the page; replace with your own system's rules.
- **Decap CMS** (`/admin/`): free git-based editing UI — set your repo in `src/admin/config.yml`.
- **3 sample articles** (evergreen, original, neutral newsroom voice) so the front page reads like a real site. Replace with your own reporting. Note: this prototype deliberately does not republish Money & Markets content.

## Deploy it free (about 20 minutes)

**Option A — GitHub Pages (easiest):**
1. Push this folder to a new GitHub repo.
2. Repo Settings → Pages → Source: **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The included workflow builds the site and refreshes the Market Wire every 6 hours.

**Option B — Cloudflare Pages:**
1. Push to GitHub, then Cloudflare Dashboard → Pages → Connect to Git.
2. Build command: `npm run build`, output directory: `_site`.

**Editing content:** edit the Markdown files in `src/articles/` directly in GitHub's web UI (no setup), or wire up the Decap CMS admin per `src/admin/config.yml`.

**Custom domain (optional, ~$12/yr):** add it in Pages settings; everything else stays free.

## Local development

```bash
npm install
npm run build   # refresh wire + build to _site/
npm run serve   # preview at http://localhost:8080
```

The wire fetcher (`scripts/fetch-wire.mjs`) pulls News (BBC, NPR) from public RSS feeds, and Finance headlines via the Finnhub connector on this machine. In CI without Finnhub credentials the finance section keeps its committed sample data and the build still succeeds.

## Before a public launch

- **API keys (for live data):** add four repo secrets (repo → Settings → Secrets and variables → Actions): `FINNHUB_API_KEY` (wire finance headlines + markets strip — from your Finnhub dashboard), `MASSIVE_API_KEY` (signals price action — your Polygon/Massive key), `FRED_API_KEY` (signals macro gauges + data-brief charts — from the FRED API key page), `TWELVEDATA_API_KEY` (base-rates database — from your Twelve Data dashboard). Without them the site builds on committed sample data; with them every feed is live. The scheduled workflow refreshes all feeds every 6 hours.
- **Feed licensing:** headlines link back to publishers (good practice), but check Finnhub's terms for redistribution before launching publicly.
- **Your content:** replace the sample articles with your own drafts.
- **Name/branding:** the masthead name lives in `src/_data/site.json`.
- **Custom domain:** the build uses a `pathPrefix` constant (`"/the-readout/"`) at the top of `eleventy.config.js` because GitHub Pages serves the site from a subpath. If you attach a custom domain later, change it to `"/"` and redeploy.
