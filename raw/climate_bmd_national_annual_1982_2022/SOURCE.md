# BMD quality-controlled national annual series, 1982-2022 (24 stations)

- Files: `bmd24_national_annual_1982_2022.csv` (41 rows: year, temp_mean_c, rh_pct, rain_total_mm; national means over the 24-station QC panel), `mann_kendall_trends.csv` (author's Mann-Kendall / Sen slope results per division and variable).
- Repo: https://github.com/abir-hosen-ashik/bd-monthly-weather-forecast-ml-paper (commit 2ff0603), files `results/trends/national_annual_series.csv`, `results/trends/mann_kendall.csv`. Code MIT; the author states the BMD station data are not covered by the licence and the QC panels live on Kaggle (abirhosenashik/bangladesh-bmd-station-weather-data-19812022-qc), which this sandbox cannot reach.
- Original source: Bangladesh Meteorological Department monthly station records, quality-controlled by the repo author (24 stations with near-complete 1981-2022 records).
- What was done: copied and renamed columns only. Use as the post-2013 extension of the station series; note it is a derived product from a preprint pipeline, not raw BMD data.
