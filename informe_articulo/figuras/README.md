# Carpeta de figuras — NodeAlert IoT

Esta carpeta está destinada a contener las imágenes que se incorporen al artículo científico.

## Figuras pendientes de incorporar

| Etiqueta LaTeX       | Archivo sugerido           | Descripción                                                                 |
|----------------------|----------------------------|-----------------------------------------------------------------------------|
| `fig:arquitectura`   | `arquitectura_general.png` | Diagrama de bloques de la arquitectura general de NodeAlert IoT (3 capas)  |
| `fig:fw_bloques`     | `firmware_bloques.png`     | Diagrama de bloques del firmware del ESP32-C3                               |
| `fig:diagrama_regla` | `diagrama_flujo_regla.png` | Diagrama de flujo de la función `regla_deseado()`                           |
| `fig:docker_arch`    | `docker_arquitectura.png`  | Diagrama de los tres contenedores Docker sobre Raspberry Pi                 |
| `fig:frontend_dashboard` | `captura_dashboard.png` | Captura de pantalla del Dashboard de la interfaz web                       |
| `fig:frontend_detail` | `captura_nodedetail.png`  | Captura de pantalla de la vista de detalle de nodo                          |
| `fig:prototipo`      | `foto_prototipo.jpg`       | Fotografía del prototipo físico (ESP32-C3 + sensores)                       |

## Instrucciones para incorporar imágenes

1. Copiar el archivo de imagen a esta carpeta con el nombre sugerido.
2. En el archivo `.tex` correspondiente, reemplazar el bloque `\fbox{...}` por:

```latex
\includegraphics[width=0.90\textwidth]{figuras/nombre_archivo.png}
```

3. Compilar con `pdflatex` para verificar la correcta inclusión.

## Formatos aceptados

- PNG (recomendado para capturas de pantalla y diagramas)
- JPG/JPEG (fotografías)
- PDF (vectoriales generados con Inkscape, draw.io, etc.)

## Recomendaciones de calidad

- Resolución mínima: 150 DPI para capturas de pantalla; 300 DPI para fotografías.
- Fondo blanco o transparente para diagramas.
- Texto legible en el tamaño de la figura dentro del documento.

