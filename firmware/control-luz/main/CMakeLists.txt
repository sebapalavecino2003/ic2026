idf_component_register(SRCS "main.c"
                            "drivers/bh1750.c"
                            "drivers/sht31.c"
                            "drivers/ld2420.c"
                       INCLUDE_DIRS "." "drivers"
                       PRIV_REQUIRES esp_timer esp_wifi esp_event esp_netif mqtt nvs_flash
                                     esp_driver_gpio esp_driver_uart esp_driver_i2c)
