import React, { useState } from "react";
import { Button, Grid, TextField, Box, Typography } from "@mui/material";
import api from "../api/api";
import ShowSearches from "./organization/ShowSearches";

const GetUrls = () => {
	const [searchVal, setSearchVal] = useState("");
	const [loading, setLoading] = useState(false);
	const [listOfUrls, setListOfUrls] = useState([]);
	const [listOfStats, setListOfStats] = useState({});

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setSearchVal(e.target.value);
	};

	const handleOnClick = async () => {
		try {
			setLoading(true);
			console.log("sending request for:", searchVal);
			const response = await api.get(
				"searchFilter/get_list_of_links_for_keyword",
				{
					params: {
						keyword: searchVal,
					},
				}
			);
			setListOfUrls(response.data.data);

			const response2 = await api.get("searchFilter/get_list_of_ads_none_ads", {
				params: {
					keyword: searchVal,
				},
			});

			const searchEngineStats: Record<string, Record<string, number>> = {};
			
			response2.data.data.forEach((element: any) => {
				const engine = element.searchEngineName_id;
				const isAd = Boolean(element.ad_promo); 
				const adPromoKey = isAd ? "true" : "false";
				const count = element.count;

				if (!searchEngineStats[engine]) {
					searchEngineStats[engine] = { "true": 0, "false": 0 };
				}
				searchEngineStats[engine][adPromoKey] = count;
			});
			
			setListOfStats(searchEngineStats);
		} catch (error) {
			console.log("ERROR", error);
		} finally {
			setLoading(false);
		}
	};

	const renderTable = () => {
		if (listOfUrls.length > 0) {
			return <ShowSearches urlList={listOfUrls} />;
		} else return null;
	};

	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				padding: 5,
				width: "95%",
			}}
		>
			<Grid container spacing={1} alignItems="center" sx={{ width: "90%" }}>
				
				<Grid size={10}>
					<TextField
						id="searchGetUrls"
						label="Search"
						value={searchVal}
						onChange={handleSearchChange}
						variant="outlined"
						fullWidth
						sx={{ borderRadius: "50px", backgroundColor: "white" }}
					/>
				</Grid>

				<Grid size={2}>
					<Button
						variant="contained"
						fullWidth
						disabled={loading}
						sx={{
							height: "100%",
							textTransform: "none",
							fontWeight: "bold",
							borderRadius: "50px",
						}}
						onClick={handleOnClick}
					>
						{loading ? "Loading..." : "Search"}
					</Button>
				</Grid>
				
				<Grid container size={12} spacing={2} sx={{ mt: 2 }}>
					{Object.entries(
						listOfStats as Record<string, Record<string, number>>
					).map(([engine, stats]) => {
						const adsCount = stats["true"] ?? 0;
						const organicCount = stats["false"] ?? 0;
						const total = adsCount + organicCount;
						const adPercent = total > 0 ? ((adsCount / total) * 100).toFixed(2) : "0.00";

						return (
							<Grid size={6} key={engine}>
								<Typography variant="body2" sx={{ fontWeight: "bold", color: "text.secondary" }}>
									{`${engine} - Ads: ${adsCount} | Organic: ${organicCount} | Ads %: ${adPercent}%`}
								</Typography>
							</Grid>
						);
					})}
				</Grid>
				
				<Grid size={12}>
					<Box sx={{ width: "100%", marginTop: 3 }}>{renderTable()}</Box>
				</Grid>
			</Grid>
		</Box>
	);
};

export default GetUrls;