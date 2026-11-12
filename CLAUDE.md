# Skadi Lashes: app de citas

Contexto del proyecto tal como quedó construido. Describe lo que existe hoy, no el plan original.

## Qué es

- Aplicación web instalable y adaptable a teléfono, tableta y computadora.
- Sirve a un solo estudio de pestañas en Caracas: Skadi Lashes. La dueña y única administradora es Giselle (también la llamamos Skadi).
- Objetivo: que las clientas agenden solas, y reducir los mensajes de ida y vuelta y los plantones.
- Dos caras en el mismo proyecto y dominio:
  - Pública (clientas): sin cuenta ni contraseña.
  - `/admin` (Giselle): protegida con inicio de sesión.
- Publicada en https://skadi-lashes.nicolaandresr.workers.dev. Giselle ya la tiene instalada en su iPhone.

## Estado

- Los doce pasos del plan están hechos y publicados (12 nov 2026).
- **La base de datos ya tiene datos reales**: los servicios de Giselle, clientas y citas. No crear, cambiar ni borrar datos de prueba sin avisar a Nico. Quedan dos servicios `PRUEBA · …` ocultos.
- Lo que falta está en "Pendiente" al final.

## Tecnología

- TypeScript, Next.js 16 (App Router), Tailwind 4.
- Supabase (Postgres, inicio de sesión y archivos), plan gratuito.
- Cloudflare Workers con el adaptador OpenNext. Sin dominio propio todavía.
- WhatsApp: solo enlaces `wa.me` con el mensaje escrito. No se usa el servicio de pago de Meta.
- Prioridad: costo cero. Todas las tablas llevan `studio_id` por si crece a más estudios.
- Esta versión de Next.js cambia cosas respecto a las anteriores: leer `AGENTS.md` y la documentación en `node_modules/next/dist/docs/` antes de escribir código.

## Cómo se trabaja en este repositorio

- Comprobar antes de entregar: `npx tsc --noEmit`, `npm run lint`, `npm test` (vitest).
- Vista previa en el entorno real de Workers: `npx opennextjs-cloudflare build` y luego el servidor `workers-preview` de `.claude/launch.json` (puerto 8787).
- Publicar: `npm run deploy`. Siempre con el visto bueno de Nico.
- Historial: una rama por tema, commits pequeños en español, unida a `main` con `--no-ff` y subida.
- Cambios de esquema: se aplican con el conector de Supabase y se anotan en `supabase/schema.sql`, que es la referencia completa.
- Código y textos en español. Comentarios que explican el porqué.

## Mapa del código

Cara pública:

- `src/app/page.tsx`: inicio (logo, dos opciones, tasa del día, normas).
- `src/app/agendar/`: asistente de agendar (servicios, calendario, datos). `calendar-step.tsx` es el calendario compartido.
- `src/app/cita/[token]/`: página privada de la cita (pago con reloj, comprobante enviado, por confirmar, confirmada, vencida, liberada).
  - `horario/`: elegir otro horario sin haber pagado.
  - `reprogramar/`: reprogramar y "No podré asistir".
- `src/app/reprogramar/`: buscar la cita por número de WhatsApp.

Panel (`src/app/admin/(panel)/`, cinco pestañas en `src/components/admin/tab-bar.tsx`):

- `page.tsx` y `_agenda/`: Agenda.
- `recordatorios/`, `clientas/`, `servicios/`.
- `ajustes/`: montos y tiempos; subpantallas `ganancias/`, `horario/` y `mensajes/`.
- `src/app/admin/login/` y `src/app/admin/sesion/`: inicio de sesión y renovación de sesión.

Lógica (`src/lib/`):

- `auth.ts`: `requireAdminPage()` para páginas y `requireAdminAction()` para acciones. **Toda acción del servidor de `/admin` debe llamar a `requireAdminAction()`.**
- `booking.ts`: crear la cita, verla por su enlace, recibir el comprobante.
- `slot-change.ts`: cambiar de horario antes de pagar. `reschedule.ts` y `reschedule-rules.ts`: reprogramar.
- `availability.ts` (cálculo puro) y `availability-data.ts` (carga de datos).
- `agenda.ts`, `reminders.ts`, `clients.ts`, `earnings.ts` con `earnings-data.ts`: datos de cada pantalla del panel.
- `rules.ts` y `studio-settings.ts`: normas que ve la clienta. `whatsapp.ts`: mensajes.
- `rates.ts`, `rates-task.ts`, `cleanup-task.ts`: tareas diarias.
- `time.ts`, `format.ts`, `money.ts`, `phone.ts`: utilidades. `booking-config.ts`: constantes de agenda.
- `supabase/`: clientes de navegador, servidor y llave de servicio.

Rutas de servicio: `GET /api/availability`, `POST /api/tasks/rates`, `POST /api/tasks/cleanup`, `GET /api/health`.

## Acceso a los datos

- El público solo puede leer estudio, secciones y servicios visibles (seguridad por filas).
- Agendar, pagar, reprogramar y liberar pasan por el servidor con la llave de servicio. Esas funciones validan todo lo que reciben y nunca devuelven identificadores internos.
- La clienta se identifica por su número de WhatsApp. La cita, por un enlace privado (`manage_token`).
- Giselle entra con correo y contraseña. No se usa `proxy.ts` (experimental en el adaptador de Cloudflare): una sesión vencida se renueva en `/admin/sesion`. La sesión se verifica con `getClaims()`, sin viajar a Supabase; por eso una sesión cerrada desde otro dispositivo vale hasta que vence, como mucho una hora.
- Fotos de servicios: almacén público `service-photos`. Comprobantes: almacén privado `receipts`; la Agenda los muestra con direcciones temporales de 15 minutos. No hay políticas de almacenamiento: los archivos se suben por el servidor.

## Reglas del negocio

### Dinero

- Los precios se guardan en céntimos, como enteros, y se muestran en euros.
- El euro es una referencia para cobrar en bolívares lo más alto posible. Cuando la clienta paga en dólares (USDT por Binance) se cobra el mismo número, sin conversión: 10 € = 10 USDT. Que pague en dólares es lo preferido. Constante `EUR_TO_USDT = 1`.
- Bolívares = monto × tasa del euro del Banco Central de Venezuela.
- Fuente de tasas: `GET https://api.cotizave.com/v2/fx/VE/rates` con la cabecera `X-API-Key`. Se lee `ve-euro`.
- La app nunca consulta la fuente al cargar una página: lo hace la tarea diaria. Se rechazan datos inválidos o con más de 10 días, y se conserva la tasa anterior. Si `rates_auto` es falso, la tarea no cambia nada.
- La tasa se muestra en el inicio de la clienta y en la Agenda.
- Abono: monto fijo por cita (10 € hoy), editable en Ajustes. No es reembolsable. La tasa se congela en la cita al llegar al pago.
- Cargo por retraso: 8 € hoy, editable en Ajustes.

### Horario

- Giselle marca a mano, día por día, las horas de inicio que ofrece. Arma el mes completo con antelación y suele trabajar también los fines de semana.
- Solo se ofrecen esas horas, y solo si la cita completa no pisa otra cita. Una cita larga ocupa las horas siguientes que pise.
- Las horas viven en `day_slots`. `working_hours` y `time_blocks` son del modelo anterior y están en desuso.
- La rejilla de "Mi horario" va de 6:00 am a 9:00 pm cada 30 minutos.
- La clienta puede agendar hasta `booking_window_weeks` semanas adelante (8) y con 60 minutos de anticipación mínima.

### Agendar y pagar

- Una cita puede incluir varios servicios; la duración es la suma. Al reservar se copian nombre, duración y precio: cambios posteriores no alteran citas ya hechas.
- Dos citas activas nunca se cruzan. Lo garantiza una restricción de la base de datos.
- Estados: `pending_deposit`, `confirmed`, `completed`, `no_show`, `released`.
- Al llegar al pago, el cupo queda apartado `pending_hold_minutes` minutos (5), con un reloj en pantalla. Si no sube el comprobante a tiempo, el cupo se libera. Hay 30 segundos de margen para un comprobante que ya venía en camino.
- Con el comprobante subido, el cupo queda apartado hasta que Giselle decida.
- Desde el pago, o con el reloj vencido, la clienta puede "Elegir otro horario": libera el cupo, reutiliza la misma cita y no cuenta como reprogramación.
- Si la clienta abandona el pago y vuelve a agendar con el mismo número, su reserva sin pagar anterior se libera al instante. No se libera al salir de la página, porque para pagar tiene que irse a la app del banco.
- **Giselle confirma toda cita.** Nada se confirma solo:
  - Con abono: aprueba o rechaza el comprobante.
  - Sin abono (abono en 0 o clienta de confianza): la cita queda "por confirmar" y ella la confirma o la rechaza.
- Rechazar libera el horario de inmediato.

### Reprogramar y no asistir

- Solo se reprograman citas confirmadas, y una sola vez.
- Con 12 horas o más de anticipación: el cambio es inmediato y el abono se conserva.
- Con menos de 12 horas: el abono se pierde y la clienta paga uno nuevo para la nueva fecha.
- El plazo usa la hora del servidor y se revisa al abrir la pantalla y otra vez al confirmar.
- No hay "cancelar" en el inicio. Dentro de Reprogramar hay un enlace "No podré asistir" que libera el horario. Giselle también puede liberar desde la Agenda.
- La clienta pierde el abono si el horario se libera con menos de 12 horas o si no asiste. Si se libera con 12 horas o más, el abono no se marca como perdido; qué se hace con él está por definir.

### Clientas de confianza

- `clients.deposit_exempt` verdadero: no ve el paso de pago y su cita queda por confirmar.
- No le aplica el plazo de 12 horas para reprogramar, pero sí el límite de un cambio.
- Nunca ve una etiqueta ni la palabra "abono". Toda clienta nueva pide abono.
- Decisión explícita: no se controla la suplantación por número de teléfono.

### Servicios

- Giselle crea, edita y ordena secciones y servicios arrastrando. La foto es opcional y se reduce en el navegador antes de subir.
- Ocultar en vez de eliminar. Un servicio con citas no se puede borrar; una sección con servicios, tampoco.
- Cada servicio define si genera recordatorio de retoque y a los cuántos días.

### Recordatorios

- Citas de mañana: las confirmadas, con su mensaje de WhatsApp. Quien no aceptó recordatorios aparece aparte, sin mensaje.
- Retoques: una cita confirmada que ya pasó cuenta como atendida; solo se avisa a quien aceptó recordatorios; si la clienta ya volvió o tiene otra cita, no aparece; un retoque vencido hace más de 30 días se descarta.

### Ganancias

- Por mes, en dólares, sin conversión.
- Cuenta las citas atendidas (`completed`, y `confirmed` que ya pasaron) más los abonos perdidos. Las citas por venir se muestran aparte.
- El cargo por retraso no entra porque no se registra. Estas reglas las eligió Claude y falta que Nico las confirme.

### Tareas diarias

- Un disparador programado de Cloudflare (`custom-worker.ts`, `triggers` en `wrangler.jsonc`) corre a las 10:00 y 22:00 UTC y llama a dos rutas: tasas y limpieza.
- La limpieza borra la imagen de cada comprobante 30 días después de la cita (el registro del abono se conserva) y marca como liberadas las reservas vencidas.

### Normas que ve la clienta

Se arman con `buildRules()` a partir de los valores guardados. Con los valores de hoy dicen:

- Abono: "El abono que pagas para agendar no es reembolsable."
- Reprogramación: "¿No puedes venir? Cambia tu cita hasta 12 horas antes y no pierdes tu abono. Solo se puede cambiar una vez."
- Puntualidad: "Si llegas con más de 10 minutos de retraso, Skadi evaluará si puede atenderte, con un cargo adicional de 8 €."
- Acompañantes: "No se admiten acompañantes, sin excepción."

Aparecen en el inicio. No se repiten en el paso de pago.

### Mensajes de WhatsApp

- Cuatro textos editables por Giselle en Ajustes: aprobación, rechazo, recordatorio de la cita de mañana y recordatorio de retoque.
- Marcadores: `{nombre}`, `{fecha}`, `{hora}`, `{servicios}`, `{enlace}`, `{normas}`.
- El enlace del mensaje de confirmación lleva a la página privada de la cita, desde donde la clienta puede reprogramar o avisar que no va.

## Pantallas

### Clienta

1. Inicio: logo, "Agendar una cita", "Reprogramar una cita", tasa del día y normas.
2. Elegir servicios: secciones en acordeón, tarjetas con foto, selección múltiple, barra con el resumen.
3. Elegir día y hora: calendario del mes, días sin cupo deshabilitados.
4. Tus datos: nombre, apellido, WhatsApp (con formato automático, admite otros países con `+`) y permiso para recordatorios.
5. Pago: título "Procede con el pago de la reserva", reloj, datos de Pago Móvil o Binance con botones de copiar, zona para subir el comprobante.
6. Página de la cita según su estado: comprobante enviado, por confirmar, confirmada, tiempo vencido o liberada.
7. Reprogramar: a tiempo, fuera del plazo, bloqueada tras un cambio, y "No podré asistir".

### Giselle (`/admin`)

- Agenda: abonos por aprobar, citas por confirmar, avisos por WhatsApp, citas del día con navegación, copiar enlace de reservas, tasa del día.
- Recordatorios: citas de mañana y retoques pendientes.
- Clientas: buscador, ficha con historial, casilla "Pide abono", nombre editable.
- Servicios: secciones y servicios, orden por arrastre, visibilidad, formulario con foto.
- Ajustes: abono, cargo por retraso y minutos del reloj; Ganancias; Mi horario; Mensajes de WhatsApp; cerrar sesión.

## Diseño

- Color principal: `#6F4A2F`. Fondo: `#FAF7F3`. Texto: `#211B17`. Texto secundario: `#6A5D52`.
- Tintes: `#F1E7DC`. Bordes: `#E3D7C9` y `#C9B8A5`. Botón de WhatsApp: `#0F7A3F`.
- Letra: Outfit para títulos, DM Sans para el resto.
- El logo aparece solo en el inicio.
- Pensada primero para iPhone: 375 px de ancho, áreas táctiles de al menos 44 px.
- No usar `<input type="time">` ni `type="date"`: se rompen en Safari de iPhone. Las horas y fechas se eligen con botones.
- App instalable con dos manifiestos: `manifest.webmanifest` (clientas) y `admin.webmanifest` (abre en la Agenda). Sin service worker a propósito, para no mostrar cupos viejos.

## Variables de entorno

Solo nombres. Los valores nunca van en el repositorio.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la llave "publishable" de Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` (la llave "secret"; solo servidor)
- `COTIZA_VE_API_KEY` (solo servidor)

Las dos de servidor están cargadas como secretos en Cloudflare. OpenNext además copia `.env.local` dentro del paquete del servidor; no llega a los archivos públicos.

## Pendiente

Decisiones de Nico o Giselle:

- Confirmar las reglas de Ganancias.
- El abono (10 €) es mayor que algunos servicios (hay uno de 8 €): decidir si se limita al total de la cita.
- Qué se hace con el abono cuando la clienta libera con 12 horas o más.
- Descanso entre clientas (hoy 0) y anticipación mínima (hoy 60 minutos): son constantes en `src/lib/booking-config.ts`.

Por construir:

- Editar desde Ajustes: minutos de tolerancia, horas de aviso para reprogramar, datos de Pago Móvil y Binance, y tasa manual. Los dos primeros ya se leen de la base.
- Búsqueda de clientas sin acentos ("maria" no encuentra "María"); requiere la extensión `unaccent`.
- Registrar el cargo por retraso cuando se cobra.

Por comprobar:

- En el iPhone: una reserva completa con el reloj, y que Giselle confirme una cita desde la Agenda.
- El reloj llegando a cero y el margen de 30 segundos.
- La pantalla de Ganancias con citas atendidas reales.
- Si Cloudflare ya aplicó "Smart Placement" y cuánto mejoró la velocidad.

Limpieza:

- Borrar los dos servicios `PRUEBA · …`.
- Decidir si `.mcp.json` se sube o se ignora.
