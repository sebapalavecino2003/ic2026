# NodeAlert IoT — Artículo Científico en LaTeX

Proyecto LaTeX que genera el artículo científico académico del sistema
**NodeAlert IoT**: sistema embebido de monitoreo ambiental y control autónomo
de iluminación basado en MQTT para entornos educativos.

---

## Estructura del proyecto

```
informe_articulo/
├── main.tex              ← Documento principal (compilar desde aquí)
├── referencias.bib       ← Base de datos bibliográfica (APA 7)
├── README.md             ← Este archivo
│
├── secciones/
│   ├── 01_resumen.tex    ← Resumen / Abstract + palabras clave
│   ├── 02_introduccion.tex
│   ├── 03_marco_teorico.tex
│   ├── 04_materiales_metodos.tex
│   ├── 05_arquitectura.tex
│   ├── 06_desarrollo.tex
│   ├── 07_resultados.tex
│   ├── 08_discusion.tex
│   └── 09_conclusiones.tex
│
├── figuras/
│   └── README.md         ← Instrucciones para incorporar imágenes
│
└── anexos/
    └── anexos.tex        ← Tablas de pines, estructura del repositorio, etc.
```

---

## Compilación

### Opción A — Terminal (pdfLaTeX + Biber)

```bash
cd informe_articulo/

pdflatex main.tex
biber main
pdflatex main.tex
pdflatex main.tex
```

La tercera pasada de `pdflatex` resuelve las referencias cruzadas y los
números de página en el índice de bibliografía.

El PDF resultante es `main.pdf`.

### Opción B — Overleaf

1. Comprimir toda la carpeta `informe_articulo/` como ZIP.
2. Crear un nuevo proyecto en [Overleaf](https://www.overleaf.com) →
   **New Project → Upload Project**.
3. En **Menu → Compiler**, seleccionar **pdfLaTeX**.
4. En **Menu → Bibliography**, verificar que esté configurado **Biber**.
5. Compilar con el botón **Recompile**.

> **Nota**: Overleaf ejecuta automáticamente las pasadas necesarias de
> pdfLaTeX y Biber. No es necesario hacerlo manualmente.

---

## Dependencias LaTeX

El documento utiliza los siguientes paquetes, todos incluidos en
TeX Live 2025 (y disponibles en Overleaf):

| Paquete | Función |
|---------|---------|
| `babel` (spanish) | Idioma español |
| `helvet` | Tipografía sans-serif (sustituto de Arial) |
| `geometry` | Márgenes APA 7 (lat. 3 cm, sup/inf 2,5 cm) |
| `setspace` | Interlineado doble APA |
| `fancyhdr` | Encabezado con número de página |
| `biblatex` + `biber` | Bibliografía APA 7 |
| `biblatex-apa` | Estilo APA 7 para biblatex |
| `booktabs` | Tablas académicas |
| `tabularx` | Tablas de ancho ajustable |
| `listings` | Bloques de código fuente |
| `tikz` | Diagramas vectoriales (disponible para extensión) |
| `caption` | Formato de captions APA |
| `hyperref` | Hipervínculos internos |

---

## Incorporación de imágenes

Ver instrucciones detalladas en [`figuras/README.md`](figuras/README.md).

Formato rápido para reemplazar un espacio reservado:

```latex
% Reemplazar el bloque \fbox{...} por:
\includegraphics[width=0.90\textwidth]{figuras/nombre_imagen.png}
```

---

## Nombre del archivo final (según requisitos de la cátedra)

```
Palavecino_Kirov_Alemandi_ICII_TF.pdf
```

---

## Información Académica

- **Autores**: Sebastián Palavecino, Eloy Kirov, Francisco Alemandi
- **Carrera**: Ingeniería en Computación
- **Institución**: Universidad Nacional de Rafaela (UNRaf)
- **Materia**: Ingeniería en Computación II
- **Docentes a cargo**: Milton Pozzo y Matías Wanzenried
- **Fecha**: Noviembre de 2026

