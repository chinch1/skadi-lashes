-- =====================================================================
-- Skadi Lashes · app de citas
-- Esquema inicial para Supabase (Postgres)
-- Pegar en el editor SQL de Supabase y ejecutar una sola vez.
-- Dinero: siempre en céntimos de euro (enteros).
-- Horas: siempre timestamptz (hora universal); se muestran en hora de Caracas.
-- =====================================================================

create extension if not exists btree_gist;   -- necesaria para la regla "sin citas cruzadas"

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type appointment_status as enum (
  'pending_deposit',  -- espera que la dueña apruebe el abono
  'confirmed',        -- abono aprobado
  'completed',        -- la clienta asistió
  'no_show',          -- la clienta no llegó
  'released'          -- la clienta o la dueña liberó el horario
);

create type deposit_status as enum ('pending', 'approved', 'rejected', 'forfeited');
create type deposit_method as enum ('pago_movil', 'binance');
create type message_kind  as enum ('confirmation', 'rejection', 'appointment_reminder', 'retouch_reminder');

-- ---------------------------------------------------------------------
-- Estudio y ajustes
-- ---------------------------------------------------------------------
create table studios (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  slug                     text not null unique,
  logo_path                text,
  timezone                 text not null default 'America/Caracas',

  -- Ajustes que la dueña cambia desde /admin
  deposit_cents            integer not null default 0   check (deposit_cents >= 0),
  late_fee_cents           integer not null default 800 check (late_fee_cents >= 0),
  late_tolerance_min       integer not null default 10  check (late_tolerance_min >= 0),
  reschedule_notice_hours  integer not null default 12  check (reschedule_notice_hours >= 0),
  max_reschedules          integer not null default 1   check (max_reschedules >= 0),
  pending_hold_hours       integer not null default 2   check (pending_hold_hours > 0),
  pending_hold_minutes     integer not null default 5   check (pending_hold_minutes > 0),  -- reloj para pagar y subir el comprobante (reemplaza a pending_hold_hours)
  booking_window_weeks     integer not null default 8   check (booking_window_weeks > 0),
  receipt_retention_days   integer not null default 30  check (receipt_retention_days > 0),

  -- Datos de pago que ve la clienta
  pago_movil_bank          text,
  pago_movil_phone         text,
  pago_movil_id_number     text,
  binance_account          text,

  -- Tasas de cambio escritas a mano por la dueña
  eur_to_ves_rate          numeric(14, 4),
  eur_to_usdt_rate         numeric(14, 6),
  rates_auto               boolean not null default true,  -- false = la dueña escribe la tasa a mano
  rates_source_updated_at  timestamptz,                    -- fecha que reporta la fuente de la tasa
  rates_fetched_at         timestamptz,                    -- última consulta nuestra

  -- Textos de WhatsApp que la dueña puede cambiar (null = texto por defecto de la app)
  confirmation_message     text,
  rejection_message        text,
  reminder_message         text,  -- recordatorio de la cita de mañana
  retouch_message          text,  -- recordatorio de retoque

  created_at               timestamptz not null default now()
);

create table admins (
  user_id    uuid not null references auth.users (id) on delete cascade,
  studio_id  uuid not null references studios (id) on delete cascade,
  primary key (user_id, studio_id)
);

-- ---------------------------------------------------------------------
-- Secciones y servicios
-- ---------------------------------------------------------------------
create table sections (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios (id) on delete cascade,
  name       text not null,
  position   integer not null default 0
);

create table services (
  id                     uuid primary key default gen_random_uuid(),
  studio_id              uuid not null references studios (id) on delete cascade,
  section_id             uuid not null references sections (id) on delete restrict,  -- no se borra una sección con servicios
  name                   text not null,
  duration_min           integer not null check (duration_min > 0),
  price_cents            integer not null check (price_cents >= 0),
  photo_path             text,
  visible                boolean not null default true,
  retouch_reminder_days  integer check (retouch_reminder_days > 0),  -- null = sin recordatorio
  position               integer not null default 0,
  created_at             timestamptz not null default now()
);

create index services_by_section on services (studio_id, section_id, position);

-- ---------------------------------------------------------------------
-- Horas que se ofrecen, día por día
-- La dueña marca a mano las horas de inicio de cada fecha. Es lo único que
-- decide qué cupos ve la clienta.
-- ---------------------------------------------------------------------
create table day_slots (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios (id) on delete cascade,
  day         date not null,   -- fecha local del estudio
  start_time  time not null,   -- hora local de inicio que se ofrece
  unique (studio_id, day, start_time)
);

create index day_slots_by_day on day_slots (studio_id, day);

-- ---------------------------------------------------------------------
-- Horario semanal y bloqueos (EN DESUSO: reemplazados por day_slots)
-- ---------------------------------------------------------------------
create table working_hours (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios (id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),  -- 0 = domingo ... 6 = sábado
  opens_at   time not null,
  closes_at  time not null,
  check (closes_at > opens_at)
);
-- Dos filas para el mismo día crean una pausa (por ejemplo 9:00-12:30 y 13:30-18:00).

create table time_blocks (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references studios (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  check (ends_at > starts_at)
);

-- ---------------------------------------------------------------------
-- Clientas y citas
-- ---------------------------------------------------------------------
create table clients (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references studios (id) on delete cascade,
  first_name    text not null,
  last_name     text not null,
  phone         text not null,
  reminders_ok  boolean not null default false,
  -- true = clienta de confianza: no ve el paso de pago, su cita se guarda con
  -- deposit_cents = 0 y status = 'confirmed', y no le aplica el plazo para reprogramar.
  deposit_exempt  boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (studio_id, phone)
);

create table appointments (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid not null references studios (id) on delete cascade,
  client_id             uuid not null references clients (id) on delete restrict,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  status                appointment_status not null default 'pending_deposit',
  reschedule_count      integer not null default 0 check (reschedule_count >= 0),
  manage_token          uuid not null default gen_random_uuid() unique,  -- enlace privado de la clienta
  deposit_cents         integer not null check (deposit_cents >= 0),     -- copia del abono al reservar
  total_cents           integer not null check (total_cents >= 0),       -- copia del total al reservar
  hold_expires_at       timestamptz,                                     -- hasta cuándo se guarda el horario sin aprobar
  quote_eur_to_ves      numeric(14, 4),                                  -- tasa congelada al llegar al paso de pago
  quote_eur_to_usdt     numeric(14, 6),                                  -- tasa congelada al llegar al paso de pago
  confirmation_sent_at  timestamptz,
  rejected_at           timestamptz,                                     -- cuándo la dueña rechazó la cita o su comprobante
  created_at            timestamptz not null default now(),
  check (ends_at > starts_at),

  -- Regla central: dos citas activas del mismo estudio no pueden cruzarse.
  constraint appointments_no_overlap exclude using gist (
    studio_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending_deposit', 'confirmed'))
);

create index appointments_by_day on appointments (studio_id, starts_at);

create table appointment_services (
  appointment_id  uuid not null references appointments (id) on delete cascade,
  service_id      uuid not null references services (id) on delete restrict,  -- no se borra un servicio con citas
  studio_id       uuid not null references studios (id) on delete cascade,
  -- Copias del momento de la reserva: cambiar el servicio después no altera la cita.
  name            text not null,
  duration_min    integer not null check (duration_min > 0),
  price_cents     integer not null check (price_cents >= 0),
  primary key (appointment_id, service_id)
);

-- ---------------------------------------------------------------------
-- Abonos y registro de mensajes
-- ---------------------------------------------------------------------
create table deposits (
  id                  uuid primary key default gen_random_uuid(),
  studio_id           uuid not null references studios (id) on delete cascade,
  appointment_id      uuid not null references appointments (id) on delete cascade,
  method              deposit_method not null,
  amount_cents        integer not null check (amount_cents >= 0),
  receipt_path        text,           -- ruta de la imagen en el almacenamiento
  paid_currency       text check (paid_currency in ('VES', 'USDT')),  -- moneda en que pagó
  paid_amount         numeric(14, 2),                                 -- monto exacto en esa moneda
  rate_used           numeric(14, 6),                                 -- tasa congelada al llegar al paso de pago
  status              deposit_status not null default 'pending',
  reviewed_at         timestamptz,
  receipt_deleted_at  timestamptz,    -- se llena cuando la imagen se borra
  created_at          timestamptz not null default now()
);

create index deposits_by_appointment on deposits (appointment_id);

create table messages_log (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references studios (id) on delete cascade,
  client_id       uuid not null references clients (id) on delete cascade,
  appointment_id  uuid references appointments (id) on delete set null,
  kind            message_kind not null,
  sent_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Comprobantes que ya toca borrar:
-- 30 días (o lo que diga receipt_retention_days) después de la FECHA DE LA CITA.
-- La tarea diaria lee esta vista, borra cada imagen con la interfaz de
-- almacenamiento de Supabase y luego llena receipt_deleted_at.
-- ---------------------------------------------------------------------
create view receipts_to_delete
with (security_invoker = true) as
select d.id as deposit_id, d.studio_id, d.receipt_path
from deposits d
join appointments a on a.id = d.appointment_id
join studios s on s.id = d.studio_id
where d.receipt_path is not null
  and d.receipt_deleted_at is null
  and a.starts_at < now() - make_interval(days => s.receipt_retention_days);

-- ---------------------------------------------------------------------
-- Seguridad por filas
-- La dueña (admin) ve y cambia todo lo de su estudio.
-- El público solo lee el estudio, las secciones y los servicios visibles.
-- Reservar, reprogramar y liberar pasan por el servidor de la app,
-- que usa la llave de servicio y valida el enlace privado de la clienta.
-- ---------------------------------------------------------------------
create function is_admin(target_studio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admins
    where user_id = auth.uid() and studio_id = target_studio
  );
$$;

alter table studios              enable row level security;
alter table admins               enable row level security;
alter table sections             enable row level security;
alter table services             enable row level security;
alter table working_hours        enable row level security;
alter table time_blocks          enable row level security;
alter table day_slots            enable row level security;
alter table clients              enable row level security;
alter table appointments         enable row level security;
alter table appointment_services enable row level security;
alter table deposits             enable row level security;
alter table messages_log         enable row level security;

-- Lectura pública
create policy studios_public_read  on studios  for select using (true);
create policy sections_public_read on sections for select using (true);
create policy services_public_read on services for select using (visible);

-- La dueña
create policy studios_admin_update on studios for update
  using (is_admin(id)) with check (is_admin(id));

create policy admins_read_own on admins for select
  using (user_id = auth.uid());

create policy sections_admin_all on sections for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy services_admin_all on services for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy working_hours_admin_all on working_hours for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy time_blocks_admin_all on time_blocks for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy day_slots_admin_all on day_slots for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy clients_admin_all on clients for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy appointments_admin_all on appointments for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy appointment_services_admin_all on appointment_services for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy deposits_admin_all on deposits for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));
create policy messages_log_admin_all on messages_log for all
  using (is_admin(studio_id)) with check (is_admin(studio_id));

-- ---------------------------------------------------------------------
-- Almacenamiento de archivos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('service-photos', 'service-photos', true),   -- fotos de referencia: públicas
  ('receipts',       'receipts',       false);  -- comprobantes: privados

-- ---------------------------------------------------------------------
-- Datos iniciales
-- ---------------------------------------------------------------------
with new_studio as (
  insert into studios (name, slug) values ('Skadi Lashes', 'skadi-lashes')
  returning id
)
insert into sections (studio_id, name, position)
select id, s.name, s.position
from new_studio,
     (values ('Pestañas', 1), ('Cejas', 2), ('Otros', 3)) as s (name, position);

-- Después de crear la cuenta de la dueña en Supabase (Authentication > Users),
-- vincúlala al estudio:
--   insert into admins (user_id, studio_id)
--   select '<ID-DE-LA-USUARIA>', id from studios where slug = 'skadi-lashes';
