from django.contrib import admin
from .models import SearchEngine, SearchTerm, SearchRun, SearchResult, ScrapedPageData

admin.site.register(SearchEngine)
admin.site.register(SearchTerm)
admin.site.register(SearchRun)
admin.site.register(SearchResult)
admin.site.register(ScrapedPageData)