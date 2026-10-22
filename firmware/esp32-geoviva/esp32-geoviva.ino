// GeoViva ESP32 soil sensor — example firmware (NOT field-tested; no hardware has been built).
//
// Hardware: ESP32 dev board, capacitive soil moisture sensor v1.2/v2.0 on an ADC1 pin,
// DS18B20 waterproof probe on a GPIO with a 4.7 kΩ pull-up to 3.3 V, optional battery divider.
// Libraries (Arduino Library Manager): OneWire, DallasTemperature. Core: Arduino-ESP32 2.x/3.x.
//
// Flow:
//   1. Factory flashes DEVICE_ID + FACTORY_SECRET (from POST /api/admin/devices) into secrets.h and
//      prints the claim code on the label.
//   2. Farmer claims the device in the app with the label code.
//   3. On boot the device exchanges FACTORY_SECRET for a device token at /api/ingest/esp32/token
//      (409 until claimed; it retries next wake) and keeps the token in NVS (Preferences).
//   4. Every 15 minutes: wake, read sensors, POST JSON to /api/ingest/esp32 with the token, deep sleep.
//      A 401 clears the token so the next wake fetches a new one (e.g. after the farmer removed it).
//
// Create secrets.h next to this file (do not commit it):
//   #define WIFI_SSID      "farm-wifi"
//   #define WIFI_PASSWORD  "..."
//   #define DEVICE_ID      "esp32-0001"
//   #define FACTORY_SECRET "..."            // from the provisioning response, shown once
//   #define API_BASE       "https://geoviva-tau.vercel.app"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>
#include "secrets.h"

// ---------- pins & calibration (tune per sensor batch: the physical world needs it) ----------
const int MOISTURE_PIN = 34;      // ADC1 only (ADC2 is unusable while Wi-Fi is on)
const int SENSOR_POWER_PIN = 25;  // powers the probe only while measuring (less corrosion, less drain)
const int ONEWIRE_PIN = 4;
const int BATTERY_PIN = 35;       // via 100k/100k divider; set HAS_BATTERY false if USB powered
const bool HAS_BATTERY = true;

// Capacitive sensors read HIGH when dry. Calibrate: raw value in dry air and in a cup of water,
// then (better) against a gravimetric soil sample for the actual field soil.
const int ADC_DRY = 3200;          // raw reading in air
const int ADC_WET = 1350;          // raw reading in water
const float VWC_AT_WET = 45.0;     // % volumetric water the "wet" point represents in saturated soil
const float BATTERY_EMPTY_V = 3.3; // LiPo cut-off under load
const float BATTERY_FULL_V = 4.15;

const float DEPTH_CM = 15.0;               // install depth reported with each reading
const uint64_t SLEEP_SECONDS = 15 * 60;    // server accepts at most one reading per 60 s
const uint32_t WIFI_TIMEOUT_MS = 15000;

// Root CA for the API host (Vercel serves Let's Encrypt / GTS certificates). Pin the ISRG Root X1
// PEM here for production. setInsecure() below is ONLY a development fallback.
const char* ROOT_CA = nullptr;

OneWire oneWire(ONEWIRE_PIN);
DallasTemperature ds18b20(&oneWire);
Preferences prefs;

// Mean of several ADC samples, in raw units.
int readAdcAvg(int pin, int samples = 16) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(pin);
    delay(5);
  }
  return sum / samples;
}

float readMoisturePercent() {
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(200);  // let the probe's oscillator settle
  int raw = readAdcAvg(MOISTURE_PIN);
  digitalWrite(SENSOR_POWER_PIN, LOW);
  // Linear map dry->0 %, wet->VWC_AT_WET %. ponytail: linear; replace with a per-soil curve if calibration shows it is not.
  float pct = (float)(ADC_DRY - raw) / (float)(ADC_DRY - ADC_WET) * VWC_AT_WET;
  return constrain(pct, 0.0f, 100.0f);
}

// Returns NAN when no probe answers.
float readSoilTempC() {
  ds18b20.begin();
  ds18b20.requestTemperatures();
  float t = ds18b20.getTempCByIndex(0);
  return (t == DEVICE_DISCONNECTED_C || t < -40 || t > 85) ? NAN : t;
}

// Returns -1 when not measured.
float readBatteryPercent() {
  if (!HAS_BATTERY) return -1;
  float v = analogReadMilliVolts(BATTERY_PIN) * 2.0f / 1000.0f;  // undo the 1:2 divider
  return constrain((v - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100.0f, 0.0f, 100.0f);
}

bool connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) delay(200);
  return WiFi.status() == WL_CONNECTED;
}

// NTP time so readings carry a real timestamp; falls back to server time if it fails.
bool syncClock(char* isoOut, size_t len) {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm t;
  if (!getLocalTime(&t, 5000)) return false;
  strftime(isoOut, len, "%Y-%m-%dT%H:%M:%SZ", &t);
  return true;
}

// POST JSON; returns HTTP status (negative on transport error) and fills `response`.
int postJson(const String& url, const String& body, const String& bearer, String& response) {
  WiFiClientSecure client;
  if (ROOT_CA) client.setCACert(ROOT_CA);
  else client.setInsecure();  // DEV ONLY: no server certificate check
  HTTPClient http;
  if (!http.begin(client, url)) return -1;
  http.addHeader("Content-Type", "application/json");
  if (bearer.length()) http.addHeader("Authorization", "Bearer " + bearer);
  http.setTimeout(10000);
  int code = http.POST(body);
  response = http.getString();
  http.end();
  return code;
}

// Pulls a string field out of a small flat JSON response (avoids an ArduinoJson dependency).
String jsonField(const String& json, const char* key) {
  String needle = String("\"") + key + "\":\"";
  int i = json.indexOf(needle);
  if (i < 0) return "";
  i += needle.length();
  int j = json.indexOf('"', i);
  return j < 0 ? "" : json.substring(i, j);
}

String loadOrFetchToken() {
  String token = prefs.getString("token", "");
  if (token.length()) return token;
  String body = String("{\"device_id\":\"") + DEVICE_ID + "\",\"factory_secret\":\"" + FACTORY_SECRET + "\"}";
  String resp;
  int code = postJson(String(API_BASE) + "/api/ingest/esp32/token", body, "", resp);
  if (code == 201) {
    token = jsonField(resp, "token");
    if (token.length()) prefs.putString("token", token);
  } else if (code == 409) {
    Serial.println("Not claimed yet: enter the label code in the GeoViva app.");
  } else {
    Serial.printf("Token request failed: %d %s\n", code, resp.c_str());
  }
  return token;
}

void sleepNow() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup(SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(MOISTURE_PIN, ADC_11db);  // full 0–3.3 V range
  prefs.begin("geoviva", false);

  // Measure before Wi-Fi: radio noise disturbs the ADC.
  float moisture = readMoisturePercent();
  float tempC = readSoilTempC();
  float battery = readBatteryPercent();
  Serial.printf("moisture=%.1f%% temp=%.2fC battery=%.0f%%\n", moisture, tempC, battery);

  if (!connectWifi()) {
    Serial.println("Wi-Fi failed; sleeping.");
    sleepNow();
  }

  String token = loadOrFetchToken();
  if (!token.length()) sleepNow();

  char iso[25] = "";
  bool haveTime = syncClock(iso, sizeof(iso));

  String body = String("{\"device_id\":\"") + DEVICE_ID + "\"";
  if (haveTime) body += String(",\"timestamp\":\"") + iso + "\"";
  body += ",\"soil_moisture_percent\":" + String(moisture, 1);
  if (!isnan(tempC)) body += ",\"soil_temperature_c\":" + String(tempC, 2);
  if (battery >= 0) body += ",\"battery_percent\":" + String(battery, 0);
  body += ",\"depth_cm\":" + String(DEPTH_CM, 0) + "}";

  String resp;
  int code = postJson(String(API_BASE) + "/api/ingest/esp32", body, token, resp);
  Serial.printf("ingest -> %d %s\n", code, resp.c_str());
  if (code == 401) prefs.remove("token");  // revoked or rotated: fetch a new one next wake
  prefs.end();
  sleepNow();
}

void loop() {}  // never reached: the device deep-sleeps at the end of setup()
