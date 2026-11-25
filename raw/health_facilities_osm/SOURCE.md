# Health facilities
- OpenStreetMap health facilities for Bangladesh, HOTOSM export on HDX (hotosm_bgd_health_facilities, export of 4 Nov 2026), ODbL. 8,223 features.
- Name matching: 298 features named as Upazila (or Thana) Health Complex, deduplicated within ~1.3 km to the points in uhc_osm.json.
- Tertiary: government medical college hospitals and national specialised institutes, matched by name (tertiary.json). null = not found in OSM; the pipeline then uses the host district's Sadar upazila.
- Community clinics: OSM has only 157 named community clinics, far short of the 14,467 reported (The Financial Express, 20 Aug 2025), so clinics are used as a national count only.
