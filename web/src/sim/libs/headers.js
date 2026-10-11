// What a real Arduino IDE would say for a #include of a Wi-Fi library on a board that does not have it:
//   fatal error: WiFi.h: No such file or directory
const ESP8266_ONLY = ['ESP8266WiFi.h', 'ESP8266WebServer.h', 'ESP8266HTTPClient.h', 'ESP8266mDNS.h', 'ESP8266WiFiMulti.h', 'BlynkSimpleEsp8266.h', 'ESP8266WiFiType.h', 'ESP8266httpUpdate.h'];
const ESP32_ONLY = ['WebServer.h', 'BluetoothSerial.h', 'Preferences.h', 'ESPmDNS.h', 'BlynkSimpleEsp32.h', 'WiFiMulti.h', 'esp_wifi.h', 'esp_now.h', 'esp_sntp.h', 'HTTPUpdate.h', 'SPIFFS.h', 'LittleFS.h'];
const ANY_WIFI = ['WiFi.h', 'WiFiClient.h', 'WiFiClientSecure.h', 'WiFiServer.h', 'WiFiUdp.h', 'WiFiUDP.h', 'HTTPClient.h', 'ArduinoOTA.h', 'WiFiType.h'];
const R4_ONLY = ['WiFiS3.h'];
const NO_BOARD = ['WiFiNINA.h', 'WiFi101.h'];

/** → null, or { message, line, col } for the first header this board does not have. */
export function checkIncludes(board, includes) {
  const fam = board.family;
  const isEsp32 = fam === 'esp32', isEsp8266 = fam === 'esp8266', isR4 = !!board.wifi && !isEsp32 && !isEsp8266;
  const wifi = isEsp32 || isEsp8266 || isR4;
  for (const inc of includes || []) {
    const name = inc.name.replace(/^.*\//, '');
    let missing = false;
    if (ANY_WIFI.includes(name)) missing = !wifi;
    else if (ESP8266_ONLY.includes(name)) missing = !isEsp8266;
    else if (ESP32_ONLY.includes(name)) missing = !isEsp32;
    else if (R4_ONLY.includes(name)) missing = !isR4;
    else if (NO_BOARD.includes(name)) missing = true;
    if (missing) {
      let hint = '';
      if (!wifi) hint = ' — this board has no Wi-Fi: use an ESP32, a NodeMCU (ESP8266) or an Arduino Uno R4 WiFi';
      else if (isEsp32 && ESP8266_ONLY.includes(name)) hint = ` — ${name} is for the ESP8266; the ESP32 uses the library without "ESP8266" in its name (WiFi.h, HTTPClient.h, WebServer.h …)`;
      else if (isEsp8266 && ESP32_ONLY.includes(name)) hint = ` — ${name} is an ESP32 library (the ESP8266 has its own, e.g. ESP8266WebServer.h, ESP8266mDNS.h)`;
      else if (isR4 && (ESP8266_ONLY.includes(name) || ESP32_ONLY.includes(name))) hint = ' — the Uno R4 WiFi uses WiFiS3.h';
      return { message: `fatal error: ${name}: No such file or directory (compilation terminated)${hint}`, line: inc.line, col: 0 };
    }
  }
  return null;
}
