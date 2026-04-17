import time
from . import ScraperStrategy, RequestHandler


class SearchUrls:

    def __init__(self, strategy: ScraperStrategy, request_handle: RequestHandler):
        self.strategy = strategy
        self.request_handle = request_handle

    def search(self, keyword: str, total_results: int, screenshots: list = None) -> list:
        return self.get_search_results(keyword=keyword, total_results=total_results, screenshots=screenshots)

    def get_search_results(self, keyword: str, total_results: int = 300, screenshots: list = None) -> list:
        results = []
        seen_links = set()
        start_page = 0
        starting_size = 0
        is_google = isinstance(self.strategy, ScraperStrategy.GoogleSearchStrategy)

        while len(results) < 250:
            search_urls = self.strategy.build_search_url(keyword)

            if isinstance(self.strategy, ScraperStrategy.GoogleSearchStrategy):
                url = f"{search_urls}&start={start_page}"
            elif isinstance(self.strategy, ScraperStrategy.BingSearchStrategy):
                url = f"{search_urls}&first={start_page + 1}"
            elif isinstance(self.strategy, ScraperStrategy.DuckDuckGoSearchStrategy):
                url = search_urls if start_page == 0 else f"{search_urls}&s={start_page * 3}"
            elif isinstance(self.strategy, ScraperStrategy.YahooSearchStrategy):
                url = f"{search_urls}&first={start_page + 1}"
            else:
                url = search_urls

            print(f"Fetching: {url}")

            # Build screenshot path only for Google
            screenshot_path = None
            if is_google and screenshots is not None:
                page_num = start_page // 10 if start_page > 0 else 0
                safe_keyword = keyword[:20].replace(" ", "_")
                screenshot_path = f"screenshots/google_{safe_keyword}_page{page_num}.png"

            html = self.request_handle.get(url, screenshot_path=screenshot_path)

            if screenshot_path:
                screenshots.append(screenshot_path)

            page_results = self.strategy.parse_results(html)

            for result in page_results:
                link = result.get("link")
                if not link:
                    continue
                if link in seen_links:
                    continue
                seen_links.add(link)
                results.append(result)

            if len(results) >= total_results or starting_size == len(results):
                break

            print(f"In page - {start_page} - size: {len(results)}")
            time.sleep(1)
            start_page += 10
            starting_size = len(results)

        return results
