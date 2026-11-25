# District population, censuses 1991, 2001, 2011, 2022
- districts_adjusted.csv: 62 districts, BBS figures adjusted for net under-enumeration, as tabulated by citypopulation.de (division pages), fetched Nov 2026.
- unadjusted_two.csv: Jhenaidah and Meherpur, enumerated counts only; pipeline/make_pop.py scales them by the residual factor (1.041, 1.047, 1.040, 1.023) so the 64 districts add up to the national adjusted totals (111.455 M, 130.523 M, 149.772 M, 169.829 M).
