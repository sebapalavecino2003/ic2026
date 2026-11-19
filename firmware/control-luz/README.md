# Control Luz — Firmware ESP32-C3

Firmware para el nodo de iluminación NodeAlert IoT. Lee presencia, luz, temperatura y
humedad, y controla un relé de iluminación con lógica local. Publica telemetría por
MQTT y recibe comandos desde la Raspberry Pi.

## Hardware

| GPIO | Componente |
|---|---|
| 0 | Relé (activo en bajo) |
| 1 | LED de presencia |
| 4 | I2C SDA (BH1750, SHT30) |
| 5 | I2C SCL |
| 6 | UART TX (LD2420 RX) |
| 7 | UART RX (LD2420 TX) |

Sensores: LD2420 (radar), BH1750 ×2 (ventana/aula), SHT30.

## Lógica de iluminación

- Sin gente (tras `delay_off_s` = 300 s) → luz OFF.
- Con gente, ventana > 100 lx → OFF (luz natural).
- Con gente, ventana < 60 lx:
  - Foco ya encendido → mantener.
  - Foco apagado y aula < 100 lx → ON.
  - Foco apagado y aula >= 100 lx → OFF.
- Ventana entre 60–100 lx → mantener (histéresis).
- Debounce de 2 s antes de conmutar el relé.

## Configuración

Copiar `main/config_local.ejemplo.h` como `main/config_local.h` y completar:

```c
#define WIFI_SSID "TU_WIFI"
#define WIFI_PASS "TU_PASSWORD"
#define MQTT_BROKER_URI "mqtt://IP_RPI:1883"
#define MQTT_USER "nodealert_esp32"
#define MQTT_PASS "TU_PASSWORD_MQTT"
#define DEVICE_ID "nodealert-luz01"
```

## Compilación y flasheo

```bash
idf.py set-target esp32c3
idf.py build
idf.py -p PUERTO flash monitor
```

## Comandos MQTT (tópico `nodealert/<id>/commands`, texto plano)

- `REBOOT` — reinicia el ESP32.
- `RELE_ON` / `RELE_OFF` — control manual del relé (activa modo manual).
- `AUTO` — reanuda la lógica automática.
- `LED_ON` / `LED_OFF` — control del LED de presencia.

## Telemetría

Tópico: `nodealert/<id>/telemetry` (QoS 1).

```json
{"device_id":"nodealert-luz01","presencia":0/1,"luz_ventana_lx":..,"luz_aula_lx":..,"temp_c":..,"humedad_pct":..,"rele_canal1":0/1}
```

## Pruebas

```bash
cd tests
make
./test_regla
```

13 verificaciones, 0 fallos.

## Limitaciones

- Umbrales fijos en firmware (60/100 lx, ajustables por comando `SET_UMBRALES`).
- Sin deep sleep (monitoreo en tiempo real priorizado).
- Un solo nodo implementado.
