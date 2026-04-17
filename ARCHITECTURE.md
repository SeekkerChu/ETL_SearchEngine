# 搜索引擎分析系统 — 完整架构文档

## 一、系统总览

本项目是一个**搜索引擎结果爬取与分析平台**，由两个独立进程组成：

```
用户浏览器
    │  HTTP请求 (port 5173)
    ▼
React 前端 (Vite + MUI)          ← SearchEngine_frontend/
    │  REST API 请求 (HTTP/JSON, port 8000)
    ▼
Django 后端 (Python)              ← SearchEngine_backend/
    │  ORM / Raw SQL
    ▼
MySQL 数据库 (MY_CUSTOM_BOT)
```

前后端**完全分离**，通过 HTTP REST API 通信。前端不知道数据库的存在，后端不知道前端的 UI 细节。

---

## 二、前后端如何连接

### 连接机制

前端使用 **axios** 库向后端发送 HTTP GET 请求：

```
// src/api/api.tsx
const api = axios.create({
    baseURL: 'http://127.0.0.1:8000/'
})
```

这是整个前端唯一的网络配置。所有组件都 import 这个 `api` 实例，然后调用 `api.get("路径", { params: {...} })`。

### 为什么需要 CORS

前端运行在 `localhost:5173`，后端运行在 `localhost:8000`，**端口不同**就触发浏览器同源策略限制。

后端通过 `django-cors-headers` 解决：

```python
# settings.py
INSTALLED_APPS = [..., 'corsheaders']
MIDDLEWARE = ['corsheaders.middleware.CorsMiddleware', ...]
CORS_ALLOW_ALL_ORIGINS = True   ← 开发模式下允许所有来源
```

没有这个配置，浏览器会直接拒绝前端的每一个请求。

---

## 三、API 接口全表

| 前端调用 | Django URL | 视图函数 | 功能 |
|---------|------------|---------|------|
| `api.get("searchFilter/", {params:{keyword,url_size}})` | `searchFilter/` | `views.index` | **实时爬取**搜索引擎结果并存库 |
| `api.get("searchFilter/get_list_of_links_for_keyword", {params:{keyword}})` | `searchFilter/get_list_of_links_for_keyword` | `views.get_list_of_links_for_keyword` | 从数据库**查询**已存结果 |
| `api.get("searchFilter/get_list_of_ads_none_ads", {params:{keyword}})` | `searchFilter/get_list_of_ads_none_ads` | `views.get_list_of_ads_none_ads` | 查询广告/自然结果**统计** |
| `api.get("searchFilter/get_html_data")` | `searchFilter/get_html_data` | `views.get_html_data` | 对已存URL**深度爬取**页面内容，计算关键词频率 |

---

## 四、前端架构详解

### 文件结构

```
src/
├── api/
│   └── api.tsx              # axios 实例，统一 baseURL 配置
├── components/
│   ├── Header.tsx           # 顶部导航栏（路由切换 + Sync按钮）
│   ├── GetUrls.tsx          # "GET URLS" 页面
│   ├── ScrapeUrls.tsx       # "SCRAPE URLS" 页面
│   └── organization/
│       ├── ShowSearches.tsx     # GET URLS 的结果展示（分Tab+分页）
│       └── TablePopulation.tsx  # SCRAPE URLS 的结果展示（表格）
├── App.tsx                  # 路由定义
└── main.tsx                 # React 入口，挂载到 #root
```

### 每个文件的职责

#### `main.tsx`
React 应用的**启动点**。把 `<App>` 包在 `<BrowserRouter>` 里，让整个应用有路由能力。没有这个文件，`useNavigate`/`<Route>` 等路由 Hook 无法工作。

#### `App.tsx`
定义**页面路由**：
- `/` → `<GetUrls>`（查询已存数据）
- `/ScrapeUrls` → `<ScrapeUrls>`（实时爬取）

`<Header>` 始终渲染（在所有路由之外），因为导航栏是全局的。

#### `api/api.tsx`
单例 axios 实例。**为什么要单独抽出一个文件？** 如果后端地址变了（比如部署到服务器），只需改这一个文件，而不需要在每个组件里逐一修改 URL。

#### `Header.tsx`
- 用 `useLocation()` 读取当前路径，决定哪个按钮高亮（而不是维护一个 `active` state，避免路由和状态不同步）
- "Update Keyword Data" 按钮直接调用后端 `get_html_data` API，触发对所有已存URL的深度爬取

#### `GetUrls.tsx` — 查询流程
```
用户输入关键词 → 点击 Search
    ↓
并发发出两个请求：
    api.get("get_list_of_links_for_keyword")  → 拿URL列表 → 传给 ShowSearches
    api.get("get_list_of_ads_none_ads")       → 拿广告统计 → 展示在页面顶部
```

这是**读数据库**的流程，不做爬取，速度快。

#### `ScrapeUrls.tsx` — 爬取流程
```
用户输入关键词 + 数量 → 点击 Scrape
    ↓
api.get("searchFilter/", {keyword, url_size})
    ↓ （等待后端爬取，可能需要数十秒）
返回实时爬取的URL列表 → 传给 TablePopulation 展示
```

这是**实时爬取**的流程，后端会启动 Chrome 浏览器去抓页面，所以时间较长。

#### `ShowSearches.tsx`
- 接收 URL 列表，按 `searchEngine` 字段**分组**成 Tab
- 过滤 `ad_promo=true` 的广告结果
- 按 `count_of_appearance`（关键词在页面中出现的频率）排序
- 分页展示（每页10条）

> **Bug #1 — MUI v9 系统 prop 不兼容**
>
> **现象**：升级到 MUI v9 后，`<Box display="flex">` / `<Box textAlign="center">` / `<Stack alignItems="center">` 等组件报类型错误，页面样式失效。
>
> **根本原因**：MUI v9 移除了所有组件上的系统简写 prop（system props）。`display`、`textAlign`、`py`、`mt`、`mb`、`alignItems` 等必须全部写进 `sx={{ ... }}` 才能生效。
>
> **修复**：
> ```tsx
> // ❌ MUI v9 之前
> <Box display="flex" justifyContent="center" mt={4}>
> <Stack alignItems="center" spacing={2}>
>
> // ✅ 修复后
> <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
> <Stack spacing={2} sx={{ alignItems: 'center' }}>
> ```
> 涉及文件：`ShowSearches.tsx`、`ScrapeUrls.tsx`

#### `TablePopulation.tsx`
展示 Scrape 结果的表格组件（展示原始爬取数据，包含广告标记）。

---

## 五、后端架构详解

### 文件结构

```
SearchEngine_backend/
├── manage.py                    # Django 管理命令入口
├── searchEngineFilter/          # Django 项目配置包
│   ├── settings.py              # 数据库、中间件、CORS 等全局配置
│   ├── urls.py                  # 根URL路由（把 searchFilter/ 转发给 App）
│   ├── wsgi.py                  # 生产部署入口（uWSGI/Gunicorn）
│   └── asgi.py                  # 异步部署入口（Uvicorn）
└── searchFilter/                # 核心业务 App
    ├── models.py                # 数据库表结构定义
    ├── views.py                 # API 端点（接收请求、调用业务逻辑、返回JSON）
    ├── urls.py                  # App 内部路由表
    ├── admin.py                 # Django Admin 后台注册
    ├── DataScraper/             # 爬取层
    │   ├── RequestHandler.py    # 底层 HTTP 请求（Selenium + requests）
    │   ├── ScraperStrategy.py   # 每个搜索引擎的解析策略
    │   ├── SearchUrl.py         # 翻页逻辑 + 结果去重
    │   └── DataScraper.py       # 对外门面（协调上面三个类）
    └── DataOperation/           # 数据库读写层
        ├── SearchQuery.py       # 写操作（存搜索结果、存HTML数据）
        └── SQLData.py           # 读操作（各种查询SQL）
```

### 每个文件的职责

#### `models.py` — 数据库表结构

共 5 张表，关系如下：

```
SearchEngine          SearchTerm
  (google/bing...)      (city college of ny...)
       │                      │
       └──────┬───────────────┘
              ▼
          SearchRun            ← 每次"搜索动作"记录一条（引擎×关键词×时间）
              │
              ▼
         SearchResult          ← 每条URL结果（标题、链接、是否广告）
              │
              ▼ (OneToOne)
        ScrapedPageData        ← 深度爬取后存的HTML + 关键词频率
```

**为什么要 SearchRun？** 同一个关键词可能被搜索多次（不同时间），SearchRun 记录每次搜索的时间戳，查询时只取每个引擎的最新一次（latest run），避免展示过时数据。

#### `settings.py`
- 配置 MySQL 数据库连接（`MY_CUSTOM_BOT` 数据库，localhost:3306）
- 注册 `corsheaders` 中间件，开启跨域
- `CORS_ALLOW_ALL_ORIGINS = True`（生产环境应改为白名单）

#### `urls.py`（两层）
根路由（`searchEngineFilter/urls.py`）把所有 `searchFilter/` 前缀的请求转发给 App 内部的 `searchFilter/urls.py`，App 再按具体路径分发给对应的 `views` 函数。

#### `views.py`
每个函数对应一个 API 端点，职责单一：
1. 从 `request.GET` 读取参数
2. 调用业务层（DataScraper 或 GetSQLData）
3. 把结果包装成 `JsonResponse` 返回

**不含任何 SQL 或爬取逻辑**，只做参数校验和结果打包。

---

## 六、爬取层详解（Strategy 设计模式）

### 为什么用 Strategy 模式？

四个搜索引擎（Google/Bing/DuckDuckGo/Yahoo）的搜索URL格式不同、HTML结构不同，但流程一样：**构建URL → 抓页面 → 解析结果**。

Strategy 模式把"变化的部分"（每个引擎的URL格式和HTML解析）抽成独立的策略类，把"不变的部分"（翻页、去重、请求）放在 `SearchUrl` 里复用。

```python
# 抽象接口
class ScraperStrategy(ABC):
    def build_search_url(self, keyword) -> str: ...
    def parse_results(self, html) -> list: ...

# 四个具体实现
class GoogleSearchStrategy(ScraperStrategy): ...
class BingSearchStrategy(ScraperStrategy): ...
class DuckDuckGoSearchStrategy(ScraperStrategy): ...
class YahooSearchStrategy(ScraperStrategy): ...
```

`SearchUrl` 不关心用的是哪个引擎，只调用 `strategy.build_search_url()` 和 `strategy.parse_results()`，新增一个引擎只需加一个 Strategy 子类，不改其他代码。

> **Bug #2 — Google 爬取结果为 0**
>
> **现象**：Scrape 执行后，Google Tab 下没有任何结果，日志显示 `Strategy 1 (div.g): 0 cards`。
>
> **根本原因**：原始代码只使用 `div.g` 这一个 CSS 选择器。Google 频繁更新页面结构，当 `div.g` 失效后没有任何 fallback，导致 0 结果。
>
> **修复**：在 `GoogleSearchStrategy.parse_results()` 中加入 4 层降级策略，依次尝试：
> 1. `div.g`（经典选择器）
> 2. `#rso` 容器子元素（有机结果容器）
> 3. 全文扫描所有 `<a>` 内含 `<h3>` 的结构（最通用）
> 4. `data-hveid` 属性标记的容器
>
> 同时，每次抓取后将完整 HTML dump 到 `google_results.html`，并对每次 Google 页面用 Selenium 截图保存至 `screenshots/` 目录，方便调试。
>
> 涉及文件：`ScraperStrategy.py`、`RequestHandler.py`、`SearchUrl.py`、`DataScraper.py`

### `RequestHandler.py` — 两种抓取方式

| 方法 | 技术 | 用于 | 原因 |
|------|------|------|------|
| `get(url, screenshot_path)` | Selenium + ChromeDriver（无头浏览器） | 搜索引擎结果页 | 搜索引擎会检测爬虫，需要真实浏览器渲染JS |
| `get_with_fallback(url)` | requests 库（纯HTTP） | 目标网页内容 | 普通页面不需要JS，requests 更快速轻量 |

Selenium 会在后台启动一个不可见的 Chrome 窗口，完整渲染页面后返回 HTML，绕过搜索引擎的反爬检测。`screenshot_path` 参数非空时会在返回 HTML 前调用 `driver.save_screenshot()`。

### 完整爬取数据流

```
前端 ScrapeUrls → POST searchFilter/?keyword=xxx&url_size=10
                            │
                    views.index()
                            │
                    DataScraper.get_urls()
                            │
              ┌─────────────┴──────────────┐
              │  对4个搜索引擎依次执行       │
              └──────────────┬─────────────┘
                    SearchUrl.search(screenshots=[])
                             │
                    RequestHandler.get(url, screenshot_path)  ← Selenium（Google截图）
                             │
                    Strategy.parse_results()  ← BeautifulSoup 多策略解析
                             │
                   识别广告/自然结果
                             │
                  SearchQueryAdd.add_search_results()
                             │               ← 写入 MySQL（一引擎一 SearchRun）
                    返回 JsonResponse
                             │
              前端展示 TablePopulation
              （所有引擎完成后打印截图路径）
```

### 深度爬取数据流（Update Keyword Data）

```
前端 Header → GET searchFilter/get_html_data
                        │
              DataScraper.get_html_from_urls()
                        │
              查询：所有已存但 html_data 为空的 SearchResult
                        │
              对每条URL：RequestHandler.get_with_fallback()
                        │
              SearchQueryAdd.add_url_html_data()
                        │  BeautifulSoup 提取纯文本
                        │  lowercase 后统计关键词出现次数
                        │  更新 ScrapedPageData.term_frequency
                        ↓
              前端 GetUrls 的 count_of_appearance 显示真实频率
```

---

## 七、数据库写入层（`SearchQuery.py`）

### 正常写入流程

```
add_search_results(keyword, [[google结果], [bing结果], ...])
    │
    ├── get_or_create SearchTerm
    │
    └── 对每个引擎结果列表：
            ├── get_or_create SearchEngine
            ├── create SearchRun（每个引擎只建一条）
            └── 对每条结果：
                    ├── create SearchResult
                    └── get_or_create ScrapedPageData（存入初步 freq）
```

> **Bug #3 — 每条结果独立创建 SearchRun 导致查询只返回 1 条**
>
> **现象**：Scrape 完成后日志显示 "113 total results"，但 GET URLS 页面每个引擎只显示 1 条结果，`searchfilter_scrapedpagedata` 表也只有极少量记录。
>
> **根本原因**：`add_search_results` 原代码对**每一条**结果都调用 `add_search_run()` 创建新的 `SearchRun`。由于 `run_timestamp` 使用 `auto_now_add=True`，每条 run 的时间戳略有不同。`SQLData.py` 的读取 SQL 用 `MAX(run_timestamp)` 定位最新 run，这只能匹配到最后一条 run，因此每个引擎最终只能返回最后一条结果对应的 URL。
>
> **修复**：将 `add_search_run()` 移出 per-result 循环，**每个引擎列表整体只创建一个 `SearchRun`**，该引擎的所有结果都关联到这同一个 run。
>
> ```python
> # ❌ 修复前（每条结果建一个 run）
> for item in all_results:
>     run_obj = add_search_run(search_term_obj, engine_obj)   # 每次都 create
>     add_search_result(item, run_obj)
>
> # ✅ 修复后（每个引擎列表建一个 run）
> run_obj = add_search_run(search_term_obj, engine_obj)        # 只 create 一次
> for item in engine_results:
>     add_search_result(item, run_obj)
> ```
> 涉及文件：`SearchQuery.py`

> **Bug #4 — MySQL charset 错误导致大量结果写入失败并级联崩溃**
>
> **现象**：
> ```
> Error saving result: (1366, "Incorrect string value: '\xF3\xB1\x9E\xB4...' for column 'description'")
> Error saving result: An error occurred in the current transaction. You can't execute queries...
> ```
> 第一条报 charset 错误后，后续所有写入全部报 "can't execute queries"。
>
> **根本原因**：
> 1. Google 抓取的 description 含有 4-byte Unicode 字符（如 emoji，码点 ≥ U+10000）。MySQL `utf8` charset 最多支持 3-byte，无法存储。
> 2. 外层 `@transaction.atomic` 装饰器下，任意一个 `create()` 失败会将整个事务标记为损坏（broken），后续所有 SQL 操作全部拒绝执行，造成级联失败。
>
> **修复**：
> 1. 新增 `_sanitize()` 函数，过滤所有 `ord(c) >= 0x10000` 的字符，在 `url`、`title`、`description` 写入前统一清洗。
> 2. 将每条结果的 `create()` 包在独立的 `with transaction.atomic()` 里（创建 savepoint），某条失败只回滚该条，不影响后续结果。
>
> ```python
> @staticmethod
> def _sanitize(text: str) -> str:
>     return "".join(c for c in str(text) if ord(c) < 0x10000)
>
> # 每条结果独立 savepoint
> try:
>     with transaction.atomic():
>         add_search_result(item, run_obj)
> except Exception as e:
>     print(f"Skipped: {e}")
> ```
> 涉及文件：`SearchQuery.py`

---

## 八、关键词频率（`get_count`）

`ScrapedPageData.term_frequency` 记录搜索关键词在目标页面中的出现次数，用于排序结果质量。

### 计算时机

| 时机 | 触发 | 数据来源 | 准确度 |
|------|------|----------|--------|
| 初次 Scrape | `add_search_result()` | title + description 片段 | 低（快速预览） |
| Update Keyword Data | `add_url_html_data()` | 完整页面 HTML | 高（真实频率） |

初次 Scrape 后前端即可看到非零频率；点击 "Update Keyword Data" 后使用完整 HTML 覆盖更新。

### 计算方式

```python
# Stop words 不计入 keyword token
_STOP_WORDS = {"a", "an", "the", "and", "or", "of", "in", "on", "at", ...}

def _extract_keywords(phrase: str) -> list:
    tokens = phrase.lower().split()
    return [t for t in tokens if t not in _STOP_WORDS and len(t) > 1]
    # e.g. "city college of new york" → ["city", "college", "new", "york"]

def get_count(content: str, keyword: str) -> int:
    # 1. HTML → 提取纯文本（去掉 script/style/head/标签）
    if "<" in content:
        soup = BeautifulSoup(content, "html.parser")
        for tag in soup(["script", "style", "noscript", "head"]):
            tag.decompose()
        text = soup.get_text(separator=" ")
    else:
        text = content
    text_lower = text.lower()

    # 2. 拆词并过滤 stop words
    keywords = _extract_keywords(keyword)

    # 3. 每个 token 单独计数，累加
    total = 0
    for token in keywords:
        pattern = rf'\b{re.escape(token)}\b'
        total += len(re.findall(pattern, text_lower))
    return total
```

**示例**：keyword = `"city college of new york"`，某页面文本包含 "The City College of New York"
- tokens = `["city", "college", "new", "york"]`（"of" 被过滤）
- 每个词各出现 1 次 → freq = **4**

> **Bug #5 — Keyword Freq 始终显示 0 / 频率明显偏低**
>
> **现象**：GET URLS 页面所有结果的 `Keyword Freq` 均为 0，或即使有值也极小（只有 1）。
>
> **根本原因（三个）**：
> 1. 原 `get_count` 直接对原始 HTML（含标签）做正则，关键词若被 HTML 标签打断（如 `<em>city</em> college`）就无法匹配。
> 2. 原来把整个短语 `"city college of new york"` 作为一个词组精确匹配，页面上几乎不会出现连续完整短语，导致频率极低。
> 3. 初次 Scrape 后 `ScrapedPageData` 表没有任何记录（需手动点 "Update Keyword Data"），`COALESCE(spd.term_frequency, 0)` 返回 0。
>
> **修复**：
> 1. `get_count` 用 BeautifulSoup 提取纯文本（去 script/style/head），全部小写后计数。
> 2. 引入 `_extract_keywords()` 过滤 stop words，将 phrase 拆成独立 token，对每个 token 单独计数并累加，大幅提升频率的实际意义。
> 3. 在 `add_search_result` 里存入 `SearchResult` 后立即用 title + description 计算初步 freq 写入 `ScrapedPageData`，Scrape 结束后前端即可看到非零值。
>
> 涉及文件：`SearchQuery.py`

---

## 九、数据库查询策略（`SQLData.py`）

所有查询都使用 **CTE（公用表表达式）** 配合 `WITH` 语法，核心思路是：

```sql
WITH TargetTerm AS (
    -- 先找到目标关键词的 ID
    SELECT id FROM searchfilter_searchterm WHERE LOWER(search_term) = %s
),
LatestRuns AS (
    -- 再找每个搜索引擎最新一次运行的 run_id
    SELECT r.id FROM searchfilter_searchrun r
    INNER JOIN (
        SELECT search_engine_id, MAX(run_timestamp) as max_ts ...
        GROUP BY search_engine_id
    ) max_r ON ...
)
-- 最后用 LatestRuns 过滤结果
SELECT ... FROM searchfilter_searchresult WHERE run_id IN (SELECT id FROM LatestRuns)
```

**为什么不用 Django ORM？** 这类多层关联+子查询的逻辑用 Raw SQL 更直观，ORM 生成的 SQL 在这种嵌套场景下性能也更难控制。

---

## 十、启动顺序

```bash
# 1. 启动后端（Django）
cd SearchEngine_backend
python manage.py runserver          # 监听 localhost:8000

# 2. 启动前端（Vite）
cd SearchEngine_frontend
npm run dev                         # 监听 localhost:5173

# 3. 浏览器访问 http://localhost:5173
```

两个进程必须同时运行，缺少任何一个，另一个都无法正常工作。

---

## 十一、技术栈汇总

| 层 | 技术 | 版本 | 用途 |
|----|------|------|------|
| 前端框架 | React | 19 | UI 组件化 |
| 前端构建 | Vite | 6 | 开发服务器 + 打包 |
| UI 组件库 | MUI (Material UI) | 9 | 现成组件 + 主题系统 |
| 前端路由 | React Router | 7 | SPA 路由 |
| HTTP 客户端 | axios | 1.9 | 向后端发 REST 请求 |
| 后端框架 | Django | 3.2 | MVC + ORM + Admin |
| 跨域支持 | django-cors-headers | — | 允许前端跨域请求 |
| HTML 解析 | BeautifulSoup4 | — | 从搜索引擎HTML提取结果 + 纯文本提取 |
| 浏览器自动化 | Selenium + ChromeDriver | — | 渲染JS，绕过反爬，支持截图 |
| 数据库 | MySQL | — | 持久化存储搜索结果 |
| 数据库驱动 | mysqlclient | — | Python 连接 MySQL |

---

## 十二、Bug 索引

| # | 位置 | 现象 | 根本原因 |
|---|------|------|----------|
| Bug #1 | `ShowSearches.tsx` | MUI 组件样式失效 | MUI v9 移除 system props，需全部迁移至 `sx={}` |
| Bug #2 | `ScraperStrategy.py` | Google 返回 0 结果 | `div.g` 选择器失效，无 fallback |
| Bug #3 | `SearchQuery.py` | 每引擎只显示 1 条结果 | 每条结果独立创建 SearchRun，`MAX(run_timestamp)` 只匹配最后一条 |
| Bug #4 | `SearchQuery.py` | 大量结果写入失败 + 级联崩溃 | 4-byte Unicode 字符超出 MySQL utf8 范围；atomic 事务损坏后级联拒绝 |
| Bug #5 | `SearchQuery.py` | Keyword Freq 始终为 0 或极小 | 原始 HTML 正则 + 整句精确匹配 + stop words 未过滤 + 无初步 freq 写入 |
