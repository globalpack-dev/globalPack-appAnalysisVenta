# Scripts históricos de carga

Estos scripts se usaron durante la migración inicial, antes de que existiera el
importador de la app. **Hoy el camino oficial para cargar datos es «Cargar datos»
en la interfaz** (usuario `admin`), que reemplaza ventas por período y cartera
completa con auditoría en `importaciones`.

Se conservan como referencia histórica. **No se ejecutan tal como están**: cada
uno apunta por constante `ARCHIVO` a una planilla que ya no vive en esa ruta.

| Script | Planilla que esperaba | Estado |
| --- | --- | --- |
| `cargar-excel.ts` | `Base Plana JDV (1).xlsx` | Histórico. La planilla vigente es `excel/nuevos excel/Base ventas.xlsx` |
| `cargar-promotores.ts` | `excel/base de sectores (promotores).xlsx` | Histórico. La planilla vigente es `excel/nuevos excel/Base promotores_supervisores.xlsx` |
| `cargar-sub-base.ts` | `Sub Base Consulta.xlsx` | Histórico. Reemplazado por la carga de cartera |

## Si necesitás volver a usarlos

1. Copiá la planilla a la ruta que indica `ARCHIVO` en el script, o cambiá esa
   constante por la ruta real.
2. Configurá `.env` con `VITE_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. Corré primero el dry-run (sin `--aplicar`) y revisá el resumen.
4. Sólo entonces agregá `--aplicar`.

> ⚠️ `--aplicar` **borra y recarga** datos reales. `cargar-excel.ts` reemplaza los
> períodos del archivo; `cargar-promotores.ts` reemplaza toda la cartera. No los
> apuntes a producción sin backup.

El script de verificación vigente sigue en `scripts/verificar-datos.ts` y se corre
con `npm run verificar`.
