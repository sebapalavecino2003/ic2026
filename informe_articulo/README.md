# NodeAlert IoT - Informe Académico

## Archivos del proyecto

- `main.tex` — Documento principal (1491 líneas, 20 capítulos)
- `referencias.bib` — Bibliografía en formato BibLaTeX (6 referencias)
- `figuras/` — Directorio para imágenes (vacío)

## Compilación en Overleaf

1. Crear un nuevo proyecto en Overleaf
2. Subir `main.tex` y `referencias.bib`
3. Configurar compilación:
   - Compilador: **XeLaTeX**
   - Biblioteca: **Biber**
4. Compilar: `XeLaTeX → Biber → XeLaTeX → XeLaTeX`

O en local con latexmk:
```bash
latexmk -xelatex -bibtex main.tex
```

## Personalización requerida

Antes de la entrega final, reemplazar en la portada:
- `[Nombre del autor]` — Tu nombre completo
- `[Nombre de la institución]` — Universidad/Instituto
- `[Departamento o facultad]` — Facultad/Departamento
- `[Nombre del tutor]` — Nombre del docente/tutor
- `[Nombre de la carrera]` — Nombre de la carrera
- `[Fecha de presentación]` — Fecha del informe

## Notas importantes

- El marco teórico indica explícitamente qué información proviene de conocimiento complementario (no cubierto en las referencias proporcionadas)
- Todas las citas siguen formato APA 7 con biblatex
- Las Figuras 1 (arquitectura) y Tablas 1-5 están correctamente referenciadas
- Se requieren ~50 MB de espacio para paquetes LaTeX en Overleaf
