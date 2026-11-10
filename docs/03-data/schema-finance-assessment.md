# Finance & Assessment Schema (DDL)

> **Status:** Accepted · **Owner:** Data Platform · **Version:** 1.0
>
> Reference DDL for billing, payments, ledger and assessment. Financial and published academic
> records are **append-only or versioned**; corrections are new documents, never silent updates.

## 1. Billing

```sql
create schema if not exists billing;

create table billing.payers (
  id              uuid primary key,
  tenant_id       uuid not null,
  payer_type      text not null check (payer_type in ('guardian','learner','organisation','sponsor')),
  display_name    text not null,
  email           citext,
  phone           text,
  user_id         uuid,
  guardian_id     uuid,
  organisation_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  version         integer not null default 1
);
create index ix_payers_tenant_email on billing.payers (tenant_id, email);

create table billing.fee_schedules (
  id                uuid primary key,
  tenant_id         uuid not null,
  institution_id    uuid not null,
  academic_year_id  uuid not null,
  term_id           uuid,
  programme_id      uuid,
  level_id          uuid,
  name              text not null,
  currency          char(3) not null,
  status            text not null default 'draft' check (status in ('draft','active','retired')),
  effective_from    date not null,
  effective_to      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,
  constraint ck_fee_dates check (effective_to is null or effective_to >= effective_from)
);
create index ix_fee_schedules_scope
  on billing.fee_schedules (tenant_id, institution_id, academic_year_id, status);

create table billing.fee_items (
  id                uuid primary key,
  tenant_id         uuid not null,
  schedule_id       uuid not null references billing.fee_schedules (id) on delete cascade,
  code              text not null,
  name              text not null,
  item_type         text not null check (item_type in ('mandatory','optional','conditional','one_off','recurring')),
  amount            numeric(19,4) not null check (amount >= 0),
  currency          char(3) not null,
  is_taxable        boolean not null default false,
  tax_rate          numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  is_optional       boolean not null default false,
  due_offset_days   integer not null default 0,
  sort_order        integer not null default 0,
  unique (tenant_id, schedule_id, code)
);

create table billing.fee_assignments (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  schedule_id     uuid not null references billing.fee_schedules (id),
  term_id         uuid,
  status          text not null default 'active' check (status in ('active','cancelled','completed')),
  assigned_at     timestamptz not null default now(),
  created_by      uuid not null
);
create unique index uq_fee_assignment_active
  on billing.fee_assignments (tenant_id, student_id, schedule_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create table billing.scholarships (
  id              uuid primary key,
  tenant_id       uuid not null,
  code            text not null,
  name            text not null,
  scholarship_type text not null check (scholarship_type in ('merit','need','staff','sibling','sponsor','other')),
  funder          text,
  discount_type   text not null check (discount_type in ('percentage','fixed')),
  discount_value  numeric(19,4) not null check (discount_value >= 0),
  eligibility     jsonb not null default '{}'::jsonb,
  status          text not null default 'active' check (status in ('draft','active','retired')),
  unique (tenant_id, code)
);

create table billing.scholarship_awards (
  id              uuid primary key,
  tenant_id       uuid not null,
  student_id      uuid not null,
  scholarship_id  uuid not null references billing.scholarships (id),
  term_id         uuid,
  amount          numeric(19,4) not null check (amount >= 0),
  status          text not null default 'pending' check (status in ('pending','approved','applied','revoked')),
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create unique index uq_scholarship_award
  on billing.scholarship_awards (tenant_id, student_id, scholarship_id, coalesce(term_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending','approved','applied');

create table billing.invoices (
  id                uuid primary key,
  tenant_id         uuid not null,
  institution_id    uuid not null,
  payer_id          uuid not null references billing.payers (id),
  student_id        uuid,
  term_id           uuid,
  invoice_no        text not null,
  issue_date        date not null,
  due_date          date not null,
  currency          char(3) not null,
  subtotal_amount   numeric(19,4) not null default 0,
  discount_amount   numeric(19,4) not null default 0,
  tax_amount        numeric(19,4) not null default 0,
  total_amount      numeric(19,4) not null default 0,
  balance_amount    numeric(19,4) not null default 0,
  status            text not null default 'draft'
                    check (status in ('draft','issued','partially_paid','paid','overdue','void','credited')),
  issued_at         timestamptz,
  voided_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1,
  constraint ck_invoice_due check (due_date >= issue_date),
  unique (tenant_id, institution_id, invoice_no)
);
create index ix_invoices_payer_status on billing.invoices (tenant_id, payer_id, status);
create index ix_invoices_student on billing.invoices (tenant_id, student_id, issue_date);
create index ix_invoices_overdue on billing.invoices (tenant_id, due_date)
  where status in ('issued','partially_paid','overdue');

create table billing.invoice_lines (
  id                uuid primary key,
  tenant_id         uuid not null,
  invoice_id        uuid not null references billing.invoices (id) on delete cascade,
  fee_item_id       uuid references billing.fee_items (id),
  description       text not null,
  quantity          numeric(19,4) not null default 1 check (quantity > 0),
  unit_amount       numeric(19,4) not null check (unit_amount >= 0),
  discount_amount   numeric(19,4) not null default 0 check (discount_amount >= 0),
  tax_amount        numeric(19,4) not null default 0 check (tax_amount >= 0),
  line_total        numeric(19,4) not null check (line_total >= 0),
  source_type       text,
  source_id         uuid,
  sort_order        integer not null default 0
);
create index ix_invoice_lines_invoice on billing.invoice_lines (tenant_id, invoice_id);

create table billing.credit_notes (
  id              uuid primary key,
  tenant_id       uuid not null,
  invoice_id      uuid not null references billing.invoices (id),
  credit_no       text not null,
  amount          numeric(19,4) not null check (amount > 0),
  reason          text not null,
  status          text not null default 'draft' check (status in ('draft','approved','issued','void')),
  approved_by     uuid,
  approved_at     timestamptz,
  issued_at       timestamptz,
  created_at      timestamptz not null default now(),
  unique (tenant_id, credit_no)
);

create table billing.instalment_plans (
  id              uuid primary key,
  tenant_id       uuid not null,
  invoice_id      uuid not null references billing.invoices (id) on delete cascade,
  sequence        integer not null,
  due_date        date not null,
  amount          numeric(19,4) not null check (amount > 0),
  status          text not null default 'pending' check (status in ('pending','due','paid','cancelled')),
  unique (tenant_id, invoice_id, sequence)
);
```

## 2. Payments

```sql
create schema if not exists payments;

create table payments.psp_accounts (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  provider        text not null,
  mode            text not null check (mode in ('test','live')),
  currency        char(3) not null,
  credentials_ref text not null,             -- Secrets Store reference, never the secret
  capabilities    jsonb not null default '{}'::jsonb,
  status          text not null default 'active' check (status in ('active','disabled')),
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, provider, mode, currency)
);

create table payments.payment_intents (
  id                uuid primary key,
  tenant_id         uuid not null,
  invoice_id        uuid,
  payer_id          uuid not null,
  amount            numeric(19,4) not null check (amount > 0),
  currency          char(3) not null,
  provider          text not null,
  psp_account_id    uuid not null references payments.psp_accounts (id),
  status            text not null default 'created'
                    check (status in ('created','pending','succeeded','failed','expired','cancelled')),
  provider_intent_id text,
  idempotency_key   text not null,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index ix_intents_invoice on payments.payment_intents (tenant_id, invoice_id, status);

create table payments.payments (
  id                  uuid primary key,
  tenant_id           uuid not null,
  intent_id           uuid references payments.payment_intents (id),
  payer_id            uuid not null,
  provider            text not null,
  provider_payment_id text not null,
  amount              numeric(19,4) not null check (amount > 0),
  currency            char(3) not null,
  fee_amount          numeric(19,4) not null default 0 check (fee_amount >= 0),
  net_amount          numeric(19,4) not null default 0,
  status              text not null
                      check (status in ('pending','captured','partially_refunded','refunded','failed','chargeback')),
  method              text,
  captured_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, provider, provider_payment_id)
);
create index ix_payments_payer on payments.payments (tenant_id, payer_id, created_at);

create table payments.payment_events (
  id                  uuid primary key,
  tenant_id           uuid not null,
  payment_id          uuid references payments.payments (id),
  provider            text not null,
  provider_event_id   text not null,
  event_type          text not null,
  payload_ref         text,                 -- R2 object key; raw payload retained
  received_at         timestamptz not null default now(),
  processed_at        timestamptz,
  unique (tenant_id, provider, provider_event_id)
);

create table payments.payment_allocations (
  id              uuid primary key,
  tenant_id       uuid not null,
  payment_id      uuid not null references payments.payments (id),
  invoice_id      uuid not null,
  amount          numeric(19,4) not null check (amount > 0),
  allocated_by    uuid not null,
  allocated_at    timestamptz not null default now()
);
create index ix_allocations_payment on payments.payment_allocations (tenant_id, payment_id);
create index ix_allocations_invoice on payments.payment_allocations (tenant_id, invoice_id);

create table payments.refunds (
  id                  uuid primary key,
  tenant_id           uuid not null,
  payment_id          uuid not null references payments.payments (id),
  refund_no           text not null,
  amount              numeric(19,4) not null check (amount > 0),
  reason              text not null,
  status              text not null default 'requested'
                      check (status in ('requested','approved','processing','succeeded','failed','cancelled')),
  approved_by         uuid,
  approved_at         timestamptz,
  provider_refund_id  text,
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (tenant_id, refund_no)
);

create table payments.settlements (
  id                      uuid primary key,
  tenant_id               uuid not null,
  psp_account_id          uuid not null references payments.psp_accounts (id),
  provider_settlement_id  text not null,
  settlement_date         date not null,
  gross_amount            numeric(19,4) not null,
  fee_amount              numeric(19,4) not null default 0,
  net_amount              numeric(19,4) not null,
  currency                char(3) not null,
  status                  text not null default 'pending' check (status in ('pending','reconciled','exception')),
  created_at              timestamptz not null default now(),
  unique (tenant_id, psp_account_id, provider_settlement_id)
);

create table payments.settlement_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  settlement_id   uuid not null references payments.settlements (id) on delete cascade,
  payment_id      uuid references payments.payments (id),
  amount          numeric(19,4) not null,
  fee_amount      numeric(19,4) not null default 0,
  unique (tenant_id, settlement_id, payment_id)
);

create table payments.reconciliation_exceptions (
  id              uuid primary key,
  tenant_id       uuid not null,
  exception_type  text not null
                  check (exception_type in ('missing_in_athena','missing_at_provider','amount_mismatch','duplicate','refund_mismatch','fee_mismatch')),
  payment_id      uuid,
  settlement_id   uuid,
  amount          numeric(19,4),
  currency        char(3),
  status          text not null default 'open' check (status in ('open','investigating','resolved','written_off')),
  assigned_to     uuid,
  notes           text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index ix_recon_open on payments.reconciliation_exceptions (tenant_id, status, created_at)
  where status in ('open','investigating');
```

## 3. Ledger

```sql
create schema if not exists ledger;

create table ledger.accounts (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  code            text not null,
  name            text not null,
  account_type    text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  normal_balance  text not null check (normal_balance in ('debit','credit')),
  parent_id       uuid references ledger.accounts (id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, code)
);

create table ledger.fiscal_years (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  name            text not null,
  starts_on       date not null,
  ends_on         date not null,
  status          text not null default 'open' check (status in ('open','closed')),
  unique (tenant_id, institution_id, name),
  constraint ck_fy_dates check (ends_on > starts_on)
);

create table ledger.accounting_periods (
  id              uuid primary key,
  tenant_id       uuid not null,
  fiscal_year_id  uuid not null references ledger.fiscal_years (id),
  period_no       integer not null,
  starts_on       date not null,
  ends_on         date not null,
  status          text not null default 'open' check (status in ('open','soft_closed','closed')),
  unique (tenant_id, fiscal_year_id, period_no),
  constraint ck_period_dates check (ends_on >= starts_on)
);

create table ledger.journals (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  journal_no      text not null,
  journal_date    date not null,
  period_id       uuid not null references ledger.accounting_periods (id),
  currency        char(3) not null,
  description     text not null,
  source_type     text not null,
  source_id       uuid,
  status          text not null default 'draft' check (status in ('draft','posted','reversed')),
  posted_at       timestamptz,
  posted_by       uuid,
  reversal_of_id  uuid references ledger.journals (id),
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, journal_no)
);
create index ix_journals_period on ledger.journals (tenant_id, period_id, status);

create table ledger.journal_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  journal_id      uuid not null references ledger.journals (id) on delete cascade,
  account_id      uuid not null references ledger.accounts (id),
  debit_amount    numeric(19,4) not null default 0 check (debit_amount >= 0),
  credit_amount   numeric(19,4) not null default 0 check (credit_amount >= 0),
  dimension       jsonb not null default '{}'::jsonb,
  memo            text,
  constraint ck_one_sided check (
    (debit_amount > 0 and credit_amount = 0) or
    (credit_amount > 0 and debit_amount = 0)
  )
);
create index ix_journal_lines_journal on ledger.journal_lines (tenant_id, journal_id);
create index ix_journal_lines_account on ledger.journal_lines (tenant_id, account_id);

create table ledger.budgets (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  fiscal_year_id  uuid not null references ledger.fiscal_years (id),
  name            text not null,
  status          text not null default 'draft' check (status in ('draft','approved','locked')),
  total_amount    numeric(19,4) not null default 0,
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, fiscal_year_id, name)
);

create table ledger.budget_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  budget_id       uuid not null references ledger.budgets (id) on delete cascade,
  account_id      uuid not null references ledger.accounts (id),
  amount          numeric(19,4) not null check (amount >= 0),
  dimension       jsonb not null default '{}'::jsonb,
  unique (tenant_id, budget_id, account_id, dimension)
);
```

### Ledger invariants

```sql
-- Balanced journal check (deferred so lines can be inserted in any order)
create or replace function ledger.assert_journal_balanced()
returns trigger language plpgsql as $$
declare
  v_journal_id uuid;
  v_debits numeric(19,4);
  v_credits numeric(19,4);
begin
  v_journal_id := case when tg_op = 'DELETE' then old.journal_id else new.journal_id end;

  select coalesce(sum(debit_amount),0), coalesce(sum(credit_amount),0)
    into v_debits, v_credits
    from ledger.journal_lines
   where journal_id = v_journal_id;

  if v_debits <> v_credits then
    raise exception 'journal % is not balanced: debits %, credits %',
      v_journal_id, v_debits, v_credits;
  end if;
  return null;
end $$;

create constraint trigger trg_journal_balanced
  after insert or update or delete on ledger.journal_lines
  deferrable initially deferred
  for each row execute function ledger.assert_journal_balanced();

-- Posted journals are immutable
create or replace function ledger.reject_posted_mutation()
returns trigger language plpgsql as $$
begin
  if old.status = 'posted' then
    raise exception 'posted journal % is immutable', old.id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger trg_journal_immutable
  before update or delete on ledger.journals
  for each row execute function ledger.reject_posted_mutation();
```

## 4. Assessment

```sql
create schema if not exists assessment;

create table assessment.grading_schemes (
  id              uuid primary key,
  tenant_id       uuid not null,
  institution_id  uuid not null,
  code            text not null,
  name            text not null,
  mode            text not null check (mode in ('points','percentage','letter','gpa','competency','descriptive')),
  version_no      integer not null,
  config          jsonb not null default '{}'::jsonb,   -- rounding, drop rules, pass mark
  status          text not null default 'draft' check (status in ('draft','published','retired')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (tenant_id, institution_id, code, version_no)
);

create table assessment.grade_bands (
  id              uuid primary key,
  tenant_id       uuid not null,
  scheme_id       uuid not null references assessment.grading_schemes (id) on delete cascade,
  label           text not null,
  min_score       numeric(9,4) not null,
  max_score       numeric(9,4) not null,
  grade_point     numeric(9,4),
  sort_order      integer not null,
  constraint ck_band_range check (max_score > min_score),
  exclude using gist (
    scheme_id with =,
    numrange(min_score, max_score, '[]') with &&
  )
);

create table assessment.assessments (
  id                uuid primary key,
  tenant_id         uuid not null,
  section_id        uuid not null,
  term_id           uuid not null,
  title             text not null,
  assessment_type   text not null
                    check (assessment_type in ('diagnostic','formative','summative','practical','observation','quiz','thesis')),
  grouping          text not null default 'default',
  weight            numeric(7,4) not null default 0 check (weight >= 0 and weight <= 100),
  max_score         numeric(9,4) not null check (max_score > 0),
  rubric_id         uuid,
  opens_at          timestamptz,
  due_at            timestamptz,
  status            text not null default 'draft'
                    check (status in ('draft','open','closed','moderated','published')),
  published_at      timestamptz,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer not null default 1
);
create index ix_assessments_section on assessment.assessments (tenant_id, section_id, status);

create table assessment.assessment_scores (
  id              uuid primary key,
  tenant_id       uuid not null,
  assessment_id   uuid not null references assessment.assessments (id) on delete cascade,
  student_id      uuid not null,
  score           numeric(9,4),
  grade_label     text,
  comment         text,
  status          text not null default 'draft' check (status in ('draft','submitted','moderated','published')),
  marked_by       uuid,
  marked_at       timestamptz,
  unique (tenant_id, assessment_id, student_id)
);
create index ix_scores_student on assessment.assessment_scores (tenant_id, student_id);

create table assessment.moderations (
  id              uuid primary key,
  tenant_id       uuid not null,
  section_id      uuid not null,
  term_id         uuid not null,
  moderator_id    uuid not null,
  sample_size     integer,
  changes         jsonb not null default '[]'::jsonb,
  rationale       text,
  moderated_at    timestamptz not null default now()
);

create table assessment.report_cards (
  id                uuid primary key,
  tenant_id         uuid not null,
  student_id        uuid not null,
  term_id           uuid not null,
  template_version  text not null,
  version_no        integer not null default 1,
  status            text not null default 'draft'
                    check (status in ('draft','generated','published','amended')),
  snapshot          jsonb not null,             -- inputs + computed totals
  document_id       uuid,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (tenant_id, student_id, term_id, version_no)
);
create index ix_report_cards_term on assessment.report_cards (tenant_id, term_id, status);

create table assessment.report_card_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  report_card_id  uuid not null references assessment.report_cards (id) on delete cascade,
  subject_label   text not null,
  score           numeric(9,4),
  grade_label     text,
  teacher_comment text,
  sort_order      integer not null default 0
);

create table assessment.transcripts (
  id                    uuid primary key,
  tenant_id             uuid not null,
  student_id            uuid not null,
  programme_version_id  uuid not null,
  version_no            integer not null,
  status                text not null default 'issued' check (status in ('issued','superseded','revoked')),
  issued_at             timestamptz not null default now(),
  verification_code     text not null unique,
  document_id           uuid,
  signature             text,
  created_at            timestamptz not null default now(),
  unique (tenant_id, student_id, programme_version_id, version_no)
);

create table assessment.transcript_lines (
  id              uuid primary key,
  tenant_id       uuid not null,
  transcript_id   uuid not null references assessment.transcripts (id) on delete cascade,
  course_id       uuid not null,
  term_id         uuid,
  credits         numeric(9,2) not null default 0,
  grade_label     text,
  grade_points    numeric(9,4),
  included_in_gpa boolean not null default true
);

create table assessment.competencies (
  id                    uuid primary key,
  tenant_id             uuid not null,
  curriculum_version_id uuid not null,
  code                  text not null,
  statement             text not null,
  parent_id             uuid references assessment.competencies (id),
  sort_order            integer not null default 0,
  unique (tenant_id, curriculum_version_id, code)
);

create table assessment.outcome_results (
  id              uuid primary key,
  tenant_id       uuid not null,
  competency_id   uuid not null references assessment.competencies (id),
  student_id      uuid not null,
  result          text not null check (result in ('competent','not_yet_competent','exempt','not_assessed')),
  evidence_ref    text,
  assessed_by     uuid not null,
  assessed_at     timestamptz not null default now(),
  unique (tenant_id, competency_id, student_id)
);
```

### Assessment invariants

- `0 ≤ score ≤ max_score` is enforced in the application and by a trigger (cross-table).
- Weight totals per grouping are validated before publication.
- Scores cannot be updated once the assessment is `published`; corrections create an amendment.
- Report card/transcript snapshots are immutable; new versions supersede.
- Transcript issuance requires all included results to be published.

```sql
create or replace function assessment.prevent_published_score_change()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from assessment.assessments a
     where a.id = old.assessment_id and a.status = 'published'
  ) then
    raise exception 'assessment % is published; use an amendment', old.assessment_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

create trigger trg_scores_immutable
  before update or delete on assessment.assessment_scores
  for each row execute function assessment.prevent_published_score_change();
```

## 5. Outbox and inbox

Each producing service's schema includes `outbox`; each consumer includes `inbox`. Financial and
assessment events are published only after the transaction commits (outbox). See
[Integration & events](../01-architecture/integration-and-events.md).

```sql
create table billing.outbox (
  id              uuid primary key,
  tenant_id       uuid not null,
  event_type      text not null,
  event_version   integer not null default 1,
  aggregate_type  text not null,
  aggregate_id    uuid not null,
  payload         jsonb not null,
  headers         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  available_at    timestamptz not null default now(),
  attempts        integer not null default 0,
  sent_at         timestamptz,
  last_error      text
);
create index outbox_pending_idx on billing.outbox (available_at) where sent_at is null;
```

## 6. RLS and immutability

- All tables with `tenant_id` get RLS (same pattern as the core schema).
- Immutable tables: `payments.payment_events`, `payments.payment_allocations`, `ledger.journal_lines`,
  posted `ledger.journals`, published `assessment.report_cards`/`transcripts`.
- Corrections are new rows/documents with references to the original, never destructive updates.
- Financial deletions are prohibited; retention/archival is a move to R2 with object lock.
- Cross-tenant tests cover invoices, payments, journals, scores, report cards and transcripts.
