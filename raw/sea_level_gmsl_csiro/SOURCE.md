# Global mean sea level (CSIRO reconstruction and altimetry, EPA table)

- Files (copied unchanged from the repo): `CSIRO_Recons_gmsl_yr_2019.csv` (1880-2019 annual GMSL mm relative to 1990 with uncertainty, Church and White reconstruction, 2019 update), `CSIRO_Recons_gmsl_mo_2015.csv` (monthly 1880-2013), `CSIRO_Alt_yearly.csv` and `CSIRO_Alt_seas_inc.csv` (satellite altimetry 1993-2019/2020, mm), `epa-sea-level.csv` (US EPA climate indicator table 1880-2023 in inches, CSIRO adjusted sea level with error bounds and NOAA series from 1993).
- Repo: https://github.com/datasets/sea-level-rise (commit e75c7af, 2026-03-04). Licence: ODC Public Domain Dedication (PDDL-1.0) for the package; underlying CSIRO data are CSIRO/ACE CRC (Church and White 2011, Surv. Geophys. 32, 585-602) and EPA data are US federal public domain.
- What was done: read and re-saved with pandas, no changes.
