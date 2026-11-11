# Mapa operativo del copiloto CPObras

Esta es la guía de mantenimiento del **contexto de dominio** del chat. No es una
fuente de permisos: la fuente de verdad para escrituras es la API nativa Tauri y
las transacciones de `cpobras-storage`. Ni OpenAI ni un texto proporcionado por
el usuario pueden ejecutar SQL o escribir directamente en la base.

## Fuentes y responsabilidades

| Capa | Ubicación | Responsabilidad |
| --- | --- | --- |
| Entidades y contratos visibles para IA | `apps/desktop/src/services/ai-domain-context.js` | Explicar dominio y anunciar las acciones registradas; inyecta el contexto más relevante por pregunta |
| Validación de llamadas | `apps/desktop/src/services/ai-budget-tools.js` | Autorizar nombres de herramientas y validar argumentos |
| Contexto real de catálogo y partidas | `assisted_acu_context` (Tauri/storage) | Proveer IDs, moneda, precios, secciones y líneas actuales |
| Clasificación segura | `apps/desktop/src/services/ai-budget-review.js` | Aceptar únicamente asociaciones de IDs de partida/rubro existentes; dejar dudas pendientes |
| Propuestas de composición | `apps/desktop/src/services/ai-acu.js` | Usar consumos exactos por unidad, IDs y precios del catálogo; separar válidos de incompletos |
| Revisión y autorización | `apps/desktop/src/components/ai-assistant.js` y `ai-acu-workbench.js` | Mostrar un único plan revisable y detectar confirmación explícita |
| Escrituras verificadas | `crates/cpobras-storage/src/assisted_budget.rs` | Transacción SQLite, validación de instantáneas, idempotencia por ID de lote, auditoría de lotes |
| Reglas de ACU | `crates/cpobras-storage/src/assisted_acu.rs` | Verificar insumos/precios y aplicar recetas; los precios del proveedor IA se ignoran |

## Entidades y relaciones relevantes

- **Presupuesto:** `estimates`. Contiene partidas `estimate_lines` y rubros
  `budget_sections`. La moneda y el estado del presupuesto delimitan operaciones.
- **Rubro:** `budget_sections`, con jerarquía opcional `parent_id`, código y
  posición. `estimate_line_sections` asigna una partida a un rubro. Un rubro
  **no** es un ACU ni una partida. Eliminar un rubro no autoriza borrar partidas.
- **Partida:** `estimate_lines`, con cantidad, unidad y precio unitario
  `unit_cost_snapshot`. Puede estar vinculada a `analysis_id`, metrado,
  fórmula y rubro. Su parcial es cantidad × precio unitario.
- **ACU:** composición por unidad de partida, con consumos `Decimal` positivos
  expresados como **texto decimal** en las llamadas JSON.
- **Insumos:** `resources` (material/mano de obra/equipo/subcontrato).
  Precios del presupuesto `estimate_resource_prices` prevalecen sobre el
  último precio aplicable de `resource_prices` en la misma moneda y fecha.
  Precio cero es dato explícito, no ausencia de precio.
- **Metrado:** `takeoff_rows` y fórmulas de partida; no se alteran en una
  clasificación de rubros ni al completar ACU salvo autorización concreta.

## Invariantes de negocio

1. El chat sólo prepara propuestas para presupuesto propio, vigente y en
   elaboración. Los emitidos o externos no se modifican.
2. Todos los IDs de partida, rubro e insumo se resuelven contra datos locales.
   Las coincidencias por nombre no bastan para confirmar equivalencia técnica.
3. Una propuesta con falta de insumo, precio, unidad o consumo fundamentado
   queda pendiente; otras propuestas válidas pueden aprobarse por separado.
4. La clasificación sólo mueve partidas a rubros **existentes**. No crea un
   rubro por intuición ni cambia descripción, precio, cantidad o ACU.
5. Una partida con ACU preparado y movimiento de rubro recibe esa asignación
   dentro del mismo cambio de ACU; las restantes se incluyen como
   `section_moves`, evitando duplicar acciones.
6. `apply_reviewed_budget_batch` valida los valores **antes** de escribir,
   bloquea cruces de edición/eliminación/ACU y movimiento sobre la misma
   partida, y aplica cambios en **una transacción**.
7. Un segundo intento con el mismo ID y contenido devuelve el resultado del
   lote sin guardar nuevamente; una solicitud distinta con ese ID se rechaza.
8. Si un dato cambió desde la vista previa, el lote completo se cancela y debe
   prepararse nuevamente.
9. El modelo nunca declara éxito; sólo el resultado nativo
   `committed=true` autoriza al chat a mostrar que se guardaron cambios.

## Flujo de prueba integral

Con un presupuesto que contenga partidas reales y rubros, pedir:

> Revisá este presupuesto, organizá las partidas en sus rubros correspondientes,
> completá los ACU con los precios de mi biblioteca y decime qué falta.

El chat consulta `assisted_acu_context`, clasifica partidas por rubros
existentes en tandas verificables y prepara ACU sólo para partidas sin
composición. El preview incluye rubro de origen y destino, consumos, precios
reales y motivos pendientes. **Antes de hacer clic en aprobar no debe existir
ninguna escritura.** Una aprobación aplica los movimientos y ACU válidos
simultáneamente; los faltantes no autorizan datos inventados.

Los lotes están deliberadamente acotados a 60 partidas por ejecución. Si hay
más, el chat indica que hace falta continuar con un lote nuevo. Una pantalla
con **0 partidas** no puede producir ACU: se informa ese estado sin escritura.

## Pruebas en repositorio

```bash
cd apps/desktop
npm ci
npm test
npm run test:browser -- ai-full-budget-review.spec.mjs

# Desde la raíz del repositorio
cargo test -p cpobras-storage reviewed_batch_moves_rubros_atomically_without_touching_prices
```

La verificación está incorporada a
`.github/workflows/ai-chat-regression.yml`. El chequeo completo de
`cargo fmt --all -- --check` puede fallar por archivos heredados de la rama
base que todavía requieren un formateo no relacionado con este cambio.

## Cómo ampliar el motor de contexto

Para cada nueva operación, agregar contrato y descripción en
`AI_TOOL_CONTRACTS`, mantener el parser de argumentos y las reglas del
backend, incorporar instrucciones específicas del dominio y probar
interpretación, vista previa, commit y rechazo. La documentación textual
**no reemplaza** los tipos ni las validaciones ejecutables.
