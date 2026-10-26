# ERA-Interim monthly 850 hPa wind, January and July, South Asia / Bay of Bengal window

- File: `erainterim_850hpa_uv_jan_jul_60-110E_5S-35N.csv` (7,102 rows: month (1 or 7), lat, lon on the 0.75 deg ERA-Interim grid, u850_ms, v850_ms, speed_ms).
- Source: https://github.com/pydata/xarray-data `eraint_uvz.nc` (xarray tutorial dataset: "Monthly ERA-Interim data, downloaded and edited by Fabien Maussion"; monthly means of u, v, z at 200/500/850 hPa for January and July only, global 0.75 deg). Underlying data ECMWF ERA-Interim reanalysis (Dee et al. 2011), free for use with attribution to ECMWF/Copernicus.
- What was done: selected the 850 hPa level and the window 60-110E, 5S-35N with xarray, wrote CSV.
- Limitation: this is a fallback for the requested ERA5 10 m monthly climatology. It gives only the January (northeast monsoon) and July (southwest monsoon) low-level flow, enough to animate the seasonal reversal over the Bay of Bengal but not a 12-month cycle or surface (10 m) winds. No GitHub-hosted ERA5 10 m monthly climatology subset was found (searched for u10/v10 monthly climatology CSV/netCDF; hits were download scripts only).
