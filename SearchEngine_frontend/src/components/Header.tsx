import {
    AppBar,
    Toolbar,
    Typography,
    Box,
    Button,
    CircularProgress,
    Chip,
} from "@mui/material";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import TravelExploreIcon from "@mui/icons-material/TravelExplore";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../api/api";

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [loadingButton, setLoadingButton] = useState(false);
    const [syncDone, setSyncDone] = useState(false);

    const active = location.pathname === "/" ? "getUrls" : "scrapeUrls";

    const onClickUpdateScrape = async () => {
        try {
            setLoadingButton(true);
            setSyncDone(false);
            await api.get("searchFilter/get_html_data");
            setSyncDone(true);
            setTimeout(() => setSyncDone(false), 3000);
        } catch (error) {
            console.log("Error updating scrape data:", error);
        } finally {
            setLoadingButton(false);
        }
    };

    return (
        <AppBar
            position="sticky"
            elevation={0}
            sx={{
                background: "linear-gradient(135deg, #1a237e 0%, #283593 60%, #3949ab 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
        >
            <Toolbar sx={{ px: { xs: 2, md: 4 }, py: 1, gap: 2 }}>
                {/* Brand */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 4 }}>
                    <ManageSearchIcon sx={{ fontSize: 32, color: "#90caf9" }} />
                    <Box>
                        <Typography
                            variant="h6"
                            sx={{ fontWeight: 800, color: "white", lineHeight: 1.1, letterSpacing: 0.5 }}
                        >
                            SearchScope
                        </Typography>
                        <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.6)", fontSize: "0.65rem" }}>
                            Search Engine Analytics
                        </Typography>
                    </Box>
                </Box>

                {/* Nav */}
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                        startIcon={<TravelExploreIcon />}
                        onClick={() => navigate("/")}
                        sx={{
                            color: active === "getUrls" ? "#1a237e" : "rgba(255,255,255,0.85)",
                            backgroundColor: active === "getUrls" ? "white" : "transparent",
                            borderRadius: "24px",
                            px: 2.5,
                            fontWeight: active === "getUrls" ? 700 : 500,
                            textTransform: "none",
                            fontSize: "0.9rem",
                            "&:hover": {
                                backgroundColor:
                                    active === "getUrls" ? "white" : "rgba(255,255,255,0.12)",
                            },
                        }}
                    >
                        Get URLs
                    </Button>
                    <Button
                        startIcon={<ManageSearchIcon />}
                        onClick={() => navigate("/ScrapeUrls")}
                        sx={{
                            color: active === "scrapeUrls" ? "#1a237e" : "rgba(255,255,255,0.85)",
                            backgroundColor: active === "scrapeUrls" ? "white" : "transparent",
                            borderRadius: "24px",
                            px: 2.5,
                            fontWeight: active === "scrapeUrls" ? 700 : 500,
                            textTransform: "none",
                            fontSize: "0.9rem",
                            "&:hover": {
                                backgroundColor:
                                    active === "scrapeUrls" ? "white" : "rgba(255,255,255,0.12)",
                            },
                        }}
                    >
                        Scrape URLs
                    </Button>
                </Box>

                <Box sx={{ flexGrow: 1 }} />

                {/* Sync button */}
                {syncDone && (
                    <Chip
                        label="Sync complete"
                        size="small"
                        sx={{ backgroundColor: "#a5d6a7", color: "#1b5e20", fontWeight: 600 }}
                    />
                )}
                <Button
                    startIcon={
                        loadingButton ? (
                            <CircularProgress size={16} sx={{ color: "white" }} />
                        ) : (
                            <CloudSyncIcon />
                        )
                    }
                    onClick={onClickUpdateScrape}
                    disabled={loadingButton}
                    variant="outlined"
                    sx={{
                        color: "white",
                        borderColor: "rgba(255,255,255,0.4)",
                        borderRadius: "24px",
                        px: 2.5,
                        textTransform: "none",
                        fontSize: "0.85rem",
                        "&:hover": { borderColor: "white", backgroundColor: "rgba(255,255,255,0.08)" },
                        "&.Mui-disabled": { color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.2)" },
                    }}
                >
                    {loadingButton ? "Syncing..." : "Update Keyword Data"}
                </Button>
            </Toolbar>
        </AppBar>
    );
};

export default Header;
