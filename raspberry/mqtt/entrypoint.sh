#!/bin/sh

PASSWORDFILE=/mosquitto/config/passwordfile

if [ ! -f "$PASSWORDFILE" ]; then
  mosquitto_passwd -c -b "$PASSWORDFILE" nodealert "nodealert_secret"
  mosquitto_passwd -b "$PASSWORDFILE" nodealert_esp32 "test_password"
  chown 1883:1883 "$PASSWORDFILE"
  echo "Password file created with users 'nodealert' and 'nodealert_esp32'"
else
  echo "Password file already exists, skipping creation"
fi

chown -R 1883:1883 /mosquitto/data 2>/dev/null || true

exec "$@"
