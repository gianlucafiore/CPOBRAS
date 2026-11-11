# Contexto conversacional unificado

El chat captura proyecto, presupuesto, vista, pestaña, selección, rubro, ACU y componentes actuales como estado estructurado. Conserva el historial acotado y una intención de preparación de una partida con sus criterios. Una referencia explícita a la partida seleccionada establece un destino nuevo. Las continuaciones y criterios conservan el ID del destino anterior aunque cambie la selección visual. La preparación anuncia la descripción del destino.

La sesión del navegador conserva hasta diez mensajes y la intención por obra y presupuesto durante hasta 24 horas. Esta elección limita la persistencia al contexto de la sesión. Limpiar el chat elimina esos datos del presupuesto actual. Las propuestas y autorizaciones ejecutables quedan en memoria y se vuelven a preparar después de recuperar la conversación. El consentimiento al proveedor sigue siendo necesario.

El flujo existente de herramientas Tauri obtiene catálogo, partidas y precios actuales mediante assisted_acu_context y assisted_acu_references. El modelo propone consumos con fundamento y usa identificadores reales del catálogo. Las validaciones existentes de unidades, materiales y precios siguen siendo obligatorias. Los consumos estimados requieren revisión técnica. El guardado utiliza apply_reviewed_budget_batch y sus controles transaccionales.

Un error HTTPS conserva la intención. «Generalo», «reintentá» o una confirmación corta reanudan la preparación. «Bueno cargalos» guarda únicamente cuando existe una propuesta preparada visible. Si falta esa propuesta, inicia preparación y exige otra aprobación posterior. Las propuestas reemplazadas pierden su botón de guardado. Las pruebas usan IPC simulado y verifican el flujo real de componentes de interfaz.

## Pruebas

Desde apps/desktop con Node 24 y dependencias instaladas mediante npm ci.

```sh
npm test
npm run build
npm run test:browser -- ai-approved-load.spec.mjs ai-conversation-context.spec.mjs
npm run test:browser
```

El workflow AI chat regression ejecuta las nuevas pruebas unitarias y navegador junto con las regresiones existentes y las comprobaciones nativas.

## Inspección HTTPS independiente

La comprobación del 10 de noviembre de 2026 desde este equipo con curl -Iv https://api.openai.com/v1/models completó TLS 1.3 con certificado válido y recibió HTTP 401 sin credenciales. Se verificó conectividad del sistema. La reproducción del fallo original en el cliente Rust requiere ejecutar la aplicación en las condiciones de red originales. No se alteró la validación de certificados ni se añadieron reintentos de escritura.
