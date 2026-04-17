import {
    Box,
    Typography,
    Card,
    CardContent,
    Pagination,
    Chip,
    Link,
    Divider,
    Stack,
    Tooltip,
} from "@mui/material";
import LanguageIcon from "@mui/icons-material/Language";
import AssessmentIcon from "@mui/icons-material/Assessment";
import { useState } from "react";

// ── Engine colour map ──────────────────────────────────────────────────────
const ENGINE_COLORS: Record<string, string> = {
    Google:     "#4285F4",
    Bing:       "#00897B",
    DuckDuckGo: "#DE5833",
    Yahoo:      "#6001D2",
};

// Extract the registrable domain (e.g. "en.wikipedia.org" → "wikipedia.org")
// Used to detect the same website even when the exact URL differs slightly.
function getDomain(url: string): string {
    try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        // Keep only the last two labels (e.g. "sub.example.co.uk" → "example.co.uk")
        const parts = host.split(".");
        return parts.length > 2 ? parts.slice(-2).join(".") : host;
    } catch {
        return url;
    }
}

interface MergedItem {
    url: string;
    title: string;
    desc: string;
    count_of_appearance: number;
    time_searched: string;
    sources: string[];   // which engines found this domain
}

const ShowSearches = ({ urlList }: { urlList: any[] }) => {
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;

    const safeUrlList = urlList || [];

    // ── Merge + deduplicate by domain ─────────────────────────────────────
    // For each domain keep the entry with the highest keyword frequency.
    // Accumulate all source engines that found that domain.
    const domainMap = new Map<string, MergedItem>();

    safeUrlList
        .filter((item) => !item.ad_promo)
        .forEach((item) => {
            const domain = getDomain(item.url);
            const freq   = Number(item.count_of_appearance) || 0;
            const engine = item.searchEngine as string;

            if (!domainMap.has(domain)) {
                domainMap.set(domain, {
                    url:                item.url,
                    title:              item.title || "",
                    desc:               item.desc  || "",
                    count_of_appearance: freq,
                    time_searched:      item.time_searched,
                    sources:            engine ? [engine] : [],
                });
            } else {
                const existing = domainMap.get(domain)!;
                // Prefer the entry with higher frequency
                if (freq > existing.count_of_appearance) {
                    existing.url                = item.url;
                    existing.title              = item.title || existing.title;
                    existing.desc               = item.desc  || existing.desc;
                    existing.count_of_appearance = freq;
                    existing.time_searched      = item.time_searched;
                }
                // Record this engine as a source (no duplicates)
                if (engine && !existing.sources.includes(engine)) {
                    existing.sources.push(engine);
                }
            }
        });

    const mergedItems: MergedItem[] = Array.from(domainMap.values())
        .sort((a, b) => b.count_of_appearance - a.count_of_appearance);

    const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
        setPage(value);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const paginatedItems = mergedItems.slice(
        (page - 1) * itemsPerPage,
        page * itemsPerPage
    );

    const formatDate = (dateString: string) => {
        if (!dateString) return "Unknown Date";
        return new Date(dateString).toLocaleDateString(undefined, {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit",
        });
    };

    // How many engines found this result (for ranking badge)
    const maxSources = Math.max(...mergedItems.map((i) => i.sources.length), 1);

    return (
        <Box sx={{ width: "100%", mt: 2 }}>
            {/* Summary bar */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 3, flexWrap: "wrap", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    <strong>{mergedItems.length}</strong> unique websites found across
                </Typography>
                {Object.entries(ENGINE_COLORS).map(([engine, color]) => (
                    <Chip
                        key={engine}
                        label={engine}
                        size="small"
                        sx={{ backgroundColor: color, color: "white", fontWeight: 600, fontSize: "0.72rem" }}
                    />
                ))}
            </Stack>

            {mergedItems.length > 0 ? (
                <>
                    {paginatedItems.map((item, idx) => (
                        <Card
                            key={idx}
                            elevation={0}
                            sx={{
                                mb: 2.5,
                                border: "1px solid #e0e0e0",
                                borderRadius: "12px",
                                transition: "0.2s",
                                "&:hover": {
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                                    borderColor: "primary.light",
                                },
                            }}
                        >
                            <CardContent sx={{ pb: "16px !important" }}>
                                {/* URL row */}
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
                                    <LanguageIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} />
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: "text.secondary",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            flex: 1,
                                        }}
                                    >
                                        {item.url}
                                    </Typography>
                                </Stack>

                                {/* Title link */}
                                <Link
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    underline="hover"
                                    sx={{
                                        display: "block",
                                        mb: 1,
                                        fontSize: "1.2rem",
                                        fontWeight: 500,
                                        color: "#1a0dab",
                                    }}
                                >
                                    {item.title || "No Title Available"}
                                </Link>

                                {/* Description */}
                                <Typography
                                    variant="body2"
                                    color="text.primary"
                                    sx={{ mb: 2, lineHeight: 1.6 }}
                                >
                                    {item.desc || "No description provided."}
                                </Typography>

                                <Divider sx={{ my: 1.5 }} />

                                {/* Footer row */}
                                <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                                    {/* Keyword frequency */}
                                    <Chip
                                        icon={<AssessmentIcon />}
                                        label={`Keyword Freq: ${item.count_of_appearance}`}
                                        color={item.count_of_appearance > 0 ? "success" : "default"}
                                        size="small"
                                        variant={item.count_of_appearance > 0 ? "filled" : "outlined"}
                                    />

                                    {/* Found-by badge: how many engines */}
                                    <Tooltip
                                        title={`Found by: ${item.sources.join(", ")}`}
                                        placement="top"
                                    >
                                        <Chip
                                            label={`Found by ${item.sources.length} / ${maxSources} engine${maxSources > 1 ? "s" : ""}`}
                                            size="small"
                                            variant="outlined"
                                            sx={{
                                                borderColor: item.sources.length > 1 ? "#f57c00" : "#bdbdbd",
                                                color:       item.sources.length > 1 ? "#e65100" : "text.secondary",
                                                fontWeight:  item.sources.length > 1 ? 700 : 400,
                                            }}
                                        />
                                    </Tooltip>

                                    {/* Per-engine coloured dots */}
                                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                        {item.sources.map((engine) => (
                                            <Tooltip key={engine} title={engine} placement="top">
                                                <Box
                                                    sx={{
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: "50%",
                                                        backgroundColor: ENGINE_COLORS[engine] ?? "#9e9e9e",
                                                    }}
                                                />
                                            </Tooltip>
                                        ))}
                                    </Stack>

                                    <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                                        Captured: {formatDate(item.time_searched)}
                                    </Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    ))}

                    <Box sx={{ display: "flex", justifyContent: "center", mt: 4, mb: 2 }}>
                        <Pagination
                            count={Math.ceil(mergedItems.length / itemsPerPage)}
                            page={page}
                            onChange={handlePageChange}
                            color="primary"
                            size="large"
                            shape="rounded"
                        />
                    </Box>
                </>
            ) : (
                <Box sx={{ textAlign: "center", py: 5 }}>
                    <Typography variant="h6" color="text.secondary">
                        No organic results available.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Try scraping a keyword first, then search here.
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default ShowSearches;
