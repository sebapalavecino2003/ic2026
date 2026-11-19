/*
 * Control Luz: logica local de iluminacion + publicacion MQTT a Raspberry Pi.
 */
#include <stdio.h>
#include <string.h>
#include <math.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "mqtt_client.h"
#include "nvs_flash.h"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "cJSON.h"
#include "tiempo.h"
#include "regla_luz.h"
#include "bh1750.h"
#include "sht31.h"
#include "ld2420.h"

#if !defined(CONFIG_IDF_TARGET_ESP32C3)
#error "Este firmware es para placa ESP32-C3 SuperMini: elegi el target esp32c3"
#endif

#if __has_include("config_local.h")
#include "config_local.h"
#endif

// ===== Pines =====
#ifndef LD2420_RX
#define LD2420_RX 7
#endif
#ifndef LD2420_TX
#define LD2420_TX 6
#endif
#ifndef LD2420_BAUD
#define LD2420_BAUD 115200
#endif
#ifndef LED_PRESENCIA_PIN
#define LED_PRESENCIA_PIN 1
#endif
#ifndef LED_PRESENCIA_INVERTIDO
#define LED_PRESENCIA_INVERTIDO false
#endif
#ifndef I2C_SDA
#define I2C_SDA 4
#endif
#ifndef I2C_SCL
#define I2C_SCL 5
#endif
#ifndef RELE_PIN
#define RELE_PIN 0
#endif
#ifndef RELE_ACTIVO_EN_LOW
#define RELE_ACTIVO_EN_LOW true
#endif

// ===== WiFi / MQTT (sobrescribibles en config_local.h) =====
#ifndef WIFI_SSID
#error "Definir WIFI_SSID en config_local.h"
#endif
#ifndef WIFI_PASS
#error "Definir WIFI_PASS en config_local.h"
#endif
#ifndef MQTT_BROKER_URI
#error "Definir MQTT_BROKER_URI en config_local.h"
#endif
#ifndef MQTT_USER
#error "Definir MQTT_USER en config_local.h"
#endif
#ifndef MQTT_PASS
#error "Definir MQTT_PASS en config_local.h"
#endif
#ifndef DEVICE_ID
#error "Definir DEVICE_ID en config_local.h"
#endif

#define DEBOUNCE_MS 2000
#define USAR_PRESENCIA 1

#define DIST_MIN_CM 20
#define DIST_MAX_CM 400
#define DIST_HIST_CM 20

#define UMBRAL_BAJO_DEFECTO 60
#define UMBRAL_ALTO_DEFECTO 100
#define DELAY_OFF_DEFECTO_S 300
#define INTERVALO_PUBLICACION_S 60

static const char *TAG = "control-luz";

static const uint32_t umbral_bajo_lx = UMBRAL_BAJO_DEFECTO;
static const uint32_t umbral_alto_lx = UMBRAL_ALTO_DEFECTO;
static const uint32_t delay_off_s = DELAY_OFF_DEFECTO_S;

// ===== Estado =====
static i2c_master_bus_handle_t i2c_bus;
static bh1750_t bh_ventana;
static bh1750_t bh_aula;
static sht31_t sht;
static ld2420_t radar;

static bool bh_ventana_ok = false, bh_aula_ok = false, sht_ok = false;
static float lux_ventana = -1.0f;
static float lux_aula = -1.0f;
static float temp_c = NAN;
static float humedad_pct = NAN;

static bool luz_encendida = false;
static bool manual_override = false;
static bool candidato = false;
static uint32_t desde_candidato = 0;

static bool en_ventana = false;
static bool presencia = false;
static int distancia_cm = -1;
static uint32_t ultima_presencia_ms = 0;
static bool sistema_activo = false;

static uint32_t ultima_lectura = 0;
static bool primera_lectura = true;

static esp_mqtt_client_handle_t mqtt_client = NULL;
static bool wifi_ok = false;
static bool mqtt_ok = false;
static uint32_t ultima_publicacion = 0;
static bool publicar_ya = true;

// ===== Rele y LED =====
static void escribir_rele(bool encender)
{
    if (RELE_PIN < 0) return;
    int nivel = RELE_ACTIVO_EN_LOW ? !encender : encender;
    gpio_set_level((gpio_num_t)RELE_PIN, nivel ? 1 : 0);
}

static void led_presencia(bool prendir)
{
    if (LED_PRESENCIA_PIN < 0) return;
    int nivel = LED_PRESENCIA_INVERTIDO ? !prendir : prendir;
    gpio_set_level((gpio_num_t)LED_PRESENCIA_PIN, nivel ? 1 : 0);
}

static void configurar_gpio_salida(int pin, bool nivel_inicial)
{
    if (pin < 0) return;
    gpio_config_t g = {
        .pin_bit_mask = 1ULL << pin,
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_set_level((gpio_num_t)pin, nivel_inicial ? 1 : 0);
    gpio_config(&g);
    gpio_set_level((gpio_num_t)pin, nivel_inicial ? 1 : 0);
}

static void controlar_rele(void)
{
    if (manual_override) return;
    bool deseado = regla_deseado(sistema_activo, bh_ventana_ok, lux_ventana,
                                 bh_aula_ok, lux_aula, luz_encendida,
                                 umbral_bajo_lx, umbral_alto_lx);
    if (deseado == luz_encendida) {
        candidato = deseado;
    } else if (deseado != candidato) {
        candidato = deseado;
        desde_candidato = aura_millis();
    } else if (aura_millis() - desde_candidato >= DEBOUNCE_MS) {
        luz_encendida = deseado;
        escribir_rele(luz_encendida);
        publicar_ya = true;
        ESP_LOGI(TAG, ">> RELE %s", luz_encendida ? "ON" : "off");
    }
}

// ===== Sensores =====
static float leer_bh(bh1750_t *s, bool *ok, uint8_t dir, uint32_t *ultimo_intento)
{
    if (!*ok) {
        if (*ultimo_intento != 0 && aura_millis() - *ultimo_intento < 30000) return -1.0f;
        *ultimo_intento = aura_millis();
        *ok = bh1750_init(s, i2c_bus, dir);
        if (!*ok) return -1.0f;
    }
    float v = bh1750_leer_lux(s);
    if (v < 0) *ok = false;
    return v;
}

static void leer_sht(void)
{
    static uint32_t ultimo_intento_sht = 0;
    if (!sht_ok) {
        if (ultimo_intento_sht != 0 && aura_millis() - ultimo_intento_sht < 30000) {
            temp_c = NAN; humedad_pct = NAN; return;
        }
        ultimo_intento_sht = aura_millis();
        sht_ok = sht31_init(&sht, i2c_bus, 0x44);
        if (!sht_ok) { temp_c = NAN; humedad_pct = NAN; return; }
    }
    float t, h;
    if (!sht31_leer(&sht, &t, &h)) { sht_ok = false; temp_c = NAN; humedad_pct = NAN; return; }
    temp_c = t;
    humedad_pct = h;
}

static double redondear1(float v)
{
    return round((double)v * 10.0) / 10.0;
}

// ===== WiFi / MQTT =====
static void mqtt_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;
    switch (event_id) {
        case MQTT_EVENT_CONNECTED:
            mqtt_ok = true;
            ESP_LOGI(TAG, "MQTT conectado");
            {
                char topic[128];
                snprintf(topic, sizeof(topic), "nodealert/%s/commands", DEVICE_ID);
                esp_mqtt_client_subscribe(mqtt_client, topic, 1);
            }
            break;
        case MQTT_EVENT_DISCONNECTED:
            mqtt_ok = false;
            ESP_LOGW(TAG, "MQTT desconectado");
            break;
        case MQTT_EVENT_DATA: {
            char topic[128];
            int tlen = event->topic_len < (int)sizeof(topic)-1 ? event->topic_len : (int)sizeof(topic)-1;
            memcpy(topic, event->topic, tlen);
            topic[tlen] = '\0';
            char data[128];
            int dlen = event->data_len < (int)sizeof(data)-1 ? event->data_len : (int)sizeof(data)-1;
            memcpy(data, event->data, dlen);
            data[dlen] = '\0';
            // trim
            char *start = data;
            while (*start == ' ' || *start == '\t' || *start == '\r' || *start == '\n') start++;
            char *end = start + strlen(start);
            while (end > start && (end[-1] == ' ' || end[-1] == '\t' || end[-1] == '\r' || end[-1] == '\n')) *--end = '\0';
            ESP_LOGI(TAG, "Comando recibido: %s", start);
            if (strcmp(start, "REBOOT") == 0) {
                esp_restart();
            } else if (strcmp(start, "RELE_ON") == 0) {
                bool prev = luz_encendida;
                manual_override = true;
                luz_encendida = true;
                escribir_rele(luz_encendida);
                publicar_ya = true;
                ESP_LOGI(TAG, "RELE: %d -> %d (GPIO %d)", prev, luz_encendida, RELE_PIN);
            } else if (strcmp(start, "RELE_OFF") == 0) {
                bool prev = luz_encendida;
                manual_override = true;
                luz_encendida = false;
                escribir_rele(luz_encendida);
                publicar_ya = true;
                ESP_LOGI(TAG, "RELE: %d -> %d (GPIO %d)", prev, luz_encendida, RELE_PIN);
            } else if (strcmp(start, "AUTO") == 0) {
                manual_override = false;
                publicar_ya = true;
                ESP_LOGI(TAG, "Modo automatico reanudado");
            } else if (strcmp(start, "LED_ON") == 0) {
                led_presencia(true);
            } else if (strcmp(start, "LED_OFF") == 0) {
                led_presencia(false);
            } else if (strcmp(start, "BUZZER_ON") == 0) {
                if (RELE_PIN >= 0) { /* no buzzer pin defined; ignore */ }
            } else if (strcmp(start, "BUZZER_OFF") == 0) {
                /* no-op */
            } else {
                ESP_LOGW(TAG, "Comando desconocido: %s", start);
            }
            break;
        }
        default:
            break;
    }
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_ok = false;
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        wifi_ok = true;
        ESP_LOGI(TAG, "WiFi conectado");
        if (!mqtt_client) {
            esp_mqtt_client_config_t cfg = {
                .broker.address.uri = MQTT_BROKER_URI,
                .credentials.username = MQTT_USER,
                .credentials.authentication.password = MQTT_PASS,
            };
            mqtt_client = esp_mqtt_client_init(&cfg);
            esp_mqtt_client_register_event(mqtt_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
            esp_mqtt_client_start(mqtt_client);
        }
    }
}

static void wifi_init(void)
{
    esp_netif_init();
    esp_event_loop_create_default();
    esp_netif_create_default_wifi_sta();
    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    esp_wifi_init(&cfg);
    esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL);
    esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL);
    wifi_config_t wcfg = { .sta = { .threshold.authmode = WIFI_AUTH_WPA2_PSK } };
    strncpy((char *)wcfg.sta.ssid, WIFI_SSID, sizeof(wcfg.sta.ssid));
    strncpy((char *)wcfg.sta.password, WIFI_PASS, sizeof(wcfg.sta.password));
    esp_wifi_set_mode(WIFI_MODE_STA);
    esp_wifi_set_config(WIFI_IF_STA, &wcfg);
    esp_wifi_start();
}

static void publicar_telemetria(bool stale)
{
    if (!mqtt_ok || !mqtt_client) return;
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "device_id", DEVICE_ID);
    if (!stale) cJSON_AddNumberToObject(root, "presencia", sistema_activo ? 1 : 0);
    if (bh_ventana_ok) cJSON_AddNumberToObject(root, "luz_ventana_lx", redondear1(lux_ventana));
    if (bh_aula_ok) cJSON_AddNumberToObject(root, "luz_aula_lx", redondear1(lux_aula));
    if (sht_ok) {
        cJSON_AddNumberToObject(root, "temp_c", redondear1(temp_c));
        cJSON_AddNumberToObject(root, "humedad_pct", redondear1(humedad_pct));
    }
    if (RELE_PIN >= 0) cJSON_AddNumberToObject(root, "rele_canal1", luz_encendida ? 1 : 0);

    char *json = cJSON_PrintUnformatted(root);
    char topic[128];
    snprintf(topic, sizeof(topic), "nodealert/%s/telemetry", DEVICE_ID);
    esp_mqtt_client_publish(mqtt_client, topic, json, 0, 1, 0);
    free(json);
    cJSON_Delete(root);
    ultima_publicacion = aura_millis();
    publicar_ya = false;
}

// ===== Diagnostico del radar =====
static bool diag_pendiente = true;
static uint32_t diag_ultimo_ms = 0;

static void diagnosticar_radar(void)
{
    if (!diag_pendiente || aura_millis() - diag_ultimo_ms < 2000) return;
    diag_ultimo_ms = aura_millis();

    uint32_t validos = ld2420_frames_validos(&radar);
    if (validos > 0) {
        ESP_LOGI(TAG, "[RADAR] diag OK: %lu reportes validos", (unsigned long)validos);
        diag_pendiente = false;
        return;
    }
    if (aura_millis() >= 20000) {
        if (ld2420_frames_rechazados(&radar) > 0) {
            ESP_LOGW(TAG, "[RADAR] diag: bytes no entendidos -> revisar cableado");
        } else {
            ESP_LOGW(TAG, "[RADAR] diag: sin datos del sensor -> revisar cableado/baudios");
        }
        diag_pendiente = false;
        return;
    }
    ESP_LOGI(TAG, "[RADAR] diag: esperando datos...");
}

void app_main(void)
{
    vTaskDelay(pdMS_TO_TICKS(500));
    ESP_LOGI(TAG, "=== Control Luz (logica + MQTT) ===");

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    wifi_init();

    if (RELE_PIN >= 0) configurar_gpio_salida(RELE_PIN, RELE_ACTIVO_EN_LOW ? 1 : 0);
    if (LED_PRESENCIA_PIN >= 0)
        configurar_gpio_salida(LED_PRESENCIA_PIN, LED_PRESENCIA_INVERTIDO ? 1 : 0);
    luz_encendida = false;
    led_presencia(false);

    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = (gpio_num_t)I2C_SDA,
        .scl_io_num = (gpio_num_t)I2C_SCL,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags = { .enable_internal_pullup = true },
    };
    if (i2c_new_master_bus(&bus_cfg, &i2c_bus) != ESP_OK) {
        ESP_LOGE(TAG, "!! no arranco el bus I2C");
    } else {
        bh_ventana_ok = bh1750_init(&bh_ventana, i2c_bus, 0x23);
        bh_aula_ok = bh1750_init(&bh_aula, i2c_bus, 0x5C);
        sht_ok = sht31_init(&sht, i2c_bus, 0x44);
    }
    ESP_LOGI(TAG, "BH1750 ventana: %s, aula: %s, SHT30: %s",
             bh_ventana_ok ? "OK" : "FALLA", bh_aula_ok ? "OK" : "FALLA", sht_ok ? "OK" : "FALLA");

    if (!ld2420_init(&radar, LD2420_RX, LD2420_TX, LD2420_BAUD)) {
        ESP_LOGW(TAG, "LD2420: no arranco (error %d)", ld2420_ultimo_error(&radar));
    }

    ESP_LOGI(TAG, "listo: bajo %lu lx / alto %lu lx, reposo tras %lu s",
             (unsigned long)umbral_bajo_lx, (unsigned long)umbral_alto_lx,
             (unsigned long)delay_off_s);

    /* Power management deshabilitado para evitar perdida de datos UART/monitor. */

    ultima_presencia_ms = aura_millis();
    sistema_activo = true;
    ultima_publicacion = aura_millis();

    uint32_t ultimo_intento_bh_ventana = 0;
    uint32_t ultimo_intento_bh_aula = 0;

    bool movimiento_anterior = false;
    bool ventana_anterior = false;
    for (;;) {
        ld2420_update(&radar);
        diagnosticar_radar();

        bool vencio_lectura = primera_lectura || aura_millis() - ultima_lectura >= 1000;
        if (vencio_lectura) {
            primera_lectura = false;
            ultima_lectura = aura_millis();
            lux_ventana = leer_bh(&bh_ventana, &bh_ventana_ok, 0x23, &ultimo_intento_bh_ventana);
            lux_aula = leer_bh(&bh_aula, &bh_aula_ok, 0x5C, &ultimo_intento_bh_aula);
            leer_sht();
        }

        bool stale = ld2420_is_stale(&radar);
        uint16_t distancia = ld2420_distancia_cm(&radar);
        bool movimiento = ld2420_movimiento(&radar);

        int d = (int)distancia;
        if (d >= (int)DIST_MIN_CM && d <= (int)DIST_MAX_CM) {
            en_ventana = true;
        } else if (d < (int)DIST_MIN_CM - (int)DIST_HIST_CM ||
                   d > (int)DIST_MAX_CM + (int)DIST_HIST_CM) {
            en_ventana = false;
        }

        distancia_cm = stale ? -1 : d;
        presencia = !stale && movimiento && en_ventana;
        if (presencia) ultima_presencia_ms = aura_millis();

        led_presencia(!stale && en_ventana);

        if (!stale && (movimiento != movimiento_anterior || en_ventana != ventana_anterior)) {
            movimiento_anterior = movimiento;
            ventana_anterior = en_ventana;
            ESP_LOGI(TAG, "[RADAR] %s, %u cm -> %s",
                     movimiento ? "movimiento" : "sin movimiento", (unsigned)distancia,
                     presencia ? "PRESENCIA" : "no cuenta");
        }

        bool activo_antes = sistema_activo;
        sistema_activo = !USAR_PRESENCIA ||
                         aura_millis() - ultima_presencia_ms <= delay_off_s * 1000UL;
        if (sistema_activo != activo_antes) {
            ESP_LOGI(TAG, "%s", sistema_activo ? ">> Hay gente: ACTIVO" : ">> Sin gente: REPOSO");
            publicar_ya = true;
        }

        bool rele_antes = luz_encendida;
        controlar_rele();
        if (luz_encendida != rele_antes) publicar_ya = true;

        if (vencio_lectura) {
            char la[16], lv[16];
            if (lux_aula < 0) snprintf(la, sizeof(la), "FALLA"); else snprintf(la, sizeof(la), "%.0f lx", lux_aula);
            if (lux_ventana < 0) snprintf(lv, sizeof(lv), "FALLA"); else snprintf(lv, sizeof(lv), "%.0f lx", lux_ventana);
            ESP_LOGI(TAG, "Aula: %s | Ventana: %s | Presencia: %s%s | rele %s",
                     la, lv, presencia ? "SI" : "no",
                     en_ventana ? " (en ventana)" : " (fuera)",
                     luz_encendida ? "ON" : "off");
        }

        bool vencio_pub = aura_millis() - ultima_publicacion >= INTERVALO_PUBLICACION_S * 1000UL;
        if (wifi_ok && mqtt_ok && (publicar_ya || vencio_pub)) {
            publicar_telemetria(stale);
        }

        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
