import os
from typing import List
from django.http import JsonResponse

from searchFilter.DataOperation.SearchQuery import SearchQueryAdd
from searchFilter.models import SearchResult, ScrapedPageData
from . import RequestHandler, ScraperStrategy, SearchUrl

class DataScraper:

    @staticmethod
    def get_html_from_urls(keyword: str = None):
        print(f"Getting HTML content for {keyword}")

        request_handler = RequestHandler.RequestHandler()

        results = DataScraper.get_list_of_search_urls(keyword=keyword)
        return_results = DataScraper.parse_list_of_searches_and_populate_url_data(rows=results,
                                                                                  request_handler=request_handler)
        return_val = [
            {
                "id": spd.id,
                "searchUrls": {
                    "id": spd.search_result.id,
                    "url": spd.search_result.url,
                    "title": spd.search_result.title,
                    "desc": spd.search_result.description,  
                    "ad_promo": spd.search_result.ad_promo
                },
                "count": spd.term_frequency 
            } for spd in return_results
        ]
        return JsonResponse({
            "success": True,
            "urls": return_val
        })

    @staticmethod
    def parse_list_of_searches_and_populate_url_data(rows: List[SearchResult], request_handler) -> List[ScrapedPageData]:
        results: List[ScrapedPageData] = []
        for row in rows:
           
            try:
                html = request_handler.get_with_fallback(row.url)
                url_data = DataScraper.add_html_to_table(html=html, row=row)
                results.append(url_data)
                print(f"Appended - {row.url} - id: {row.id}")
            except Exception as e:
                print(f"Failed processing row ID {row.id}, URL: {row.url}, error: {e}")
                continue
        return results

    @staticmethod
    def add_html_to_table(html: str, row: SearchResult) -> ScrapedPageData:
        url_data = SearchQueryAdd.add_url_html_data(html=html, row=row)
        return url_data

    @staticmethod
    def get_list_of_search_urls(keyword: str = None) -> List[SearchResult]:
       
        if keyword:
            query = """
                WITH TargetTerm AS (
                    SELECT id FROM searchfilter_searchterm WHERE LOWER(search_term) = %s LIMIT 1
                ),
                LatestRuns AS (
                    SELECT r.id
                    FROM searchfilter_searchrun r
                    INNER JOIN (
                        SELECT search_engine_id, MAX(run_timestamp) as max_ts
                        FROM searchfilter_searchrun
                        WHERE search_term_id IN (SELECT id FROM TargetTerm)
                        GROUP BY search_engine_id
                    ) max_r ON r.search_engine_id = max_r.search_engine_id AND r.run_timestamp = max_r.max_ts
                )
                SELECT res.*
                FROM searchfilter_searchresult res
                JOIN LatestRuns lr ON res.run_id = lr.id
                LEFT JOIN searchfilter_scrapedpagedata spd ON res.id = spd.search_result_id
                WHERE res.ad_promo = 0 AND spd.id IS NULL
            """
            latest_entry = SearchResult.objects.raw(query, [keyword.lower()])
        else:
            query = """
                WITH LatestRuns AS (
                    SELECT r.id
                    FROM searchfilter_searchrun r
                    INNER JOIN (
                        SELECT search_term_id, search_engine_id, MAX(run_timestamp) as max_ts
                        FROM searchfilter_searchrun
                        GROUP BY search_term_id, search_engine_id
                    ) max_r ON r.search_engine_id = max_r.search_engine_id AND r.search_term_id = max_r.search_term_id AND r.run_timestamp = max_r.max_ts
                )
                SELECT res.*
                FROM searchfilter_searchresult res
                JOIN LatestRuns lr ON res.run_id = lr.id
                LEFT JOIN searchfilter_scrapedpagedata spd ON res.id = spd.search_result_id
                WHERE res.ad_promo = 0 AND spd.id IS NULL
            """
            latest_entry = SearchResult.objects.raw(query)
            
        return list(latest_entry)

    @staticmethod
    def get_urls(keyword: str, url_size: int):
        print(f"Getting searches for {keyword} total urls: {url_size}")

        request_handler = RequestHandler.RequestHandler()

        google_strategy = ScraperStrategy.GoogleSearchStrategy()
        bing_strategy = ScraperStrategy.BingSearchStrategy()
        duckduckgo_strategy = ScraperStrategy.DuckDuckGoSearchStrategy()
        yahoo_strategy = ScraperStrategy.YahooSearchStrategy()

        search_urls = SearchUrl.SearchUrls(strategy=google_strategy, request_handle=request_handler)
        search_bing_url = SearchUrl.SearchUrls(strategy=bing_strategy, request_handle=request_handler)
        search_duckduckgo_url = SearchUrl.SearchUrls(strategy=duckduckgo_strategy, request_handle=request_handler)
        search_yahoo_url = SearchUrl.SearchUrls(strategy=yahoo_strategy, request_handle=request_handler)

        list_of_engine_search = [search_urls, search_bing_url, search_duckduckgo_url, search_yahoo_url]

        try:
            found_urls = []
            screenshots = []
            ad_promo_count = 0
            total_count = 0

            os.makedirs("screenshots", exist_ok=True)

            print("\n*** BEGINNING SEARCH FOR ADS/PROMOS ***\n")

            for curr in list_of_engine_search:
                engine_results = curr.search(keyword, url_size, screenshots=screenshots)
                for result in engine_results:
                    total_count += 1
                    if result.get("ad_promo", False):
                        ad_promo_count += 1
                found_urls.append(engine_results)

            print(f"\n*** FOUND {ad_promo_count} ADS/PROMOS OUT OF {total_count} TOTAL RESULTS ***\n")

            if screenshots:
                print("\n*** GOOGLE SCREENSHOTS ***")
                for path in screenshots:
                    print(f"  {os.path.abspath(path)}")
                print()

            SearchQueryAdd.add_search_results(keyword, found_urls)
            return JsonResponse({
                "success": True,
                "urls": found_urls
            })
        except Exception as e:
            return JsonResponse({
                "success": False,
                "error": str(e)
            })