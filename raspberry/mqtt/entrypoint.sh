#!/bin/sh
# Create password file if not exists
if [ ! -f /mosquitto/data/passwordfile ]; then
    mosquitto_passwd -b -c /mosquitto/data/passwordfile nodealert nodealert_secret
    mosquitto_passwd -b /mosquitto/data/passwordfile nodealert_esp32 CAMBIAR_PASSWORD_ESP32
fi
exec "$@"
