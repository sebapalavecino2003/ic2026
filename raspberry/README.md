# Backend — Raspberry Pi (broker MQTT + Node-RED)

Recibe la telemetría del nodo ESP32 por MQTT, la guarda en SQLite y la expone por una API
REST que usa el dashboard (`frontend/`). También reenvía al nodo los comandos que se mandan
desde el dashboard.

```
ESP32 (o simulator.py) ──MQTT──► Mosquitto :1883 ──► Node-RED :1880 ──► SQLite (nodered.db)
        ▲                                               │
        └──────── nodealert/<id>/commands ◄─────────────┤ API REST /api/...
                                                        ▼
                                          frontend (nginx :3001)
```

## Servicios (`docker-compose.yml`)

| Servicio | Imagen | Puerto | Qué hace |
|---|---|---|---|
| `mosquitto` | `eclipse-mosquitto:2.0.20` | 1883 | Broker MQTT con usuario y clave obligatorios y ACL por usuario |
| `nodered` | `nodered/node-red:4.1.1` + `node-red-node-sqlite@2.0.1` | 1880 | Procesa la telemetría, base de datos y API REST |
| `frontend` | ver `frontend/README.md` | 3001 | Dashboard web |

## Contrato MQTT

| Tópico | Sentido | QoS | Formato |
|---|---|---|---|
| `nodealert/<device_id>/telemetry` | ESP32 → broker → Node-RED | 1 | JSON (abajo) |
| `nodealert/<device_id>/commands` | Node-RED → broker → ESP32 | 1 | texto plano |

Telemetría (cada 60 s y apenas cambia la presencia o el relé):

```json
{"device_id":"nodealert-luz01","presencia":1,"luz_ventana_lx":145.2,
 "luz_aula_lx":89.6,"temp_c":24.1,"humedad_pct":55.3,"rele_canal1":0}
```

| Campo | Tipo | Significado | Si el sensor falla |
|---|---|---|---|
| `device_id` | texto | Identificador del nodo | siempre está |
| `presencia` | 0/1 | 1 = sistema activo (hubo gente en los últimos 300 s) | se omite si el radar LD2420 no da datos |
| `luz_ventana_lx` | número | BH1750 de la ventana (lux) | se omite |
| `luz_aula_lx` | número | BH1750 del aula (lux) | se omite |
| `temp_c`, `humedad_pct` | número | SHT30 | se omiten los dos |
| `rele_canal1` | 0/1 | Estado del relé de las luces | siempre está |

Node-RED guarda los campos que faltan como `NULL` (nunca inventa un valor). Descarta (con un aviso en el log) los mensajes que no son JSON o cuyo `device_id` no es válido.

Comandos aceptados: `RELE_ON`, `RELE_OFF` (pasan el nodo a modo manual), `AUTO` (vuelve al modo automático), `REBOOT`, `LED_ON`, `LED_OFF`, `BUZZER_ON`, `BUZZER_OFF` (estos cuatro se aceptan sin efecto en esta versión del hardware).

Usuarios del broker (permisos en `mqtt/aclfile`):

| Usuario | Lo usa | Puede |
|---|---|---|
| `nodealert` | Node-RED | leer `+/telemetry`, escribir `+/commands` |
| `nodealert_esp32` | firmware y `simulator.py` | escribir `+/telemetry`, leer `+/commands` |

## API REST (Node-RED, puerto 1880)

| Método | Endpoint | Respuesta |
|---|---|---|
| GET | `/api/health` | `{"status":"ok",...}` |
| GET | `/api/nodes` | Lista de nodos |
| POST | `/api/nodes` | Registra un nodo (`{"node_id","name"}`) |
| GET / DELETE | `/api/nodes/:node_id` | Ver / borrar un nodo |
| GET | `/api/telemetry/latest` | Última lectura de cada nodo |
| GET | `/api/telemetry/:node_id?limit=N` | Historial (N entero de 1 a 1000) |
| GET | `/api/telemetry/averages` | Promedios |
| POST | `/api/nodes/:node_id/command` | `{"command":"RELE_ON"}` → **202** y lo publica por MQTT |
| GET / POST | `/api/nodes/:node_id/config` | Configuración guardada en la base (el firmware no la lee) |

Validación: `node_id` tiene que ser letras, números, `-` o `_` (máximo 64); un comando fuera de la lista o un `limit` inválido devuelven **400** con el motivo. Así no se pueden inyectar consultas SQL ni publicar en tópicos arbitrarios.

## Cómo levantarlo

Requisitos: Docker Engine con Docker Compose v2.

```bash
cd raspberry
cp .env.example .env      # y cambiar las dos claves
docker compose up -d --build
docker compose ps         # los tres servicios "running"
curl http://localhost:1880/api/health
```

- `MQTT_ESP32_PASS` tiene que ser igual a `MQTT_PASS` en `firmware/control-luz/main/config_local.h`.
- Si falta una clave en `.env`, `docker compose` no arranca y dice cuál falta.
- Las claves no están en ningún archivo del repo: Mosquitto crea los usuarios al arrancar (`mqtt/entrypoint.sh`) y Node-RED escribe su `flows_cred.json` al arrancar (`nodered/start.sh`). `.env`, `flows_cred.json` y la base no se suben (`.gitignore`).

## Probar sin hardware: `simulator.py`

Simula el nodo ESP32 con el mismo contrato que el firmware: mismo tópico, mismas claves JSON, QoS 1, la misma regla de luz que `firmware/control-luz/main/regla_luz.h` (umbrales 60/100 lx, debounce de 2 s, reposo tras 300 s sin gente), responde a los comandos y simula fallas de sensores omitiendo los campos igual que el firmware.

Requiere Python 3.9 o superior.

```bash
cd raspberry
python3 -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt                    # paho-mqtt 2.1.0
export MQTT_ESP32_PASS=<la clave de .env>          # Windows: set MQTT_ESP32_PASS=...
python simulator.py --broker localhost
```

Opciones útiles para una demo rápida:

```bash
python simulator.py --intervalo 5 --delay-off 20 --fail-rate 0.3 --ciclo-luz 60
```

| Opción | Default | Qué cambia |
|---|---|---|
| `--intervalo` | 60 | segundos entre publicaciones periódicas |
| `--delay-off` | 300 | segundos sin presencia hasta el reposo |
| `--fail-rate` | 0.05 | probabilidad de falla de cada sensor por lectura |
| `--prob-cambio-presencia` | 0.02 | probabilidad por segundo de que entre o salga alguien |
| `--ciclo-luz` | 600 | período del ciclo de luz natural simulado |
| `--device-id` | `nodealert-luz01` | id del nodo |
| `--duracion` | 0 (infinito) | segundos de simulación |

Prueba de punta a punta:
1. Con el simulador corriendo, `curl http://localhost:1880/api/telemetry/latest` muestra la última lectura (los sensores que "fallaron" aparecen como `null`).
2. `curl -X POST -H "Content-Type: application/json" -d '{"command":"RELE_ON"}' http://localhost:1880/api/nodes/nodealert-luz01/command` → 202; el simulador imprime `Comando recibido: RELE_ON` y la siguiente telemetría trae `"rele_canal1":1`.
3. Con `{"command":"AUTO"}` vuelve al modo automático.
4. Con `{"command":"CUALQUIERA"}` la API responde 400 y no publica nada.

## Archivos

| Archivo | Para qué |
|---|---|
| `docker-compose.yml` | Los tres servicios, con las claves tomadas de `.env` |
| `.env.example` | Plantilla de `.env` |
| `mqtt/` | Imagen de Mosquitto: configuración, ACL y creación de usuarios |
| `nodered/Dockerfile`, `nodered/start.sh` | Imagen de Node-RED con versión fija y carga de credenciales |
| `nodered/data/settings.js` | Configuración de Node-RED |
| `nodered/data/flows.json` | Flujos (generados, no editar a mano) |
| `generate-flows.js` | Genera `flows.json`: `node generate-flows.js` |
| `simulator.py`, `requirements.txt` | Simulador del nodo ESP32 |
