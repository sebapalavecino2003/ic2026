#!/bin/sh
if [ ! -f /mosquitto/data/passwordfile ]; then
    umask 022
    mosquitto_passwd -b -c /mosquitto/data/passwordfile nodealert "${MQTT_NODERED_PASS}"
    mosquitto_passwd -b /mosquitto/data/passwordfile nodealert_esp32 "${MQTT_ESP32_PASS}"
    chmod 0644 /mosquitto/data/passwordfile
fi
exec "$@"
