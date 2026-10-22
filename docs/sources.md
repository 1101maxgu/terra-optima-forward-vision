# Sources for engine constants

**Constants to be reviewed by an agronomist before field use.** They are for a pitch prototype, chosen from published tables, and not calibrated to any real farm.

## References
- **FAO-56**: Allen, R.G., Pereira, L.S., Raes, D., Smith, M. (1998). *Crop evapotranspiration: Guidelines for computing crop water requirements.* FAO Irrigation and Drainage Paper 56.
  - Table 12 (Kc): https://www.fao.org/4/x0490e/x0490e0b.htm
  - Table 19 (soil water characteristics): https://www.fao.org/4/x0490e/x0490e0c.htm
  - Table 22 (root depth Zr, depletion fraction p): https://www.fao.org/4/x0490e/x0490e0e.htm
- **BC 619.000-1**: BC Ministry of Agriculture, Food and Fisheries (2002). *Soil Water Storage Capacity and Available Soil Moisture*, Water Conservation Factsheet No. 619.000-1. https://www.irrigationtoolbox.com/ReferenceDocuments/Extension/BCExtension/619000-1.pdf

## Crops (`src/data/crops.ts`)
| Crop | Kc mid | Root depth | p | Choice |
|---|---|---|---|---|
| Tomato | 1.15 (FAO T12) | 700 mm | 0.40 | FAO T22 range is 0.7–1.5 m and says the smaller values suit irrigation scheduling, so we use the low end. BC 619.000-1 lists tomatoes at 0.90 m for system *design*; we keep the shallower value because it is more conservative for scheduling. p = 0.40 in both FAO and BC (Table 3: tomatoes 40%). |
| Lettuce | 1.00 (FAO T12) | 300 mm | 0.30 | FAO T22 range is 0.3–0.5 m, low end chosen for scheduling. BC lists lettuce as "shallow", 0.45 m (design value). |
| Blueberry | 1.05 (FAO T12, berries (bushes)) | 600 mm | 0.50 | BC 619.000-1 Table 1 puts blueberries in "medium shallow", 0.60 m, with an availability coefficient of 50% ("other crops", Table 3). This matches the low end of FAO T22 berries (bushes), 0.6–1.2 m, p 0.50. No BC-specific Kc was found, so Kc uses FAO. |

Notes:
- The BC Table 1 crop-to-column mapping was read from text extracted from the PDF. Verify it against the printed table.
- FAO p values assume ETc ≈ 5 mm/day. We don't apply FAO's adjustment for ETc, to keep the model simple.
- For agricultural drip, BC 619.000-1 suggests a 25% allowable depletion. We use the crop p for both methods and note the BC value here as a possible future refinement.

## Soils (`src/data/soils.ts`)
Each θ falls within the FAO T19 range and is chosen so that available water (θFC − θWP) matches the BC 619.000-1 Table 2 available water storage capacity.

| Soil | θFC | θWP | AW (mm/m) | FAO T19 range (FC / WP) | BC AWSC (mm/m) |
|---|---|---|---|---|---|
| Sandy loam | 0.23 | 0.11 | 120 | 0.18–0.28 / 0.06–0.16 | 125 |
| Loam | 0.30 | 0.13 | 170 | 0.20–0.30 / 0.07–0.17 | 175 |
| Silt loam | 0.34 | 0.13 | 210 | 0.22–0.36 / 0.09–0.21 | 208 |

## Engine constants (`src/engine/irrigation.ts`)
- **Application efficiency**: drip 0.90, sprinkler 0.75. These are the PRD's typical values and fall within the commonly cited ranges (drip 85–95%, sprinkler 70–80%). Not verified against a specific BC table.
- **Effective rain**: 0 below 3 mm, otherwise 80%. This is a simple PRD rule of thumb, not a FAO or BC formula.
- **Default ET0**: 4.5 mm/day, used when the forecast is short or ET0 is missing/NaN. It is an assumed typical Fraser Valley mid-summer value, consistent with the bundled sample weather (3.2–6.2 mm/day). It is not a published normal.
- **Timing advice**: water early morning or evening to reduce evaporation. This is standard practice, given as text only.
