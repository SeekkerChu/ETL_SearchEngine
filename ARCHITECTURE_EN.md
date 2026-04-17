# Search Engine Analytics System — Architecture Document

## 1. System Overview

This project is a **search engine result scraping and analysis platform** consisting of two independent processes:

```
User Browser
    │  HTTP (port 5173)
    ▼
React Frontend (Vite + MUI)       ← SearchEngine_frontend/
    │  REST API calls (HTTP/JSON, port 8000)
    ▼
Django Backend (Python)            ← SearchEngine_backend/
    │  ORM / Raw SQL
    ▼
MySQL Database (MY_CUSTOM_BOT)
```

The frontend and backend are **fully decoupled** and communicate exclusively via HTTP REST API. The frontend has no knowledge of the database; the backend has no knowledge of the UI.

---

## 2. How Frontend and Backend Connect

### Connection Mechanism

The frontend uses the **axios** library to send HTTP GET requests to the backend:

```typescript
// src/api/api.tsx
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/'
})
```

This is the only network configuration in the entire frontend. Every component imports this `api` singleton and calls `api.get("path", { params: {...} })`.

### Why CORS Is Needed

The frontend runs on `localhost:5173` and the backend on `localhost:8000`. **Different ports** trigger the browser's same-origin policy, which blocks cross-origin requests by default.

The backend resolves this with `django-cors-headers`:

```python
# settings.py
INSTALLED_APPS = [..., 'corsheaders']
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware', ...]
CORS_ALLOW_ALL_ORIGINS = True   # development only — use a whitelist in production
```

Without this configuration, the browser rejects every request from the frontend.

---

## 3. API Reference

| Frontend Call | Django URL | View Function | Purpose |
|--------------|-----------|---------------|---------|
| `api.get("searchFilter/", {params:{keyword,url_size}})` | `searchFilter/` | `views.index` | **Live scrape** search engine results and persist to DB |
| `api.get("searchFilter/get_list_of_links_for_keyword", {params:{keyword}})` | `searchFilter/get_list_of_links_for_keyword` | `views.get_list_of_links_for_keyword` | **Query** stored results from DB |
| `api.get("searchFilter/get_list_of_ads_none_ads", {params:{keyword}})` | `searchFilter/get_list_of_ads_none_ads` | `views.get_list_of_ads_none_ads` | Query **ad vs organic statistics** |
| `api.get("searchFilter/get_html_data")` | `searchFilter/get_html_data` | `views.get_html_data` | **Deep scrape** stored URLs, compute keyword frequency |

---

## 4. Frontend Architecture

### File Structure

```
src/
├── api/
│   └── api.tsx              # axios singleton — central baseURL config
├── components/
│   ├── Header.tsx           # Top navigation bar (routing + Sync button)
│   ├── GetUrls.tsx          # "GET URLS" page
│   ├── ScrapeUrls.tsx       # "SCRAPE URLS" page
│   └── organization/
│       ├── ShowSearches.tsx     # GET URLS result display (merged + deduplicated)
│       └── TablePopulation.tsx  # SCRAPE URLS result display (table)
├── App.tsx                  # Route definitions
└── main.tsx                 # React entry point — mounts to #root
```

### File Responsibilities

#### `main.tsx`
The **application entry point**. Wraps `<App>` in `<BrowserRouter>` to enable routing. Without this file, hooks like `useNavigate` and components like `<Route>` cannot function.

#### `App.tsx`
Defines **page routes**:
- `/` → `<GetUrls>` (query stored data)
- `/ScrapeUrls` → `<ScrapeUrls>` (live scraping)

`<Header>` is rendered outside all routes because the navigation bar is global.

#### `api/api.tsx`
A singleton axios instance. **Why a separate file?** If the backend address changes (e.g., deployed to a server), only this one file needs updating instead of every component.

#### `Header.tsx`
- Uses `useLocation()` to read the current path and highlight the active button — avoids the stale-state bug that occurs when maintaining a separate `active` state variable
- The "Update Keyword Data" button calls the `get_html_data` API directly, triggering a deep scrape of all stored URLs

#### `GetUrls.tsx` — Query Flow
```
User types keyword → clicks Search
    ↓
Two requests fired in parallel:
    api.get("get_list_of_links_for_keyword")  → URL list → passed to ShowSearches
    api.get("get_list_of_ads_none_ads")       → ad stats  → displayed at top
```

This is the **read-only** flow — no scraping, fast response.

#### `ScrapeUrls.tsx` — Scrape Flow
```
User types keyword + size → clicks Scrape
    ↓
api.get("searchFilter/", {keyword, url_size})
    ↓ (waits for backend to scrape — can take tens of seconds)
Returns live-scraped URL list → passed to TablePopulation
```

This is the **live scrape** flow. The backend launches a headless Chrome browser, so it takes longer.

#### `ShowSearches.tsx`
- Receives the URL list from all 4 search engines
- **Deduplicates by domain** — same website with slight URL variation is merged into one entry
- For each domain, keeps the entry with the highest `count_of_appearance`
- Records **all source engines** that found the domain
- Sorts by keyword frequency (descending) and paginates (10 per page)
- Each card shows: coloured engine dots + "Found by N engines" badge

> **Bug #1 — MUI v9 system prop incompatibility**
>
> **Symptom**: After upgrading to MUI v9, components like `<Box display="flex">`, `<Box textAlign="center">`, and `<Stack alignItems="center">` produce type errors and lose their styles.
>
> **Root Cause**: MUI v9 removed all system shorthand props from components. Props like `display`, `textAlign`, `py`, `mt`, `mb`, and `alignItems` must be placed inside `sx={{ ... }}`.
>
> **Fix**:
> ```tsx
> // ❌ Before (MUI v8 and earlier)
> <Box display="flex" justifyContent="center" mt={4}>
> <Stack alignItems="center" spacing={2}>
>
> // ✅ After
> <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
> <Stack spacing={2} sx={{ alignItems: 'center' }}>
> ```
> Files affected: `ShowSearches.tsx`, `ScrapeUrls.tsx`

#### `TablePopulation.tsx`
Displays raw scrape results in a table (includes ad-flagged entries for transparency).

---

## 5. Backend Architecture

### File Structure

```
SearchEngine_backend/
├── manage.py                    # Django management command entry point
├── searchEngineFilter/          # Django project configuration package
│   ├── settings.py              # DB, middleware, CORS, and global config
│   ├── urls.py                  # Root URL router (forwards searchFilter/ to the app)
│   ├── wsgi.py                  # Production deployment entry (uWSGI/Gunicorn)
│   └── asgi.py                  # Async deployment entry (Uvicorn)
└── searchFilter/                # Core business app
    ├── models.py                # Database table schema definitions
    ├── views.py                 # API endpoints (parse request → call logic → return JSON)
    ├── urls.py                  # App-level URL routing table
    ├── admin.py                 # Django Admin registration
    ├── DataScraper/             # Scraping layer
    │   ├── RequestHandler.py    # Low-level HTTP requests (Selenium + requests)
    │   ├── ScraperStrategy.py   # Per-engine parsing strategies
    │   ├── SearchUrl.py         # Pagination logic + result deduplication
    │   └── DataScraper.py       # Facade — coordinates the three classes above
    └── DataOperation/           # Database read/write layer
        ├── SearchQuery.py       # Write operations (persist results, HTML data)
        └── SQLData.py           # Read operations (all query SQL)
```

### File Responsibilities

#### `models.py` — Database Schema

Five tables with the following relationships:

```
SearchEngine          SearchTerm
  (google/bing...)      (city college of ny...)
       │                      │
       └──────┬───────────────┘
              ▼
          SearchRun            ← One record per scrape session (engine × keyword × timestamp)
              │
              ▼
         SearchResult          ← One record per URL (title, link, ad flag)
              │
              ▼ (OneToOne)
        ScrapedPageData        ← Full page HTML + keyword frequency after deep scrape
```

**Why `SearchRun`?** The same keyword may be scraped multiple times at different points in time. `SearchRun` records the timestamp of each session, so queries can filter to the latest run per engine and avoid showing stale data.

#### `settings.py`
- MySQL connection config (`MY_CUSTOM_BOT` database, localhost:3306)
- Registers `corsheaders` middleware to allow cross-origin requests
- `CORS_ALLOW_ALL_ORIGINS = True` (switch to an explicit whitelist for production)

#### `urls.py` (two layers)
The root router (`searchEngineFilter/urls.py`) forwards all `searchFilter/` prefixed requests to the app's `searchFilter/urls.py`, which dispatches to the appropriate `views` function.

#### `views.py`
Each function maps to one API endpoint with a single responsibility:
1. Read parameters from `request.GET`
2. Delegate to the business layer (`DataScraper` or `GetSQLData`)
3. Wrap the result in a `JsonResponse`

**No SQL or scraping logic lives here** — only parameter validation and response packaging.

---

## 6. Scraping Layer — Strategy Design Pattern

### Why the Strategy Pattern?

The four search engines (Google / Bing / DuckDuckGo / Yahoo) have different URL formats and different HTML structures, but the workflow is identical: **build URL → fetch page → parse results**.

The Strategy pattern isolates the **variable parts** (URL format and HTML parsing per engine) into separate strategy classes, while the **invariant parts** (pagination, deduplication, HTTP requests) live in `SearchUrl` and are reused.

```python
# Abstract interface
class ScraperStrategy(ABC):
    def build_search_url(self, keyword) -> str: ...
    def parse_results(self, html) -> list: ...

# Four concrete implementations
class GoogleSearchStrategy(ScraperStrategy): ...
class BingSearchStrategy(ScraperStrategy): ...
class DuckDuckGoSearchStrategy(ScraperStrategy): ...
class YahooSearchStrategy(ScraperStrategy): ...
```

`SearchUrl` is agnostic to which engine is used — it only calls `strategy.build_search_url()` and `strategy.parse_results()`. Adding a new engine requires only a new subclass with no changes elsewhere.

> **Bug #2 — Google returns 0 results**
>
> **Symptom**: After scraping, the Google tab shows no results. Server logs show `Strategy 1 (div.g): 0 cards`.
>
> **Root Cause**: The original code used only the `div.g` CSS selector. Google frequently updates its page structure; when `div.g` no longer matches, there is no fallback.
>
> **Fix**: Added a 4-level fallback strategy in `GoogleSearchStrategy.parse_results()`, tried in order:
> 1. `div.g` (classic selector)
> 2. `#rso` container children (organic results container)
> 3. Full-page scan for all `<a>` tags containing `<h3>` (most generic)
> 4. Divs with the `data-hveid` attribute
>
> Additionally, the full HTML is now dumped to `google_results.html` after each fetch, and a Selenium screenshot is saved to the `screenshots/` directory for debugging. All screenshot paths are printed to the Django log once all engines finish.
>
> Files affected: `ScraperStrategy.py`, `RequestHandler.py`, `SearchUrl.py`, `DataScraper.py`

### `RequestHandler.py` — Two Fetch Strategies

| Method | Technology | Used For | Reason |
|--------|-----------|----------|--------|
| `get(url, screenshot_path)` | Selenium + ChromeDriver (headless browser) | Search engine result pages | Search engines detect bots; a real browser with JS rendering is required |
| `get_with_fallback(url)` | `requests` library (plain HTTP) | Individual target page content | Regular pages don't need JS; `requests` is faster and lighter |

Selenium launches an invisible Chrome window, fully renders the page, and returns the HTML — bypassing search engine bot-detection. When `screenshot_path` is provided, `driver.save_screenshot()` is called before returning.

### Full Scrape Data Flow

```
Frontend ScrapeUrls → GET searchFilter/?keyword=xxx&url_size=10
                                │
                        views.index()
                                │
                        DataScraper.get_urls()
                                │
                ┌───────────────┴───────────────┐
                │  Loop over 4 search engines    │
                └───────────────┬───────────────┘
                        SearchUrl.search(screenshots=[])
                                │
                        RequestHandler.get(url, screenshot_path)  ← Selenium (Google screenshots)
                                │
                        Strategy.parse_results()   ← BeautifulSoup multi-selector parsing
                                │
                       Identify ads vs organic
                                │
                      SearchQueryAdd.add_search_results()
                                │                  ← One SearchRun per engine; write to MySQL
                        Return JsonResponse
                                │
                Frontend renders TablePopulation
                (Print screenshot paths after all engines complete)
```

### Deep Scrape Data Flow (Update Keyword Data)

```
Frontend Header → GET searchFilter/get_html_data
                            │
                DataScraper.get_html_from_urls()
                            │
                Query: all SearchResults where html_data is empty
                            │
                For each URL: RequestHandler.get_with_fallback()
                            │
                SearchQueryAdd.add_url_html_data()
                            │  BeautifulSoup extracts plain text
                            │  Lowercase + count keyword tokens
                            │  Update ScrapedPageData.term_frequency
                            ↓
                Frontend GetUrls shows real keyword frequencies
```

---

## 7. Database Write Layer (`SearchQuery.py`)

### Normal Write Flow

```
add_search_results(keyword, [[google_results], [bing_results], ...])
    │
    ├── get_or_create SearchTerm
    │
    └── For each engine result list:
            ├── get_or_create SearchEngine
            ├── create SearchRun  (ONE per engine per session)
            └── For each result:
                    ├── create SearchResult      (sanitized strings)
                    └── get_or_create ScrapedPageData  (preliminary freq)
```

> **Bug #3 — Only 1 result returned per engine after scraping**
>
> **Symptom**: Server logs show "113 total results" but GET URLS only displays 1 result per engine. `searchfilter_scrapedpagedata` also contains very few rows.
>
> **Root Cause**: The original `add_search_results` called `add_search_run()` for **every individual result**, creating a new `SearchRun` record each time. Because `run_timestamp` uses `auto_now_add=True`, each run gets a slightly different timestamp. The read SQL in `SQLData.py` uses `MAX(run_timestamp)` to locate the latest run — this matches only the very last run created, so only the result associated with that final run is returned.
>
> **Fix**: Move `add_search_run()` outside the per-result loop. **Each engine list creates exactly one `SearchRun`**, and all results for that engine share the same run.
>
> ```python
> # ❌ Before (one run per result)
> for item in all_results:
>     run_obj = add_search_run(search_term_obj, engine_obj)   # creates new run each time
>     add_search_result(item, run_obj)
>
> # ✅ After (one run per engine list)
> run_obj = add_search_run(search_term_obj, engine_obj)        # created once
> for item in engine_results:
>     add_search_result(item, run_obj)
> ```
> File affected: `SearchQuery.py`

> **Bug #4 — MySQL charset error causes mass write failure and transaction cascade**
>
> **Symptom**:
> ```
> Error saving result: (1366, "Incorrect string value: '\xF3\xB1\x9E\xB4...' for column 'description'")
> Error saving result: An error occurred in the current transaction. You can't execute queries...
> ```
> After the first failure, all subsequent writes report "can't execute queries".
>
> **Root Cause**:
> 1. Google snippets occasionally contain 4-byte Unicode characters (e.g. emoji, code point ≥ U+10000). MySQL's `utf8` charset supports only 3-byte UTF-8, so these characters are rejected.
> 2. The outer `@transaction.atomic` decorator marks the entire transaction as broken on any `create()` failure. All subsequent SQL operations within that transaction are then refused, causing a cascade of failures.
>
> **Fix**:
> 1. Added `_sanitize()` to strip characters with `ord(c) >= 0x10000` before writing `url`, `title`, and `description`.
> 2. Wrapped each result's `create()` in its own `with transaction.atomic()` (savepoint). A failure in one row rolls back only that row, leaving the outer transaction intact.
>
> ```python
> @staticmethod
> def _sanitize(text: str) -> str:
>     return "".join(c for c in str(text) if ord(c) < 0x10000)
>
> # Per-result savepoint
> try:
>     with transaction.atomic():
>         add_search_result(item, run_obj)
> except Exception as e:
>     print(f"Skipped: {e}")
> ```
> File affected: `SearchQuery.py`

---

## 8. Keyword Frequency (`get_count`)

`ScrapedPageData.term_frequency` records how many times the keyword's meaningful tokens appear in the target page — used to rank result relevance.

### When Frequency Is Calculated

| Stage | Trigger | Data Source | Accuracy |
|-------|---------|-------------|----------|
| Initial Scrape | `add_search_result()` | title + description snippet | Low (quick preview) |
| Update Keyword Data | `add_url_html_data()` | Full page HTML | High (real frequency) |

After the initial scrape, the frontend already shows non-zero frequencies. Clicking "Update Keyword Data" overwrites them with values computed from the complete page HTML.

### How It Works

```python
# Stop words excluded from keyword tokenisation
_STOP_WORDS = {"a", "an", "the", "and", "or", "of", "in", "on", "at", ...}

def _extract_keywords(phrase: str) -> list:
    tokens = phrase.lower().split()
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]
    # e.g. "city college of new york" → ["city", "college", "new", "york"]

def get_count(content: str, keyword: str) -> int:
    # 1. Extract visible plain text from HTML (strips script/style/head/tags)
    if "<" in content:
        soup = BeautifulSoup(content, "html.parser")
        for tag in soup(["script", "style", "noscript", "head"]):
            tag.decompose()
        text = soup.get_text(separator=" ")
    else:
        text = content
    text_lower = text.lower()

    # 2. Tokenise keyword, drop stop words
    keywords = _extract_keywords(keyword)

    # 3. Count each token independently with word-boundary regex, accumulate
    total = 0
    for token in keywords:
        pattern = rf'\b{re.escape(token)}\b'
        total += len(re.findall(pattern, text_lower))
    return total
```

**Example**: keyword = `"city college of new york"`, page contains "The City College of New York"
- tokens = `["city", "college", "new", "york"]` ("of" filtered out)
- Each token appears once → freq = **4**

> **Bug #5 — Keyword Freq always 0 or unrealistically low**
>
> **Symptom**: All results on the GET URLS page show `Keyword Freq: 0`, or a value of 1 even for highly relevant pages.
>
> **Root Cause (three issues)**:
> 1. The original `get_count` ran the regex directly against raw HTML (with tags). Keywords split across HTML tags (e.g. `<em>city</em> college`) would not be matched.
> 2. The full phrase `"city college of new york"` was matched as a single unit. Pages rarely contain the exact phrase verbatim, giving near-zero counts.
> 3. After an initial scrape, the `ScrapedPageData` table has no entries (they are only created by "Update Keyword Data"), so `COALESCE(spd.term_frequency, 0)` always returns 0.
>
> **Fix**:
> 1. `get_count` now uses BeautifulSoup to extract clean visible text before matching.
> 2. Introduced `_extract_keywords()` to filter stop words and split the phrase into individual tokens, each counted separately and summed.
> 3. `add_search_result` now creates a preliminary `ScrapedPageData` entry immediately after saving each `SearchResult`, so the frontend shows non-zero frequencies right after scraping without waiting for a full deep scrape.
>
> File affected: `SearchQuery.py`

---

## 9. Database Read Strategy (`SQLData.py`)

All queries use **CTEs (Common Table Expressions)** with the `WITH` syntax. The core pattern is:

```sql
WITH TargetTerm AS (
    -- Resolve the search keyword to its primary key
    SELECT id FROM searchfilter_searchterm WHERE LOWER(search_term) = %s
),
LatestRuns AS (
    -- Find the most recent run ID per engine for that keyword
    SELECT r.id FROM searchfilter_searchrun r
    INNER JOIN (
        SELECT search_engine_id, MAX(run_timestamp) as max_ts
        FROM searchfilter_searchrun
        WHERE search_term_id IN (SELECT id FROM TargetTerm)
        GROUP BY search_engine_id
    ) max_r ON r.search_engine_id = max_r.search_engine_id
           AND r.run_timestamp    = max_r.max_ts
)
-- Filter results to only those from the latest runs
SELECT ... FROM searchfilter_searchresult
WHERE run_id IN (SELECT id FROM LatestRuns)
```

**Why Raw SQL instead of Django ORM?** Multi-level joins with nested subqueries are easier to read and reason about in raw SQL. Django's ORM can generate inefficient SQL for complex nested queries, and the CTE syntax is not natively supported by the ORM queryset API.

---

## 10. Startup Sequence

```bash
# 1. Start the backend (Django)
cd SearchEngine_backend
python manage.py runserver          # listens on localhost:8000

# 2. Start the frontend (Vite)
cd SearchEngine_frontend
npm run dev                         # listens on localhost:5173

# 3. Open browser at http://localhost:5173
```

Both processes must be running simultaneously. If either is missing, the other cannot function correctly.

---

## 11. Tech Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend framework | React | 19 | Component-based UI |
| Frontend build tool | Vite | 6 | Dev server + bundling |
| UI component library | MUI (Material UI) | 9 | Pre-built components + theming |
| Client-side routing | React Router | 7 | SPA routing |
| HTTP client | axios | 1.9 | REST requests to backend |
| Backend framework | Django | 3.2 | MVC + ORM + Admin |
| CORS support | django-cors-headers | — | Allow cross-origin frontend requests |
| HTML parsing | BeautifulSoup4 | — | Parse search engine HTML + extract plain text |
| Browser automation | Selenium + ChromeDriver | — | JS rendering, bot-detection bypass, screenshots |
| Database | MySQL | — | Persistent storage for all search results |
| Database driver | mysqlclient | — | Python → MySQL connection |

---

## 12. Bug Index

| # | File | Symptom | Root Cause |
|---|------|---------|------------|
| Bug #1 | `ShowSearches.tsx` | MUI component styles lost after upgrade | MUI v9 removed system props — all styling must go in `sx={}` |
| Bug #2 | `ScraperStrategy.py` | Google returns 0 results | `div.g` selector became invalid; no fallback existed |
| Bug #3 | `SearchQuery.py` | Only 1 result returned per engine | A new `SearchRun` was created per result; `MAX(run_timestamp)` matched only the last one |
| Bug #4 | `SearchQuery.py` | Mass write failures + cascade transaction crash | 4-byte Unicode chars exceed MySQL `utf8` limit; broken atomic block rejected all subsequent queries |
| Bug #5 | `SearchQuery.py` | Keyword Freq always 0 or unrealistically low | Raw HTML regex + exact phrase matching + no stop-word filtering + no preliminary freq on initial scrape |
