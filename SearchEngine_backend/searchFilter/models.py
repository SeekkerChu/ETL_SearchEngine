from django.db import models

class SearchEngine(models.Model):
    name = models.CharField(max_length=50, unique=True, help_text="google, bing, yahoo, duckduckgo")
    base_url = models.URLField(max_length=255)

    def __str__(self):
        return self.name

class SearchTerm(models.Model):
    term_label = models.CharField(max_length=10) # a, b, c, d, e
    group_range = models.CharField(max_length=10) 
    search_term = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.term_label}: {self.search_term[:20]}..."

class SearchRun(models.Model):
    search_term = models.ForeignKey(SearchTerm, on_delete=models.CASCADE)
    search_engine = models.ForeignKey(SearchEngine, on_delete=models.CASCADE)
    run_timestamp = models.DateTimeField(auto_now_add=True)

class SearchResult(models.Model):
    run = models.ForeignKey(SearchRun, on_delete=models.CASCADE)
    url = models.TextField()
    title = models.TextField(null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    ad_promo = models.BooleanField(default=False)
    captured_at = models.DateTimeField(auto_now_add=True)

class ScrapedPageData(models.Model):
    search_result = models.OneToOneField(SearchResult, on_delete=models.CASCADE)
    html_data = models.TextField(null=True, blank=True)
    term_frequency = models.IntegerField(default=0)
    scrape_timestamp = models.DateTimeField(auto_now_add=True)