import React, { useState } from "react";
import {
    Button,
    TextField,
    Box,
    Typography,
    Paper,
    CircularProgress,
    InputAdornment,
    Chip,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import LinkIcon from "@mui/icons-material/Link";
import api from "../api/api";
import TablePopulation from "./organization/TablePopulation";

const ScrapeUrls = () => {
    const [searchVal, setSearchVal] = useState("");
    const [urlSize, setUrlSize] = useState<number>(10);
    const [listOfUrls, setListOfUrls] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchVal(e.target.value);
    };

    const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Math.abs(Number(e.target.value));
        setUrlSize(Math.min(value, 300));
    };

    const handleOnClick = async () => {
        if (!searchVal) return;
        try {
            setLoading(true);
            setHasSearched(false);
            const response = await api.get("searchFilter/", {
                params: { keyword: searchVal, url_size: urlSize },
            });
            const flatUrls = (response.data.urls || []).flat();
            console.log("Scraped flat urls:", flatUrls);
            setListOfUrls(flatUrls);
        } catch (error) {
            console.log(error);
        } finally {
            setLoading(false);
            setHasSearched(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleOnClick();
    };

    return (
        <Box sx={{ minHeight: "100vh", backgroundColor: "#f0f2f8" }}>
            {/* Hero banner */}
            <Box
                sx={{
                    background: "linear-gradient(135deg, #1a237e 0%, #3949ab 100%)",
                    py: { xs: 5, md: 7 },
                    px: 3,
                    textAlign: "center",
                    position: "relative",
                    overflow: "hidden",
                    "&::before": {
                        content: '""',
                        position: "absolute",
                        top: -60,
                        right: -60,
                        width: 300,
                        height: 300,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                    },
                    "&::after": {
                        content: '""',
                        position: "absolute",
                        bottom: -80,
                        left: -40,
                        width: 250,
                        height: 250,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.04)",
                    },
                }}
            >
                <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                    <Box
                        sx={{
                            backgroundColor: "rgba(255,255,255,0.15)",
                            borderRadius: "50%",
                            p: 1.5,
                            display: "flex",
                        }}
                    >
                        <RocketLaunchIcon sx={{ fontSize: 36, color: "#90caf9" }} />
                    </Box>
                </Box>
                <Typography
                    variant="h4"
                    sx={{ color: "white", fontWeight: 800, mb: 1, letterSpacing: 0.5 }}
                >
                    Scrape Search Results
                </Typography>
                <Typography
                    variant="body1"
                    sx={{ color: "rgba(255,255,255,0.7)", maxWidth: 520, mx: "auto", mb: 3 }}
                >
                    Enter a keyword to scrape live search engine results and store them
                    for analysis.
                </Typography>

                {/* Search card */}
                <Paper
                    elevation={8}
                    sx={{
                        maxWidth: 760,
                        mx: "auto",
                        borderRadius: "16px",
                        p: 3,
                        backgroundColor: "white",
                    }}
                >
                    <Grid container spacing={2} sx={{ alignItems: "center" }}>
                        <Grid size={7}>
                            <TextField
                                label="Search Keyword"
                                value={searchVal}
                                variant="outlined"
                                onChange={handleSearchChange}
                                onKeyDown={handleKeyDown}
                                fullWidth
                                placeholder="e.g. city college of new york"
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon sx={{ color: "text.secondary" }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                            />
                        </Grid>
                        <Grid size={3}>
                            <TextField
                                label="Max URL Size"
                                variant="outlined"
                                onChange={handleSizeChange}
                                fullWidth
                                value={urlSize}
                                type="number"
                                slotProps={{
                                    htmlInput: { min: 1, max: 300 },
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <FilterListIcon sx={{ color: "text.secondary" }} />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                            />
                        </Grid>
                        <Grid size={2}>
                            <Button
                                disabled={loading || !searchVal}
                                variant="contained"
                                fullWidth
                                onClick={handleOnClick}
                                sx={{
                                    height: "56px",
                                    borderRadius: "10px",
                                    textTransform: "none",
                                    fontWeight: 700,
                                    fontSize: "1rem",
                                    background: "linear-gradient(135deg, #1a237e, #3949ab)",
                                    boxShadow: "0 4px 14px rgba(26,35,126,0.35)",
                                    "&:hover": {
                                        background: "linear-gradient(135deg, #283593, #3f51b5)",
                                        boxShadow: "0 6px 18px rgba(26,35,126,0.45)",
                                    },
                                    "&.Mui-disabled": {
                                        background: "#e0e0e0",
                                        boxShadow: "none",
                                        color: "#9e9e9e",
                                    },
                                }}
                            >
                                {loading ? (
                                    <CircularProgress size={22} sx={{ color: "white" }} />
                                ) : (
                                    "Scrape"
                                )}
                            </Button>
                        </Grid>
                    </Grid>

                    {/* Tips */}
                    <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                        <Chip label="Max 300 URLs" size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                        <Chip label="Filters ad results" size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                        <Chip label="Press Enter to search" size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                    </Box>
                </Paper>
            </Box>

            {/* Results area */}
            <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>
                {loading && (
                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 8, gap: 2 }}>
                        <CircularProgress size={48} thickness={4} />
                        <Typography variant="body1" color="text.secondary">
                            Scraping search results for <strong>"{searchVal}"</strong>…
                        </Typography>
                    </Box>
                )}

                {!loading && hasSearched && listOfUrls.length === 0 && (
                    <Box sx={{ textAlign: "center", py: 8 }}>
                        <LinkIcon sx={{ fontSize: 56, color: "#bdbdbd", mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                            No results found
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Try a different keyword or increase the Max URL Size.
                        </Typography>
                    </Box>
                )}

                {!loading && listOfUrls.length > 0 && (
                    <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                Scraped Results
                            </Typography>
                            <Chip
                                label={`${listOfUrls.length} URLs`}
                                size="small"
                                color="primary"
                                sx={{ fontWeight: 600 }}
                            />
                        </Box>
                        <TablePopulation urlList={listOfUrls} />
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ScrapeUrls;
