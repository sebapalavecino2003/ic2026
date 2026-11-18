#!/usr/bin/env python3
"""Simulador del nodo ESP32 para NodeAlert IoT."""

import argparse
import json
import random
import subprocess
import time

def make_payload(fail_sensor=False):
    if fail_sensor:
        return {
            "device_id": "nodealert-luz01",
            "presencia": random.choice([0, 1]),
            "rele_canal1": random.choice([0, 1]),
        }
    return {
        "device_id": "nodealert-luz01",
        "presencia": random.choice([0, 1]),
        "luz_ventana_lx": round(random.uniform(0, 300), 1),
        "luz_aula_lx": round(random.uniform(0, 200), 1),
        "temp_c": round(random.uniform(18, 35), 1),
        "humedad_pct": random.randint(30, 80),
        "rele_canal1": random.choice([0, 1]),
    }

def publish(broker, port, user, password, topic, payload):
    msg = json.dumps(payload)
    subprocess.run([
        "mosquitto_pub", "-h", broker, "-p", str(port),
        "-u", user, "-P", password,
        "-t", topic, "-m", msg, "-q", "1",
    ], check=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--broker", default="192.168.0.126")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--count", type=int, default=0, help="0 = infinito")
    ap.add_argument("--fail-rate", type=float, default=0.2)
    args = ap.parse_args()

    topic = "nodealert/nodealert-luz01/telemetry"
    n = 0
    while args.count == 0 or n < args.count:
        fail = random.random() < args.fail_rate
        payload = make_payload(fail)
        print(payload)
        publish(args.broker, args.port, "nodealert_esp32", "test_password", topic, payload)
        n += 1
        time.sleep(args.interval)

if __name__ == "__main__":
    main()
