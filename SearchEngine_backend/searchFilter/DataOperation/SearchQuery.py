import re
from bs4 import BeautifulSoup
from searchFilter.models import SearchEngine, SearchTerm, SearchRun, SearchResult, ScrapedPageData
from django.db import transaction

class SearchQueryAdd:

    @staticmethod
    def _sanitize(text: str) -> str:
        """Remove 4-byte Unicode characters that MySQL utf8 (non-mb4) cannot store."""
        if not text:
            return ""
        return "".join(c for c in str(text) if ord(c) < 0x10000)

    @staticmethod
    @transaction.atomic
    def add_url_html_data(html: str, row: SearchResult) -> ScrapedPageData:
        search_term_text = row.run.search_term.search_term
        print(f"getting data for {row.url} - id: {row.id}")

        count = SearchQueryAdd.get_count(html=html, keyword=search_term_text)

        scraped_data_obj, created = ScrapedPageData.objects.get_or_create(
            search_result=row,
            defaults={
                'term_frequency': count,
                'html_data': html
            }
        )

        if not created:
            scraped_data_obj.term_frequency = count
            scraped_data_obj.html_data = html
            scraped_data_obj.save(update_fields=['term_frequency', 'html_data'])

        return scraped_data_obj

    # Common English stop words that carry no keyword signal
    _STOP_WORDS = {
        "a", "an", "the", "and", "or", "but", "of", "in", "on", "at",
        "to", "for", "with", "by", "from", "is", "are", "was", "were",
        "be", "been", "as", "it", "its", "this", "that", "these", "those",
    }

    @staticmethod
    def _extract_keywords(phrase: str) -> list:
        """
        Split a search phrase into meaningful tokens by removing stop words.
        e.g. "city college of new york" → ["city", "college", "new", "york"]
        """
        tokens = [w.lower() for w in re.split(r'\s+', phrase.strip()) if w]
        keywords = [t for t in tokens if t not in SearchQueryAdd._STOP_WORDS and len(t) > 1]
        return keywords if keywords else tokens  # fallback: keep all if everything filtered out

    @staticmethod
    def get_count(content: str, keyword: str) -> int:
        """
        Count how many times the keyword's meaningful words appear in content.

        Steps:
          1. Extract visible text from HTML via BeautifulSoup (strips tags/scripts).
          2. Remove stop words from the keyword phrase to get individual tokens.
          3. Count each token independently with word-boundary regex (case-insensitive).
          4. Return the total sum.

        Example: keyword="city college of new york", text contains
          "The City College of New York" → tokens=["city","college","new","york"]
          → each appears once → total = 4
        """
        if not content or not keyword:
            return 0

        # Step 1 – extract clean visible text from HTML
        if "<" in content:
            soup = BeautifulSoup(content, "html.parser")
            for tag in soup(["script", "style", "noscript", "head"]):
                tag.decompose()
            text = soup.get_text(separator=" ")
        else:
            text = content

        text_lower = text.lower()

        # Step 2 – tokenise the keyword, drop stop words
        keywords = SearchQueryAdd._extract_keywords(keyword)

        # Step 3 – count each token and accumulate
        total = 0
        for token in keywords:
            pattern = rf'\b{re.escape(token)}\b'
            total += len(re.findall(pattern, text_lower))

        return total

    @staticmethod
    @transaction.atomic
    def add_search_results(search_term_text: str, data: list):
        """
        data: list of lists — each inner list is all results from one search engine.
        One SearchRun is created per engine per call (not per individual result),
        so that MAX(run_timestamp) in the SQL query correctly returns ALL results.
        """
        search_term_obj, _ = SearchTerm.objects.get_or_create(
            search_term=search_term_text,
            defaults={'term_label': 'NA', 'group_range': 'NA'}
        )

        total_ads = 0
        total_results = 0

        print("\n**** PROCESSING SEARCH RESULTS ****")
        print(f"Search term: {search_term_text}")

        for engine_results in data:
            if not engine_results:
                continue

            # Create exactly ONE SearchRun for this engine in this scraping session.
            # Previously a new run was created for every individual result, so
            # MAX(run_timestamp) in the read query would only match the last run and
            # return just 1 result per engine.
            first = engine_results[0]
            engine_name = first["searchEngine"]
            base_url = first.get("baseUrl", "")

            search_engine_obj = SearchQueryAdd.add_to_search_engine(engine_name, base_url)
            run_obj = SearchQueryAdd.add_search_run(search_term_obj, search_engine_obj)

            for item in engine_results:
                is_ad = item.get("ad_promo", False)
                total_results += 1
                if is_ad:
                    total_ads += 1
                # Each result is saved in its own savepoint so that a charset
                # error on one row does not poison the outer transaction.
                try:
                    with transaction.atomic():
                        SearchQueryAdd.add_search_result(engine=item, run_obj=run_obj)
                except Exception as e:
                    print(f"Skipped result '{item.get('title', '')}': {e}")

        print(f"\n**** SEARCH SUMMARY: {total_results} total results, {total_ads} ads/promos ****\n")

    @staticmethod
    def add_to_search_engine(search_engine: str, base_url: str):
        search_engine_obj, _ = SearchEngine.objects.get_or_create(
            name=search_engine,
            defaults={"base_url": base_url}
        )
        return search_engine_obj

    @staticmethod
    def add_search_run(search_term_obj: SearchTerm, search_engine_obj: SearchEngine):
        run_obj = SearchRun.objects.create(
            search_term=search_term_obj,
            search_engine=search_engine_obj
        )
        return run_obj

    @staticmethod
    def add_search_result(engine: dict, run_obj: SearchRun):
        ad_promo = engine.get("ad_promo", False)
        search_engine_name = engine.get("searchEngine", "Unknown")
        title = engine.get("title", "Unknown")
        ad_text = "AD/PROMO" if ad_promo else "ORGANIC"

        print(f"[{search_engine_name}] {ad_text}: {title}")

        s = SearchQueryAdd._sanitize
        try:
            title_clean = s(engine.get("title", ""))
            desc_clean = s(engine.get("description", ""))

            search_result_obj = SearchResult.objects.create(
                run=run_obj,
                url=s(engine["link"]),
                description=desc_clean,
                title=title_clean,
                ad_promo=ad_promo
            )

            # Calculate a preliminary keyword frequency from title + description
            # so the frontend shows non-zero values immediately after scraping.
            # "Update Keyword Data" will later overwrite this with the real
            # count from the full page HTML.
            keyword = run_obj.search_term.search_term
            snippet_text = f"{title_clean} {desc_clean}"
            preliminary_freq = SearchQueryAdd.get_count(snippet_text, keyword)

            ScrapedPageData.objects.get_or_create(
                search_result=search_result_obj,
                defaults={"term_frequency": preliminary_freq, "html_data": ""}
            )

            return search_result_obj
        except Exception as e:
            print(f"Error saving result: {e}")
            return None
