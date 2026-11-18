# Control Luz

Firmware ESP32-C3 para control de iluminación de aula.

- Lee presencia (LD2420), luz (BH1750 x2), temperatura/humedad (SHT30).
- Aplica lógica local de iluminación con histéresis y debounce.
- Publica telemetría por MQTT a la Raspberry Pi.
- Recibe comandos por MQTT (REBOOT, LED_ON, LED_OFF).
- Implementa light sleep para ahorro de energía.
