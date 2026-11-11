# Skadi Lashes: app de citas

Contexto del proyecto para continuar la implementación. Resume todo lo decidido en la fase de diseño.

## Qué es

- Aplicación web instalable (PWA, aplicación web progresiva) y adaptable a teléfono, tableta y computadora.
- Sirve a un solo estudio de pestañas en Caracas: Skadi Lashes. La dueña y única administradora es Giselle.
- Objetivo: que las clientas agenden solas, y reducir los mensajes de ida y vuelta y los plantones.
- Dos caras en el mismo proyecto y dominio:
  - Pública (clientas): sin cuenta ni contraseña.
  - `/admin` (Giselle): protegida con inicio de sesión.

## Decisiones técnicas

- Lenguaje: TypeScript.
- Aplicación: Next.js.
- Datos, inicio de sesión y archivos: Supabase (Postgres), plan gratuito.
- Publicación: Cloudflare, con el adaptador OpenNext. Verificar su guía actual antes de configurar.
- Dominio propio: más adelante. Por ahora, subdominio gratuito.
- WhatsApp: solo enlaces `wa.me` con el mensaje escrito. No se usa el servicio de pago de Meta.
- Prioridad: costo cero al inicio, con posibilidad de crecer. Por eso todas las tablas llevan `studio_id`.

## Estado actual

- Proyecto de Supabase creado. El esquema de `supabase/schema.sql` ya se ejecutó.
- La cuenta de Giselle existe y está vinculada al estudio en `admins`.
- `studios.deposit_cents` = 1000 (10 €).
- Los cambios posteriores ya están aplicados y verificados (11 nov 2026): `clients.deposit_exempt`, las columnas de tasas en `studios` y las de pago en `deposits`.
- Datos de Pago Móvil y Binance: ya cargados. Faltan por cargar: horario real y servicios reales.
- Paso 1 hecho: proyecto Next.js, clientes de Supabase y adaptador de Cloudflare. Publicado en https://skadi-lashes.nicolaandresr.workers.dev con `npm run deploy`. `SUPABASE_SERVICE_ROLE_KEY` está cargada como secreto en Cloudflare.
- Paso 2 hecho y publicado: inicio de sesión en `/admin/login`, `/admin` protegido y las cinco pestañas con texto provisional. No se usa `proxy.ts` (experimental en el adaptador de Cloudflare): una sesión vencida se renueva en la ruta `/admin/sesion`. Toda acción del servidor de `/admin` debe llamar a `requireAdminAction()` de `src/lib/auth.ts`.
- Paso 3 hecho y publicado: pantalla Servicios en `/admin/servicios`. Secciones y servicios se ordenan arrastrando (dnd-kit). La foto se reduce en el navegador (lado mayor 1280 px, JPEG) y se sube por el servidor con la llave de servicio a `service-photos/<studio_id>/<service_id>/`; no hay políticas de almacenamiento. La foto es opcional al guardar (por confirmar con Giselle).
- Paso 4 hecho y publicado en su primera versión (horario semanal más bloqueos), y rehecho y publicado el 11 nov 2026: Skadi marca a mano, día por día, las horas de inicio que ofrece. Pantalla en `/admin/ajustes/horario` (calendario con selección de varios días, horas como botones cada 30 min de 6:00 am a 9:00 pm, vista previa "Así lo ven las clientas"). Las horas viven en `day_slots`; `working_hours` y `time_blocks` quedaron en desuso. Cálculo en `src/lib/availability.ts` con pruebas (`npm test`) y ruta pública `GET /api/availability?month=AAAA-MM&services=<ids>`. Solo se ofrecen las horas marcadas; una cita larga ocupa las horas siguientes que pise. Descanso entre clientas (0) y anticipación mínima (60 min) son constantes en `src/lib/booking-config.ts`, por confirmar. Una cita `pending_deposit` con reserva vencida no ocupa cupo en el cálculo.
- Paso 5 hecho y publicado: flujo de agendar en `/agendar` (servicios, calendario, datos) y página privada de la cita en `/cita/<manage_token>` (pago del abono, comprobante enviado, cita confirmada, avisos). La lógica está en `src/lib/booking.ts`. El horario se aparta al llegar al pago (`hold_expires_at` = ahora + `pending_hold_hours`); al subir el comprobante, `hold_expires_at` pasa a nulo y queda apartado hasta que Giselle decida. La tasa se congela en `appointments.quote_eur_to_ves` y `quote_eur_to_usdt`. Los comprobantes van al almacén privado `receipts/<studio_id>/<appointment_id>/`.
- Paso 6 hecho y publicado: Agenda en `/admin` (abonos por aprobar con el comprobante, avisos por WhatsApp, citas del día con navegación, copiar enlace de reservas). Datos en `src/lib/agenda.ts`, acciones en `src/app/admin/(panel)/agenda-actions.ts`, mensajes en `src/lib/whatsapp.ts`. Aprobar y avisar son dos toques: tras aprobar aparece el botón de WhatsApp.
- Paso 7 hecho y publicado: `/reprogramar` (buscar la cita por número de WhatsApp) y `/cita/<token>/reprogramar` (cambio a tiempo, cambio tardío con abono nuevo, bloqueo tras un cambio, "No podré asistir"). Reglas en `src/lib/reschedule-rules.ts` y `src/lib/reschedule.ts`. En el cambio tardío se reutiliza la misma cita: pasa a `pending_deposit` con reserva nueva y el abono anterior queda `forfeited`. El límite de un cambio aplica también a la clienta de confianza. La disponibilidad al reprogramar se pide con `GET /api/availability?month=…&cita=<token>`.
- Paso 8 hecho y publicado: pestaña Clientas en `/admin/clientas` (buscador por nombre o número, contadores de citas y faltas) y ficha en `/admin/clientas/<id>` (casilla "Pide abono", nombre editable, historial). Datos en `src/lib/clients.ts`. La búsqueda no ignora acentos ("maria" no encuentra "María"); arreglarlo requiere la extensión `unaccent`.
- Paso 9 hecho y publicado: pestaña Recordatorios en `/admin/recordatorios` (citas de mañana y retoques pendientes, cada fila con su botón de WhatsApp). Reglas en `src/lib/reminder-rules.ts`, datos en `src/lib/reminders.ts`. Una cita confirmada que ya pasó cuenta como atendida para el retoque; solo se avisa a quien aceptó recordatorios; un retoque vencido hace más de 30 días se descarta; si la clienta ya volvió o tiene otra cita, no aparece.
- Paso 10 hecho, sin publicar: limpieza diaria en `src/lib/cleanup-task.ts`, por la ruta `POST /api/tasks/cleanup`. Borra la imagen de los comprobantes que lista la vista `receipts_to_delete` y llena `receipt_deleted_at` (el registro del abono se conserva), y pasa a `released` las citas `pending_deposit` cuya reserva venció. La tarea programada de `custom-worker.ts` llama a las dos rutas: tasas y limpieza.
- Paso 11 hecho, sin publicar: app instalable. Dos manifiestos en `public/`: `manifest.webmanifest` (clientas, abre en `/`) y `admin.webmanifest` (Giselle, abre en `/admin`, lo enlaza el diseño de `/admin`). Iconos en `public/icons/`, generados del logo sobre fondo blanco. Sin service worker: no hay modo sin conexión, a propósito, para no mostrar cupos viejos.
- Textos de WhatsApp editables por Giselle en `/admin/ajustes/mensajes`: aprobación, rechazo, recordatorio de la cita de mañana y recordatorio de retoque. Se guardan en `studios.confirmation_message`, `rejection_message`, `reminder_message` y `retouch_message` (nulo = texto por defecto). Marcadores: `{nombre}`, `{fecha}`, `{hora}`, `{servicios}`, `{enlace}`.
- Tasas: cargadas desde la fuente el 11 nov 2026. Se muestran en el inicio de la clienta y en la Agenda. La tarea diaria es un disparador programado de Cloudflare (`custom-worker.ts`, `triggers` en `wrangler.jsonc`) que llama a `POST /api/tasks/rates`; corre a las 10:00 y 22:00 UTC. `COTIZA_VE_API_KEY` está cargada como secreto en Cloudflare. Publicado el 11 nov 2026; falta confirmar que la primera ejecución programada actualizó la tasa.
- Datos de prueba en la base: horas de prueba en `day_slots` (lunes a viernes de noviembre 2026 a las 9:00, 11:30 y 2:00), cinco servicios `PRUEBA · …`, una clienta de prueba (`+584120000001`) con varias citas en distintos estados, y una reserva de prueba hecha por Nico a su nombre (19 nov 2026, con abono por aprobar; no tocarla sin preguntar). Borrar todo antes de abrir al público.

## Reglas del negocio

### Dinero

- Todos los precios están en euros. Se guardan en céntimos, como enteros.
- La clienta paga el abono por Pago Móvil (bolívares) o por Binance (USDT).
- Abono: monto fijo por cita, 10 € al inicio, configurable en Ajustes. No es reembolsable.
- Tasas: fuente con datos del Banco Central de Venezuela: `GET https://api.cotizave.com/v2/fx/VE/rates` con la cabecera `X-API-Key`. Se lee `ve-euro` (euro BCV) de `rates[]`; ver `src/lib/rates.ts`.
  - Euro a bolívares = `tasas.EUR`.
  - Pagos en USDT (Binance): sin conversión. El precio en euros se cobra íntegro en dólares (10 € = 10 USDT). La tasa del euro existe para cobrar lo más alto posible en bolívares; que la clienta pague en dólares es lo preferido. Constante `EUR_TO_USDT = 1` en `src/lib/booking-config.ts`.
  - Una tarea diaria consulta la fuente y guarda las tasas. La app nunca consulta la fuente al cargar una página.
  - Se rechazan datos inválidos o con más de 10 días. En ese caso se conserva la tasa anterior.
  - Modo manual: si `rates_auto` es falso, la tarea no cambia nada.
- La tasa se congela cuando la clienta llega al paso de pago. Se guarda en `deposits` (`paid_currency`, `paid_amount`, `rate_used`).

### Citas

- Una cita puede incluir varios servicios. La duración total es la suma.
- Giselle suele trabajar también los fines de semana.
- Skadi decide a mano, día por día, las horas de inicio que ofrece (decidido por Nico el 11 nov 2026; antes era horario semanal más bloqueos). Arma el mes completo con antelación. Solo se ofrecen esas horas, y solo si la cita completa no pisa otra cita. Los días sin cupo se muestran deshabilitados.
- Dos citas activas nunca se cruzan. Lo garantiza una restricción de la base de datos.
- Al reservar se copian nombre, duración y precio de cada servicio. Cambios posteriores no alteran citas ya hechas.
- Estados: `pending_deposit`, `confirmed`, `completed`, `no_show`, `released`.

### Reprogramar

- Con 12 horas o más de anticipación: el abono se conserva y el cambio es inmediato.
- Cada cita se puede reprogramar una sola vez.
- Con menos de 12 horas: el abono se pierde. La clienta puede elegir otra fecha pagando un abono nuevo, que Giselle aprueba.
- El cálculo usa la hora del servidor, y se revisa al abrir la pantalla y otra vez al confirmar.

### No asistir

- No hay opción de "cancelar" en la pantalla de inicio.
- Dentro de "Reprogramar" hay un enlace "No podré asistir" que libera el horario.
- Giselle también puede liberar un horario desde su agenda.
- Abono perdido (decidido por Nico el 11 nov 2026): la clienta pierde el abono si el horario se libera con menos de 12 horas de anticipación o si no asiste. Si se libera con 12 horas o más, el abono no se marca como perdido (`forfeited`); qué se hace con él está por definir.
- Rechazar un comprobante libera el horario de inmediato (decidido por Nico el 11 nov 2026).

### Puntualidad

- Con más de 10 minutos de retraso, Giselle evalúa si puede atender. Si atiende, hay un cargo adicional de 8 €.
- El cargo es configurable en Ajustes (`late_fee_cents`).

### Clientas de confianza

- `clients.deposit_exempt` = verdadero: la clienta no ve el paso de pago.
- Su cita se guarda con abono 0 y pasa directo a `confirmed`.
- No le aplica el plazo para reprogramar.
- La clienta nunca ve una etiqueta. La app solo oculta el paso.
- Toda clienta nueva pide abono por defecto.
- Decisión explícita: no se controla la suplantación por número de teléfono.

### Servicios

- Giselle crea, edita y ordena secciones y servicios. Cada servicio lleva foto de referencia.
- Ocultar en vez de eliminar. Un servicio con citas no se puede borrar. Una sección con servicios tampoco.
- Cada servicio define si genera recordatorio de retoque y a los cuántos días.

### Comprobantes

- La imagen se borra 30 días después de la fecha de la cita. El registro del abono se conserva.
- La vista `receipts_to_delete` lista los pendientes. El borrado se hace con la interfaz de almacenamiento de Supabase, desde una tarea programada.

### Normas que ve la clienta (texto exacto)

- Abono: "El abono que pagas para agendar no es reembolsable."
- Reprogramación: "¿No puedes venir? Cambia tu cita hasta 12 horas antes y no pierdes tu abono. Solo se puede cambiar una vez."
- Puntualidad: "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €."
- Acompañantes: "No se admiten acompañantes, sin excepción."

## Pantallas

### Clienta

1. Inicio: logo, dos opciones ("Agendar una cita", "Reprogramar una cita") y las normas.
2. Elegir servicios: secciones en acordeón, tarjetas con foto grande, selección múltiple, barra con el resumen.
3. Elegir día y hora: calendario de mes completo, días sin cupo deshabilitados.
4. Datos: nombre, apellido, número de WhatsApp, permiso para recordatorios. El número identifica a la clienta.
5. Pagar el abono: datos de Pago Móvil y Binance, subir comprobante.
6. Reprogramar a tiempo: buscar cita, nueva fecha, confirmación.
7. Reprogramar fuera del plazo: aviso, nueva fecha, nuevo abono, enviado.
8. No podré asistir: aviso y confirmación.

### Giselle (`/admin`)

Barra inferior con cinco pestañas: Agenda, Recordatorios, Clientas, Servicios, Ajustes.

- Agenda: abonos por aprobar o rechazar, citas del día, liberar horario, copiar enlace de reservas.
- Recordatorios: citas de mañana y retoques pendientes. Cada fila abre WhatsApp con el mensaje escrito.
- Clientas: buscador, historial de citas y faltas, casilla "Pide abono".
- Servicios: secciones, servicios, visibilidad, formulario de servicio.
- Ajustes: monto del abono y cargo por retraso.

## Diseño

- Color principal: `#6F4A2F`. Fondo: `#FAF7F3`. Texto: `#211B17`. Texto secundario: `#6A5D52`.
- Tintes: `#F1E7DC`. Bordes: `#E3D7C9` y `#C9B8A5`. Botón de WhatsApp: `#0F7A3F`.
- Letra: Outfit para títulos, DM Sans para el resto.
- El logo aparece solo en la pantalla de inicio.
- Áreas táctiles de al menos 44 px.
- Referencia visual: el lienzo de diseño y el diagrama del modelo de datos en claude.ai (pedir exportación a Nico).

## Variables de entorno

Solo nombres. Los valores nunca van en el repositorio.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo servidor)
- `COTIZA_VE_API_KEY` (solo servidor): llave de la fuente de tasas

Reservar, reprogramar y liberar pasan por el servidor con la llave de servicio. El público solo lee estudio, secciones y servicios visibles.

## Pendiente por decidir o dibujar

- Enlace privado por cita (`manage_token`) para gestionar la cita sin escribir el número.
- Pantalla "Cita confirmada" para la clienta sin abono.
- Textos de "Reprogramar" para la clienta sin abono.
- Estado bloqueado de "Reprogramar" cuando la cita ya se cambió una vez.
- Tiempo de reserva de un horario mientras se aprueba el abono (propuesto: 2 horas).
- Intervalo entre horas ofrecidas (propuesto: 30 minutos) y descanso entre clientas.
- Agregar a Ajustes: datos de pago, tasas, minutos de tolerancia, horas de aviso.

## Orden sugerido de implementación

1. Proyecto base, conexión a Supabase, despliegue vacío en Cloudflare.
2. Inicio de sesión de `/admin`.
3. Servicios y secciones (admin), con subida de fotos.
4. Horario de trabajo y cálculo de cupos.
5. Flujo de agendar completo, con abono y comprobante.
6. Agenda: aprobar, rechazar, liberar.
7. Reprogramar y "No podré asistir".
8. Clientas y exención de abono.
9. Recordatorios.
10. Tareas diarias: tasas y borrado de comprobantes.
11. Configuración de app instalable.
12. Sección de ganancias por mes en dólares, en el panel de Giselle (pedido por Nico el 11 nov 2026, para el final). Por definir qué cuenta como ganancia: citas atendidas, abonos perdidos, cargos por retraso.
