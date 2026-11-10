# Operations & Engagement Schema (DDL)

> **Status:** Accepted · **Owner:** Data Platform · **Version:** 1.0
>
> Reference DDL for attendance, scheduling, library, transport, hostel, inventory, health, LMS,
> communication and engagement. All tables carry `tenant_id` and RLS. Cross-context references are
> opaque UUIDs (no cross-schema FKs).
>
> For brevity, the standard audit/concurrency columns (`created_at`, `updated_at`, `created_by`,
> `updated_by`, `version`) are shown only where behaviour matters. Every mutable table must include
> them per [Database conventions](database-conventions.md); append-only tables omit `updated_*` and
> `version`.

## 1. Attendance

```sql
create schema if not exists attendance;

create table attendance.policies (
  id                    uuid primary key,
  tenant_id             uuid not null,
  institution_id        uuid not null,
  name                  text not null,
  absence_threshold_pct numeric(7,4) not null default 10,
  notify_after_absences integer not null default 3,
  escalation_role       text,
  effective_from        date not null default current_date,
  effective_to          date,
  created_at            timestamptz not null default now(),
  unique (tenant_id, institution_id, name, effective_from)
);

create table attendance.sessions (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  section_id      uuid not null,
  term_id         uuid not null,
  session_date    date not null,
  period_id       uuid,
  mode            text not null default 'daily' check (mode in ('daily','period','activity')),
  status          text not null default 'open' check (status in ('open','submitted','locked','cancelled')),
  opened_by       uuid not null,
  opened_at       timestamptz not null default now(),
  submitted_at    timestamptz,
  locked_at       timestamptz
);
create unique index uq_attendance_session
  on attendance.sessions (tenant_id, section_id, session_date, coalesce(period_id, '00000000-0000-0000-0000-000000000000'::uuid), mode);
create index ix_attendance_sessions_date on attendance.sessions (tenant_id, institution_id, session_date);

create table attendance.records (
  id              uuid primary key,
  tenant_id       uuid not null,
  session_id      uuid not null references attendance.sessions (id) on delete cascade,
  student_id      uuid not null,
  status          text not null
                  check (status in ('present','absent','late','excused','sick','suspended','holiday','remote','not_expected')),
  minutes_late    integer check (minutes_late is null or minutes_late >= 0),
  reason_code     text,
  note            text,
  recorded_by     uuid not null,
  recorded_at     timestamptz not null default now(),
  client_key      text,
  unique (tenant_id, session_id, student_id)
);
create index ix_attendance_records_student on attendance.records (tenant_id, student_id, recorded_at);

create table attendance.corrections (
  id              uuid primary key,
  tenant_id       uuid not null,
  record_id       uuid not null references attendance.records (id) on delete cascade,
  from_status     text not null,
  to_status       text not null,
  reason          text not null,
  corrected_by    uuid not null,
  corrected_at    timestamptz not null default now()
);

create table attendance.absence_requests (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  from_date       date not null,
  to_date         date not null,
  reason_code     text not null,
  note            text,
  evidence_document_id uuid,
  status          text not null default 'submitted' check (status in ('submitted','approved','rejected','cancelled')),
  requested_by    uuid not null,
  decided_by      uuid,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint ck_absence_dates check (to_date >= from_date)
);

create table attendance.staff_clock_events (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  user_id         uuid not null,
  event_type      text not null check (event_type in ('clock_in','clock_out','break_start','break_end')),
  source          text not null check (source in ('manual','kiosk','biometric','mobile')),
  occurred_at     timestamptz not null,
  device_id       text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, user_id, occurred_at, event_type)
);
```

## 2. Scheduling

```sql
create schema if not exists scheduling;

create table scheduling.periods (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  sequence        integer not null,
  starts_at       time not null,
  ends_at         time not null,
  day_of_week     integer check (day_of_week between 0 and 6),
  unique (tenant_id, institution_id, name),
  constraint ck_period_times check (ends_at > starts_at)
);

create table scheduling.timetables (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  term_id         uuid not null,
  version_no      integer not null default 1,
  status          text not null default 'draft' check (status in ('draft','published','superseded')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (tenant_id, term_id, version_no)
);

create table scheduling.entries (
  id              uuid primary key,
  tenant_id       uuid not null,
  timetable_id    uuid not null references scheduling.timetables (id) on delete cascade,
  section_id      uuid not null,
  period_id       uuid not null references scheduling.periods (id),
  room_id         uuid,
  teacher_id      uuid not null,
  day_of_week     integer not null check (day_of_week between 0 and 6),
  effective_from  date,
  effective_to    date,
  unique (tenant_id, timetable_id, section_id, day_of_week, period_id),
  constraint ck_entry_dates check (effective_to is null or effective_to >= effective_from)
);
create index ix_entries_teacher on scheduling.entries (tenant_id, teacher_id, day_of_week, period_id);
create index ix_entries_room on scheduling.entries (tenant_id, room_id, day_of_week, period_id);

create table scheduling.constraints (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  constraint_type text not null,
  is_hard         boolean not null default true,
  definition      jsonb not null,
  created_at      timestamptz not null default now()
);

create table scheduling.exam_sessions (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  term_id         uuid not null,
  title           text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          text not null default 'planned' check (status in ('planned','published','completed','cancelled')),
  created_at      timestamptz not null default now(),
  constraint ck_exam_times check (ends_at > starts_at)
);

create table scheduling.exam_rooms (
  id              uuid primary key,
  tenant_id       uuid not null,
  exam_session_id uuid not null references scheduling.exam_sessions (id) on delete cascade,
  room_id         uuid not null,
  capacity        integer not null check (capacity > 0),
  unique (tenant_id, exam_session_id, room_id)
);

create table scheduling.invigilators (
  id              uuid primary key,
  tenant_id       uuid not null,
  exam_room_id    uuid not null references scheduling.exam_rooms (id) on delete cascade,
  user_id         uuid not null,
  role            text not null default 'invigilator' check (role in ('lead','invigilator','scribe')),
  unique (tenant_id, exam_room_id, user_id)
);
```

## 3. Library

```sql
create schema if not exists library;

create table library.titles (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  isbn            text,
  title           text not null,
  author          text,
  publisher       text,
  subject         text,
  language        text not null default 'en',
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, isbn)
);
create index ix_titles_search on library.titles using gin (to_tsvector('simple', title || ' ' || coalesce(author, '')));

create table library.copies (
  id              uuid primary key,
  tenant_id       uuid not null,
  title_id        uuid not null references library.titles (id) on delete cascade,
  barcode         text not null,
  condition       text not null default 'good' check (condition in ('good','fair','damaged','lost')),
  status          text not null default 'available' check (status in ('available','on_loan','reserved','lost','retired')),
  acquired_on     date,
  unique (tenant_id, barcode)
);

create table library.loans (
  id              uuid primary key,
  tenant_id       uuid not null,
  copy_id         uuid not null references library.copies (id),
  borrower_id     uuid not null,
  borrower_type   text not null check (borrower_type in ('student','staff')),
  loaned_at       timestamptz not null default now(),
  due_on          date not null,
  returned_at     timestamptz,
  status          text not null default 'active' check (status in ('active','returned','overdue','lost')),
  issued_by       uuid not null
);
create unique index uq_copy_active_loan on library.loans (tenant_id, copy_id) where status = 'active';
create index ix_loans_borrower on library.loans (tenant_id, borrower_id, status);

create table library.reservations (
  id              uuid primary key,
  tenant_id       uuid not null,
  title_id        uuid not null references library.titles (id),
  borrower_id     uuid not null,
  position        integer not null,
  status          text not null default 'waiting' check (status in ('waiting','ready','fulfilled','expired','cancelled')),
  created_at      timestamptz not null default now(),
  expires_at      timestamptz
);

create table library.fines (
  id              uuid primary key,
  tenant_id       uuid not null,
  loan_id         uuid not null references library.loans (id),
  amount          numeric(19,4) not null check (amount > 0),
  currency        char(3) not null,
  reason          text not null,
  status          text not null default 'pending' check (status in ('pending','paid','waived','cancelled')),
  invoice_id      uuid,
  created_at      timestamptz not null default now()
);
```

## 4. Transport

```sql
create schema if not exists transport;

create table transport.routes (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  code            text not null,
  direction       text not null check (direction in ('inbound','outbound','both')),
  status          text not null default 'active' check (status in ('active','suspended','retired')),
  unique (tenant_id, institution_id, code)
);

create table transport.stops (
  id              uuid primary key,
  tenant_id       uuid not null,
  route_id        uuid not null references transport.routes (id) on delete cascade,
  name            text not null,
  sequence        integer not null,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  pickup_time     time,
  dropoff_time    time,
  unique (tenant_id, route_id, sequence)
);

create table transport.vehicles (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  registration    text not null,
  capacity        integer not null check (capacity > 0),
  vehicle_type    text not null default 'bus',
  insurance_expiry date,
  inspection_expiry date,
  status          text not null default 'active' check (status in ('active','maintenance','retired')),
  unique (tenant_id, registration)
);

create table transport.drivers (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  user_id         uuid,
  full_name       text not null,
  licence_no      text not null,
  licence_expiry  date not null,
  medical_expiry  date,
  background_check_expiry date,
  status          text not null default 'active' check (status in ('active','suspended','retired')),
  unique (tenant_id, licence_no)
);

create table transport.assignments (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  route_id        uuid not null references transport.routes (id),
  stop_id         uuid not null references transport.stops (id),
  direction       text not null check (direction in ('inbound','outbound')),
  effective_from  date not null,
  effective_to    date,
  guardian_consent_at timestamptz,
  status          text not null default 'active' check (status in ('active','cancelled')),
  constraint ck_transport_dates check (effective_to is null or effective_to >= effective_from)
);
create unique index uq_transport_assignment_active
  on transport.assignments (tenant_id, student_id, route_id, direction)
  where status = 'active';

create table transport.trips (
  id              uuid primary key,
  tenant_id       uuid not null,
  route_id        uuid not null references transport.routes (id),
  vehicle_id      uuid not null references transport.vehicles (id),
  driver_id       uuid not null references transport.drivers (id),
  trip_date       date not null,
  started_at      timestamptz,
  ended_at        timestamptz,
  status          text not null default 'scheduled' check (status in ('scheduled','running','completed','cancelled','incident')),
  unique (tenant_id, route_id, trip_date, started_at)
);

create table transport.positions (
  id              uuid primary key,
  tenant_id       uuid not null,
  trip_id         uuid not null references transport.trips (id) on delete cascade,
  latitude        numeric(9,6) not null,
  longitude       numeric(9,6) not null,
  recorded_at     timestamptz not null default now()
);
create index ix_positions_trip on transport.positions (tenant_id, trip_id, recorded_at);

create table transport.incidents (
  id              uuid primary key,
  tenant_id       uuid not null,
  trip_id         uuid references transport.trips (id),
  incident_type   text not null,
  severity        text not null check (severity in ('low','medium','high','critical')),
  description     text not null,
  reported_by     uuid not null,
  occurred_at     timestamptz not null,
  status          text not null default 'open' check (status in ('open','investigating','closed')),
  created_at      timestamptz not null default now()
);
```

## 5. Hostel

```sql
create schema if not exists hostel;

create table hostel.hostels (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  gender_policy   text not null default 'mixed' check (gender_policy in ('mixed','male','female')),
  warden_id       uuid,
  status          text not null default 'active' check (status in ('active','closed')),
  unique (tenant_id, institution_id, name)
);

create table hostel.rooms (
  id              uuid primary key,
  tenant_id       uuid not null,
  hostel_id       uuid not null references hostel.hostels (id) on delete cascade,
  name            text not null,
  capacity        integer not null check (capacity > 0),
  room_type       text not null default 'dormitory',
  unique (tenant_id, hostel_id, name)
);

create table hostel.beds (
  id              uuid primary key,
  tenant_id       uuid not null,
  room_id         uuid not null references hostel.rooms (id) on delete cascade,
  label           text not null,
  status          text not null default 'available' check (status in ('available','occupied','maintenance')),
  unique (tenant_id, room_id, label)
);

create table hostel.allocations (
  id              uuid primary key,
  tenant_id       uuid not null,
  bed_id          uuid not null references hostel.beds (id),
  student_id      uuid not null,
  effective_from  date not null,
  effective_to    date,
  status          text not null default 'active' check (status in ('active','ended','cancelled')),
  allocated_by    uuid not null,
  constraint ck_hostel_dates check (effective_to is null or effective_to > effective_from)
);
create unique index uq_bed_active_allocation on hostel.allocations (tenant_id, bed_id) where status = 'active';
create unique index uq_student_active_allocation on hostel.allocations (tenant_id, student_id) where status = 'active';

create table hostel.roll_calls (
  id              uuid primary key,
  tenant_id       uuid not null,
  hostel_id       uuid not null references hostel.hostels (id),
  roll_call_at    timestamptz not null,
  taken_by        uuid not null,
  status          text not null default 'open' check (status in ('open','submitted','locked')),
  created_at      timestamptz not null default now()
);

create table hostel.roll_call_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  roll_call_id    uuid not null references hostel.roll_calls (id) on delete cascade,
  student_id      uuid not null,
  status          text not null check (status in ('present','missing','excused','late')),
  note            text,
  unique (tenant_id, roll_call_id, student_id)
);

create table hostel.exeats (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  from_at         timestamptz not null,
  to_at           timestamptz not null,
  reason          text not null,
  guardian_approved_by uuid,
  warden_approved_by  uuid,
  status          text not null default 'requested' check (status in ('requested','approved','rejected','returned','overdue')),
  constraint ck_exeat_times check (to_at > from_at)
);

create table hostel.visitors (
  id              uuid primary key,
  tenant_id       uuid not null,
  hostel_id       uuid not null references hostel.hostels (id),
  student_id      uuid,
  full_name       text not null,
  relationship    text,
  id_verified     boolean not null default false,
  checked_in_at   timestamptz not null default now(),
  checked_out_at  timestamptz,
  recorded_by     uuid not null
);
```

## 6. Inventory & assets

```sql
create schema if not exists inventory;

create table inventory.items (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  code            text not null,
  name            text not null,
  category        text not null,
  unit            text not null default 'unit',
  reorder_level   numeric(19,4) not null default 0,
  is_asset        boolean not null default false,
  unique (tenant_id, institution_id, code)
);

create table inventory.locations (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  parent_id       uuid references inventory.locations (id),
  unique (tenant_id, institution_id, name)
);

create table inventory.stock_levels (
  id              uuid primary key,
  tenant_id       uuid not null,
  item_id         uuid not null references inventory.items (id),
  location_id     uuid not null references inventory.locations (id),
  quantity        numeric(19,4) not null default 0 check (quantity >= 0),
  unique (tenant_id, item_id, location_id)
);

create table inventory.movements (
  id              uuid primary key,
  tenant_id       uuid not null,
  item_id         uuid not null references inventory.items (id),
  from_location_id uuid references inventory.locations (id),
  to_location_id   uuid references inventory.locations (id),
  movement_type   text not null check (movement_type in ('receipt','issue','transfer','adjustment','return','write_off')),
  quantity        numeric(19,4) not null check (quantity > 0),
  unit_cost       numeric(19,4),
  currency        char(3),
  reason          text,
  reference       text,
  performed_by    uuid not null,
  performed_at    timestamptz not null default now()
);
create index ix_movements_item on inventory.movements (tenant_id, item_id, performed_at);

create table inventory.assets (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  item_id         uuid not null references inventory.items (id),
  asset_tag       text not null,
  serial_no       text,
  location_id     uuid references inventory.locations (id),
  custodian_id    uuid,
  acquired_on     date,
  cost_amount     numeric(19,4),
  currency        char(3),
  condition       text not null default 'good',
  status          text not null default 'in_use' check (status in ('in_use','stored','maintenance','disposed','lost')),
  unique (tenant_id, asset_tag)
);

create table inventory.maintenance (
  id              uuid primary key,
  tenant_id       uuid not null,
  asset_id        uuid not null references inventory.assets (id),
  maintenance_type text not null,
  due_on          date,
  completed_on    date,
  performed_by    uuid,
  cost_amount     numeric(19,4),
  notes           text,
  status          text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','overdue','cancelled'))
);
```

## 7. Health (restricted)

```sql
create schema if not exists health;

create table health.visits (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  student_id      uuid not null,
  visited_at      timestamptz not null default now(),
  symptoms_ciphertext bytea not null,
  key_version     integer not null,
  outcome         text,
  treated_by      uuid not null,
  guardian_notified_at timestamptz,
  created_at      timestamptz not null default now()
);
create index ix_visits_student on health.visits (tenant_id, student_id, visited_at);

create table health.medications (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  medication_name text not null,
  dosage          text not null,
  schedule        text,
  consent_document_id uuid,
  starts_on       date not null,
  ends_on         date,
  status          text not null default 'active' check (status in ('active','stopped','expired')),
  prescribed_by   text
);

create table health.administrations (
  id              uuid primary key,
  tenant_id       uuid not null,
  medication_id   uuid not null references health.medications (id),
  administered_at timestamptz not null,
  dose_given      text not null,
  administered_by uuid not null,
  witnessed_by    uuid,
  note            text,
  created_at      timestamptz not null default now()
);

create table health.immunisations (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  vaccine         text not null,
  dose_no         integer,
  administered_on date not null,
  expires_on      date,
  evidence_document_id uuid,
  created_at      timestamptz not null default now()
);

create table health.allergies (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  allergen        text not null,
  severity        text not null check (severity in ('mild','moderate','severe')),
  reaction        text,
  treatment       text,
  consent_to_share boolean not null default false,
  created_at      timestamptz not null default now()
);

create table health.consents (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  purpose         text not null,
  policy_version  text not null,
  granted_by      uuid not null,
  granted_at      timestamptz,
  withdrawn_at    timestamptz,
  unique (tenant_id, student_id, purpose, policy_version)
);
```

## 8. Learning (LMS)

```sql
create schema if not exists lms;

create table lms.modules (
  id              uuid primary key,
  tenant_id       uuid not null,
  section_id      uuid not null,
  title           text not null,
  sequence        integer not null,
  status          text not null default 'draft' check (status in ('draft','published','archived')),
  unique (tenant_id, section_id, sequence)
);

create table lms.resources (
  id              uuid primary key,
  tenant_id       uuid not null,
  module_id       uuid not null references lms.modules (id) on delete cascade,
  title           text not null,
  resource_type   text not null check (resource_type in ('file','link','video','text')),
  document_id     uuid,
  url             text,
  visibility      text not null default 'enrolled' check (visibility in ('staff','enrolled','guardians','public')),
  sequence        integer not null default 0
);

create table lms.assignments (
  id              uuid primary key,
  tenant_id       uuid not null,
  section_id      uuid not null,
  title           text not null,
  instructions    text,
  max_score       numeric(9,4),
  rubric_id       uuid,
  opens_at        timestamptz,
  due_at          timestamptz,
  allow_late      boolean not null default false,
  status          text not null default 'draft' check (status in ('draft','published','closed')),
  created_by      uuid not null
);

create table lms.submissions (
  id              uuid primary key,
  tenant_id       uuid not null,
  assignment_id   uuid not null references lms.assignments (id) on delete cascade,
  student_id      uuid not null,
  version_no      integer not null default 1,
  document_id     uuid,
  text_content    text,
  submitted_at    timestamptz not null default now(),
  is_late         boolean not null default false,
  status          text not null default 'submitted' check (status in ('submitted','graded','returned')),
  unique (tenant_id, assignment_id, student_id, version_no)
);
create index ix_submissions_assignment on lms.submissions (tenant_id, assignment_id, student_id);

create table lms.quizzes (
  id              uuid primary key,
  tenant_id       uuid not null,
  section_id      uuid not null,
  title           text not null,
  config          jsonb not null default '{}'::jsonb,
  opens_at        timestamptz,
  closes_at       timestamptz,
  status          text not null default 'draft' check (status in ('draft','published','closed'))
);

create table lms.quiz_attempts (
  id              uuid primary key,
  tenant_id       uuid not null,
  quiz_id         uuid not null references lms.quizzes (id) on delete cascade,
  student_id      uuid not null,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  score           numeric(9,4),
  answers         jsonb not null default '{}'::jsonb,
  unique (tenant_id, quiz_id, student_id, started_at)
);
```

## 9. Communication

```sql
create schema if not exists communication;

create table communication.templates (
  id              uuid primary key,
  tenant_id       uuid not null,
  key             text not null,
  version_no      integer not null,
  subject         text,
  body            text not null,
  locale          text not null default 'en',
  status          text not null default 'draft' check (status in ('draft','published','retired')),
  published_at    timestamptz,
  unique (tenant_id, key, version_no, locale)
);

create table communication.announcements (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  title           text not null,
  body            text not null,
  audience        jsonb not null,               -- resolved + snapshotted
  channels        text[] not null default '{in_app}',
  status          text not null default 'draft' check (status in ('draft','scheduled','sending','sent','cancelled')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  created_by      uuid not null
);

create table communication.conversations (
  id              uuid primary key,
  tenant_id       uuid not null,
  subject         text,
  conversation_type text not null default 'guardian_teacher' check (conversation_type in ('guardian_teacher','staff','learner','support')),
  status          text not null default 'open' check (status in ('open','closed','archived')),
  created_at      timestamptz not null default now()
);

create table communication.participants (
  id              uuid primary key,
  tenant_id       uuid not null,
  conversation_id uuid not null references communication.conversations (id) on delete cascade,
  user_id         uuid not null,
  role            text not null default 'member' check (role in ('member','moderator','observer')),
  joined_at       timestamptz not null default now(),
  unique (tenant_id, conversation_id, user_id)
);

create table communication.messages (
  id              uuid primary key,
  tenant_id       uuid not null,
  conversation_id uuid not null references communication.conversations (id) on delete cascade,
  sender_id       uuid not null,
  body            text,
  document_ids    uuid[] not null default '{}',
  sent_at         timestamptz not null default now(),
  edited_at       timestamptz,
  moderation_status text not null default 'visible' check (moderation_status in ('visible','hidden','flagged'))
);
create index ix_messages_conversation on communication.messages (tenant_id, conversation_id, sent_at);

create table communication.preferences (
  id              uuid primary key,
  tenant_id       uuid not null,
  user_id         uuid not null,
  channel         text not null check (channel in ('email','sms','push','in_app')),
  enabled         boolean not null default true,
  quiet_hours     jsonb,
  locale          text,
  unique (tenant_id, user_id, channel)
);
```

## 10. Engagement

```sql
create schema if not exists engagement;

create table engagement.incidents (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  student_id      uuid not null,
  incident_type   text not null,
  severity        text not null check (severity in ('low','medium','high','critical')),
  occurred_at     timestamptz not null,
  location        text,
  narrative_ciphertext bytea,
  key_version     integer,
  reported_by     uuid not null,
  status          text not null default 'open' check (status in ('open','investigating','resolved','escalated')),
  is_safeguarding boolean not null default false,
  created_at      timestamptz not null default now()
);
create index ix_incidents_student on engagement.incidents (tenant_id, student_id, occurred_at);

create table engagement.actions (
  id              uuid primary key,
  tenant_id       uuid not null,
  incident_id     uuid not null references engagement.incidents (id) on delete cascade,
  action_type     text not null check (action_type in ('sanction','support','warning','restorative','reward')),
  description     text not null,
  approved_by     uuid,
  effective_from  date,
  effective_to    date,
  status          text not null default 'proposed' check (status in ('proposed','approved','completed','cancelled'))
);

create table engagement.clubs (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  category        text,
  capacity        integer,
  fee_amount      numeric(19,4),
  currency        char(3),
  staff_owner_id  uuid,
  status          text not null default 'active' check (status in ('active','paused','closed'))
);

create table engagement.memberships (
  id              uuid primary key,
  tenant_id       uuid not null,
  club_id         uuid not null references engagement.clubs (id) on delete cascade,
  student_id      uuid not null,
  joined_on       date not null default current_date,
  left_on         date,
  status          text not null default 'active' check (status in ('active','waitlisted','left')),
  unique (tenant_id, club_id, student_id, joined_on)
);

create table engagement.alumni_profiles (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  graduation_year integer,
  contactable     boolean not null default false,
  consent_at      timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  unique (tenant_id, student_id)
);

create table engagement.campaigns (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  target_amount   numeric(19,4),
  currency        char(3),
  starts_on       date,
  ends_on         date,
  status          text not null default 'draft' check (status in ('draft','active','closed'))
);

create table engagement.donations (
  id              uuid primary key,
  tenant_id       uuid not null,
  campaign_id     uuid references engagement.campaigns (id),
  donor_name      text,
  is_anonymous    boolean not null default false,
  amount          numeric(19,4) not null check (amount > 0),
  currency        char(3) not null,
  received_at     timestamptz not null default now(),
  payment_id      uuid,
  status          text not null default 'recorded' check (status in ('recorded','reconciled','refunded'))
);
```

## 11. RLS, immutability and retention

Apply the standard tenant policy to every table with `tenant_id`:

```sql
do $$
declare r record;
begin
  for r in
    select schemaname, tablename from pg_tables
    where schemaname in ('attendance','scheduling','library','transport','hostel','inventory','health','lms','communication','engagement')
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('alter table %I.%I force row level security', r.schemaname, r.tablename);
    execute format(
      'create policy tenant_isolation on %I.%I using (tenant_id = current_setting(''app.tenant_id'', true)::uuid) with check (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      r.schemaname, r.tablename);
  end loop;
end $$;
```

| Data | Control |
|---|---|
| Health notes, incident narratives | Encrypted at rest; restricted roles; read audited |
| Attendance corrections | Additive; original preserved; audit |
| Library loans/fines | One active loan per copy; fines link to billing |
| Transport GPS | Short retention (30 days) unless incident hold |
| Hostel roll-call | Missing learners alert immediately; immutable after lock |
| Inventory | No negative stock; movements immutable |
| LMS submissions | Versioned; one active per attempt; timestamped server-side |
| Messages | Moderation + retention; attachments scanned |
| Donations | Reconcile to ledger; donor anonymity honored |
| Safeguarding | Separate access path; no broad export/search |
