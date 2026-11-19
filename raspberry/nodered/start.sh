#!/bin/bash
set -e
# Cargar credenciales de .env si existe
if [ -f /data/../.env ]; then
  set -a; . /data/../.env; set +a
fi
if [ -f /.env ]; then
  set -a; . /.env; set +a
fi
# Escribir flows_cred.json con las claves del entorno
if [ -n "$MQTT_NODERED_PASS" ]; then
  cat > /data/flows_cred.json <<CRED
{"br_main":{"user":"nodealert","password":"${MQTT_NODERED_PASS}"}}
CRED
fi
exec /usr/src/node-red/node_modules/.bin/node-red --userDir /data
