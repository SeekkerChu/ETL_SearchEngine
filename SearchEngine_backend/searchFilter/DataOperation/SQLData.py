from django.db import connection

class GetSQLData:

    @staticmethod
    def get_list_of_links_for_keyword(keyword: str = None):
        if not keyword:
            return []

        query = """
            WITH TargetTerm AS (
                SELECT id, search_term FROM searchfilter_searchterm WHERE LOWER(search_term) = %s LIMIT 1
            ),
            LatestRuns AS (
                SELECT r.id, r.search_engine_id, r.run_timestamp
                FROM searchfilter_searchrun r
                INNER JOIN (
                    SELECT search_engine_id, MAX(run_timestamp) as max_ts
                    FROM searchfilter_searchrun
                    WHERE search_term_id IN (SELECT id FROM TargetTerm)
                    GROUP BY search_engine_id
                ) max_r ON r.search_engine_id = max_r.search_engine_id AND r.run_timestamp = max_r.max_ts
            ),
            Results AS (
                SELECT res.id, res.url, res.title, res.description as `desc`, res.ad_promo, res.captured_at, res.run_id
                FROM searchfilter_searchresult res
                JOIN LatestRuns lr ON res.run_id = lr.id
            )
            SELECT 
                r.id, r.url, r.desc, r.title, r.ad_promo, 
                spd.scrape_timestamp as data_scrape_time, 
                lr.run_timestamp as time_searched, 
                COALESCE(spd.term_frequency, 0) as count_of_appearance, 
                se.name AS searchEngine 
            FROM Results r
            JOIN LatestRuns lr ON r.run_id = lr.id
            JOIN searchfilter_searchengine se ON lr.search_engine_id = se.id
            LEFT JOIN searchfilter_scrapedpagedata spd ON r.id = spd.search_result_id
            ORDER BY searchEngine, count_of_appearance DESC
        """

        with connection.cursor() as cursor:
            cursor.execute(query, [keyword.lower()])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return results

    @staticmethod
    def get_list_of_ads_none_ads(keyword: str = None):
        if not keyword:
            return []

        query = """
            WITH TargetTerm AS (
                SELECT id, search_term FROM searchfilter_searchterm WHERE LOWER(search_term) = %s LIMIT 1
            ),
            LatestRuns AS (
                SELECT r.id, r.search_engine_id
                FROM searchfilter_searchrun r
                INNER JOIN (
                    SELECT search_engine_id, MAX(run_timestamp) as max_ts
                    FROM searchfilter_searchrun
                    WHERE search_term_id IN (SELECT id FROM TargetTerm)
                    GROUP BY search_engine_id
                ) max_r ON r.search_engine_id = max_r.search_engine_id AND r.run_timestamp = max_r.max_ts
            )
            SELECT 
                t.search_term as searchTerm, 
                se.name as searchEngineName_id, 
                res.ad_promo, 
                COUNT(*) as count
            FROM searchfilter_searchresult res
            JOIN LatestRuns lr ON res.run_id = lr.id
            JOIN searchfilter_searchengine se ON lr.search_engine_id = se.id
            JOIN TargetTerm t
            GROUP BY t.search_term, se.name, res.ad_promo
        """

        with connection.cursor() as cursor:
            cursor.execute(query, [keyword.lower()])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return results

    @staticmethod
    def get_list_of_dups(keyword: str = None):
        if not keyword:
            return []

        query = """
            WITH TargetTerm AS (
                SELECT id FROM searchfilter_searchterm WHERE LOWER(search_term) = %s LIMIT 1
            ),
            LatestRuns AS (
                SELECT r.id, r.search_engine_id
                FROM searchfilter_searchrun r
                INNER JOIN (
                    SELECT search_engine_id, MAX(run_timestamp) as max_ts
                    FROM searchfilter_searchrun
                    WHERE search_term_id IN (SELECT id FROM TargetTerm)
                    GROUP BY search_engine_id
                ) max_r ON r.search_engine_id = max_r.search_engine_id AND r.run_timestamp = max_r.max_ts
            )
            SELECT 
                res.url, 
                se.name as searchEngineName_id, 
                COUNT(*) as dups
            FROM searchfilter_searchresult res
            JOIN LatestRuns lr ON res.run_id = lr.id
            JOIN searchfilter_searchengine se ON lr.search_engine_id = se.id
            GROUP BY res.url, se.name
            HAVING count(*) > 1
        """

        with connection.cursor() as cursor:
            cursor.execute(query, [keyword.lower()])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return results