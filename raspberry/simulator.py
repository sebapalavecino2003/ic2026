#!/usr/bin/env python3
"""
Simulador del nodo ESP32-C3 (firmware control-luz) para NodeAlert IoT.
Publica y escucha EXACTAMENTE lo mismo que el firmware real
(firmware/control-luz/main/main.c), para probar el contrato MQTT sin hardware:
  Publica   nodealert/<device_id>/telemetry   QoS 1, sin retain, JSON:
            {"device_id", "presencia", "luz_ventana_lx", "luz_aula_lx",
             "temp_c", "humedad_pct", "rele_canal1"}
            - cada --intervalo segundos y apenas cambia la presencia o el rele;
            - si un sensor falla, su campo NO se manda (como el firmware):
              radar sin datos -> sin "presencia"; BH1750 -> sin su "luz_*";
              SHT30 -> sin "temp_c" ni "humedad_pct".
  Escucha   nodealert/<device_id>/commands    QoS 1, texto plano:
            RELE_ON / RELE_OFF (modo manual), AUTO, REBOOT, LED_ON, LED_OFF,
            BUZZER_ON, BUZZER_OFF (aceptados sin efecto); cualquier otro se
            registra como "Comando desconocido", igual que el firmware.
La luz se decide con la misma regla que firmware/control-luz/main/regla_luz.h
(umbrales 60/100 lx, debounce de 2 s, reposo tras --delay-off sin gente).
Uso:
  pip install -r requirements.txt
  python simulator.py --broker localhost
  (o exportar MQTT_ESP32_PASS y omitir --password)
"""
import argparse
import json
import math
import os
import random
import sys
import time
import paho.mqtt.client as mqtt

UMBRAL_BAJO_LX = 60
UMBRAL_ALTO_LX = 100
DEBOUNCE_S = 2.0
COMANDOS_SIN_EFECTO = {"LED_ON", "LED_OFF", "BUZZER_ON", "BUZZER_OFF"}

def regla_deseado(sistema_activo, ok_ventana, lux_ventana, ok_aula, lux_aula,
                  actual, umbral_bajo=UMBRAL_BAJO_LX, umbral_alto=UMBRAL_ALTO_LX):
    if not sistema_activo:
        return False
    if ok_ventana:
        if lux_ventana > umbral_alto:
            return False
        if lux_ventana >= umbral_bajo:
            return actual
        if actual:
            return True
        if not ok_aula:
            return True
        return lux_aula < umbral_alto
    if ok_aula and not actual and lux_aula < umbral_bajo:
        return True
    return actual

class NodoSimulado:
    def __init__(self, args):
        self.args = args
        self.topic_tel = f"nodealert/{args.device_id}/telemetry"
        self.topic_cmd = f"nodealert/{args.device_id}/commands"
        self.t0 = time.monotonic()
        self.reiniciar_estado()

    def reiniciar_estado(self):
        ahora = time.monotonic()
        self.luz_encendida = False
        self.manual = False
        self.candidato = False
        self.desde_candidato = ahora
        self.sistema_activo = True
        self.ultima_presencia = ahora
        self.persona = False
        self.publicar_ya = True
        self.ultima_publicacion = 0.0

    def leer_sensores(self):
        a = self.args
        t = time.monotonic() - self.t0
        natural = max(0.0, 150 + 150 * math.sin(2 * math.pi * t / a.ciclo_luz))
        lux_ventana = natural + random.uniform(-5, 5)
        lux_aula = 0.6 * natural + (180 if self.luz_encendida else 0) + random.uniform(-5, 5)
        if random.random() < a.prob_cambio_presencia:
            self.persona = not self.persona
        lect = {
            "radar_ok": random.random() >= a.fail_rate,
            "ventana_ok": random.random() >= a.fail_rate,
            "aula_ok": random.random() >= a.fail_rate,
            "sht_ok": random.random() >= a.fail_rate,
            "lux_ventana": round(max(0.0, lux_ventana), 1),
            "lux_aula": round(max(0.0, lux_aula), 1),
            "temp_c": round(24 + 2 * math.sin(2 * math.pi * t / 600) + random.uniform(-0.3, 0.3), 1),
            "humedad_pct": round(55 + 5 * math.sin(2 * math.pi * t / 900) + random.uniform(-1, 1), 1),
        }
        return lect

    def paso(self, lect):
        ahora = time.monotonic()
        if lect["radar_ok"] and self.persona:
            self.ultima_presencia = ahora
        activo_antes = self.sistema_activo
        self.sistema_activo = (ahora - self.ultima_presencia) <= self.args.delay_off
        if self.sistema_activo != activo_antes:
            self.publicar_ya = True
            print(">> Hay gente: sistema ACTIVO" if self.sistema_activo else ">> Sin gente: REPOSO")
        if self.manual:
            return
        deseado = regla_deseado(self.sistema_activo, lect["ventana_ok"], lect["lux_ventana"],
                                lect["aula_ok"], lect["lux_aula"], self.luz_encendida)
        if deseado == self.luz_encendida:
            self.candidato = deseado
        elif deseado != self.candidato:
            self.candidato = deseado
            self.desde_candidato = ahora
        elif ahora - self.desde_candidato >= DEBOUNCE_S:
            self.luz_encendida = deseado
            self.publicar_ya = True
            print(f">> RELE {'ON' if deseado else 'off'}")

    def armar_payload(self, lect):
        p = {"device_id": self.args.device_id}
        if lect["radar_ok"]:
            p["presencia"] = 1 if self.sistema_activo else 0
        if lect["ventana_ok"]:
            p["luz_ventana_lx"] = lect["lux_ventana"]
        if lect["aula_ok"]:
            p["luz_aula_lx"] = lect["lux_aula"]
        if lect["sht_ok"]:
            p["temp_c"] = lect["temp_c"]
            p["humedad_pct"] = lect["humedad_pct"]
        p["rele_canal1"] = 1 if self.luz_encendida else 0
        return p

    def on_message(self, client, userdata, msg):
        cmd = msg.payload.decode("utf-8", errors="replace").strip()
        print(f"Comando recibido: {cmd}")
        if cmd == "REBOOT":
            print(">> Reinicio simulado")
            self.reiniciar_estado()
        elif cmd == "RELE_ON":
            self.manual, self.luz_encendida, self.publicar_ya = True, True, True
        elif cmd == "RELE_OFF":
            self.manual, self.luz_encendida, self.publicar_ya = True, False, True
        elif cmd == "AUTO":
            self.manual, self.publicar_ya = False, True
            print("Modo automatico reanudado")
        elif cmd in COMANDOS_SIN_EFECTO:
            pass
        else:
            print(f"Comando desconocido: {cmd}")

def main():
    ap = argparse.ArgumentParser(description="Simulador del nodo ESP32 control-luz")
    ap.add_argument("--broker", default="localhost")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--user", default="nodealert_esp32")
    ap.add_argument("--password", default=os.environ.get("MQTT_ESP32_PASS"),
                    help="clave del usuario nodealert_esp32 (default: variable MQTT_ESP32_PASS)")
    ap.add_argument("--device-id", default="nodealert-luz01")
    ap.add_argument("--intervalo", type=float, default=60.0,
                    help="segundos entre publicaciones periodicas (firmware: 60)")
    ap.add_argument("--delay-off", type=float, default=300.0,
                    help="segundos sin presencia hasta el reposo (firmware: 300)")
    ap.add_argument("--fail-rate", type=float, default=0.05,
                    help="probabilidad de que cada sensor falle en una lectura (0 a 1)")
    ap.add_argument("--prob-cambio-presencia", type=float, default=0.02,
                    help="probabilidad por segundo de que entre o salga alguien")
    ap.add_argument("--ciclo-luz", type=float, default=600.0,
                    help="periodo en segundos del ciclo de luz natural simulado")
    ap.add_argument("--duracion", type=float, default=0, help="segundos de simulacion (0 = infinito)")
    args = ap.parse_args()
    if not args.password:
        sys.exit("Falta la clave: --password o variable MQTT_ESP32_PASS (ver raspberry/.env)")
    nodo = NodoSimulado(args)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{args.device_id}")
    client.username_pw_set(args.user, args.password)
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    def on_connect(c, userdata, flags, reason_code, properties):
        if reason_code.is_failure:
            print(f"Conexion rechazada por el broker: {reason_code}")
            return
        print(f"Conectado a {args.broker}:{args.port}; escuchando {nodo.topic_cmd}")
        c.subscribe(nodo.topic_cmd, qos=1)
        nodo.publicar_ya = True
    client.on_connect = on_connect
    client.on_message = nodo.on_message
    client.connect_async(args.broker, args.port, keepalive=60)
    client.loop_start()
    fin = time.monotonic() + args.duracion if args.duracion > 0 else None
    try:
        while fin is None or time.monotonic() < fin:
            lect = nodo.leer_sensores()
            nodo.paso(lect)
            vencio = time.monotonic() - nodo.ultima_publicacion >= args.intervalo
            if client.is_connected() and (nodo.publicar_ya or vencio):
                payload = nodo.armar_payload(lect)
                client.publish(nodo.topic_tel, json.dumps(payload, separators=(",", ":")), qos=1, retain=False)
                print(f"-> {nodo.topic_tel} {payload}")
                nodo.ultima_publicacion = time.monotonic()
                nodo.publicar_ya = False
            time.sleep(1.0)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
