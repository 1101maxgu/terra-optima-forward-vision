# Sensor trust

GeoViva checks whether each probe's readings are believable before they drive watering advice.
Code: `src/engine/sensorTrust.ts` (`assessSensors`, thresholds in `LIMITS`), applied in `src/state/farmStore.tsx`.

## Output

Every sensor with a reading in the last 24 h gets a verdict, a confidence from 0 to 1, the signals behind it, a
one-sentence explanation and a recommended action. Sensors with older data are not assessed; the offline alert covers them.

| Verdict | When | Effect |
|---|---|---|
| `trusted` | confidence ≥ 0.75 | used normally |
| `uncertain` | 0.4 ≤ confidence < 0.75 | used, alert raised, advice says it is only partly trusted |
| `likely-faulty` | confidence < 0.4 | left out of the zone's reading and advice, alert raised |
| `real-event` | a big jump explained by rain (≥ 5 mm today) or irrigation (within 12 h) | used, no alert |

Confidence = 1 − sum of signal weights, clamped to 0–1.

## Signals

| Signal | Rule | Weight |
|---|---|---|
| `out-of-range` | moisture < 1 % or > 60 %; soil temp outside −10…50 °C | 0.7 / 0.5 |
| `flatline` | 3+ readings within ±0.05 points over 6+ h | 0.7 |
| `spike` | ≥ 15-point jump between readings in the last 48 h, not explained | 0.4 |
| `peer-disagree` | ≥ 10 points from the median of same-zone probes | 0.45 (0.35 with one peer) |
| `implausible` | rose ≥ 3 points in 24 h with no rain/irrigation; soil temp > 10 °C outside today's air range | 0.3 / 0.25 |
| `battery` | battery < 20 % | 0.2 |

With only one peer it is impossible to tell which probe is wrong, so a disagreement is blamed only on the probe
that does not already have other signals against it.

## Farmer response

"I checked it, it's fine" puts the probe back into the advice; "Ignore" silences the alert but keeps it left out.
Both are stored in the browser (`geoviva:ui:v2`, `acks`) with the signal kinds they covered, so a new kind of problem flags again.

## Not built yet (phase 2)

- Email/push alerts. `src/engine/notify.ts` defines the hook and fires on verdict changes; the default only logs in dev.
  Real delivery needs the backend: run `assessSensors` in the ingest routes, store per-sensor flag state for de-duplication.
- An LLM explainer, fed only the signals (not raw data), with templates as the fallback.

## Adding a metric

Add the field to `SensorReading`, a range in `LIMITS`, and a check in `ownSignals` that pushes a `Signal` with a weight
and plain-language `detail` (written to follow the sensor name, e.g. "reads 7.9 pH, …"), plus an `ACTION` entry if it is a new kind.
