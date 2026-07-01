# Cambio: validación flexible de nombres en recargas automáticas

Este paquete contiene los archivos completos modificados para copiar y pegar en el proyecto.

## Archivos incluidos

- `lib/bankTopups.ts`
- `app/api/cron/bank-parser/route.ts`

## Qué cambia

La función `payerNamesMatch` ahora acepta coincidencias en ambos sentidos cuando una parte escribe el nombre más corto y la otra fuente trae el nombre más completo.

Ejemplos que ahora aprueban automáticamente si el monto también coincide y el pago bancario no ha sido usado:

- Cliente escribe: `Iris Lua`; banco reporta: `Iris Daniela Lua Arroyo`.
- Cliente escribe: `Iris Daniela Lua Arroyo`; banco reporta: `Iris Lua`.
- Cliente escribe: `María de la Cruz`; banco reporta: `Maria Cruz`.

## Protección contra falsos positivos

- No aprueba automáticamente nombres de una sola palabra como `Iris` o `Lua`, salvo que el nombre completo compacto sea exactamente igual.
- Exige mínimo dos palabras reales coincidentes del nombre más corto.
- Compara palabras completas normalizadas, no pedazos de texto. Así evita errores por coincidencias parciales dentro de otra palabra.
- Ignora partículas comunes como `de`, `del`, `la`, `y`, etc.

## Instalación

Copia cada archivo en la misma ruta dentro del proyecto, reemplazando el archivo existente.

Después ejecuta:

```bash
npm run lint
npm run build
```

