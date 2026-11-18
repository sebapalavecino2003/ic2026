# Frontend — dashboard NodeAlert IoT

Interfaz web del sistema: muestra las mediciones de cada nodo y permite mandarle comandos.
Es una aplicación React que consume la API REST de Node-RED; no habla MQTT directamente.

## Qué hace

| Página | Ruta | Qué muestra / permite |
|---|---|---|
| Dashboard | `/` | Cantidad de nodos en línea, fuera de línea y totales; últimas lecturas de cada nodo |
| Nodos | `/nodes` | Lista de nodos registrados; alta y baja de nodos |
| Detalle de nodo | `/nodes/:nodeId` | Estado, valores actuales, gráficos de la telemetría y botones de comando (relé, modo automático, reinicio) |

Los nombres que el usuario le pone a cada nodo se guardan solo en su navegador
(`localStorage`, ver `src/localNames.js`).

## Cómo se conecta con el resto

```
navegador ──HTTP──► nginx (contenedor frontend, puerto 3001)
                      ├── /        → archivos de la app (build de Vite)
                      └── /api/... → proxy a Node-RED (http://nodered:1880)
```

Todas las llamadas están en `src/api.js` y van a `/api`:

| Método | Endpoint | Uso |
|---|---|---|
| GET | `/api/health` | Estado del backend |
| GET / POST | `/api/nodes` | Listar / registrar nodos |
| GET / DELETE | `/api/nodes/:nodeId` | Ver / borrar un nodo |
| GET | `/api/telemetry/latest` | Última lectura de cada nodo |
| GET | `/api/telemetry/:nodeId?limit=N` | Historial de un nodo (gráficos) |
| GET | `/api/telemetry/averages` | Promedios |
| POST | `/api/nodes/:nodeId/command` | Enviar un comando (`{"command": "RELE_ON"}`, etc.); Node-RED lo publica por MQTT |
| GET / POST | `/api/nodes/:nodeId/config` | Leer / enviar configuración del nodo |

## Versiones

| Herramienta | Versión |
|---|---|
| Node.js (imagen de build) | 20.18.0 (`node:20.18.0-alpine`) |
| nginx (imagen final) | 1.27.2 (`nginx:1.27.2-alpine`) |
| React / React DOM | 18.3.1 |
| React Router | 6.30.6 |
| Recharts | 3.10.1 |
| Axios | 1.20.0 |
| Vite | 5.4.21 |

Las versiones están fijas en `package.json` y `package-lock.json`, y la imagen instala con
`npm ci`, así que siempre se construye exactamente lo mismo.

## Cómo levantarlo

**Con el resto del sistema (lo normal):** desde `raspberry/`, `docker compose up -d --build`
(ver el README principal). Queda en `http://<IP>:3001`.

**Solo el frontend, para desarrollar** (necesita Node.js 20 y Node-RED corriendo en
`localhost:1880`):

```bash
cd raspberry/frontend
npm ci
npm run dev        # http://localhost:5173, con proxy de /api a localhost:1880
```

## Archivos

| Archivo | Para qué |
|---|---|
| `src/main.jsx` | Punto de entrada de React |
| `src/App.jsx` | Rutas y layout |
| `src/api.js` | Cliente de la API REST |
| `src/localNames.js` | Nombres locales de los nodos |
| `src/pages/` | Dashboard, Nodos y Detalle de nodo |
| `src/App.css`, `src/index.css` | Estilos |
| `vite.config.js` | Configuración de Vite (proxy de desarrollo) |
| `nginx.conf` | Servidor estático + proxy de `/api` a Node-RED |
| `Dockerfile` | Build con Node y imagen final con nginx |
