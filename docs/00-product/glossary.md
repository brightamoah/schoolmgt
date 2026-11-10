# Ubiquitous Language (Glossary)

> **Status:** Accepted · **Owner:** Architecture · **Version:** 1.0
>
> One term, one meaning — in conversation, code, database columns, APIs and UI. Where a term differs
> by institution type, the canonical term is listed with its synonyms.

## Core concepts

| Term | Definition | Notes |
|---|---|---|
| **Tenant** | The contracting customer organisation whose data is isolated from all others. | A trust, district, university or single school. Top-level isolation boundary. |
| **Institution** | A school, campus, college or faculty within a tenant that delivers education. | Has its own timezone, calendar, branding and often currency. |
| **Campus** | A physical location of an institution. | A tenant may have many; a learner enrols at a campus. |
| **Academic year** | A configured period of study, e.g. 2026/27. | Institution-specific start/end. |
| **Term / semester** | A division of an academic year used for enrolment, assessment and billing. | Configurable count and names. |
| **Level** | A stage in the education system (creche, nursery, KG, Grade 1…12, Year 1…, Level 4…). | Data, not enum. Ordered by `sequence`. |
| **Programme** | A structured course of study leading to an award or completion (e.g. BSc Computer Science, SHS Science). | May span years/terms. |
| **Course / subject** | A unit of learning content with a code, credits and outcomes. | "Subject" is the K-12 synonym. |
| **Curricula version / framework** | The specified content and outcomes a programme follows (national, IB, Cambridge, TVET competency framework). | Versioned and immutable once published. |
| **Section / class** | A scheduled offering of a course in a term, with a teacher, room and roster. | The unit of attendance and grading. |
| **Enrolment** | The link between a learner and a programme/section/term with an effective period. | Never deleted; closed with a reason. |
| **Registration** | A learner's selection of course sections for a term (higher ed). | Produces enrolments after validation. |
| **Cohort** | A group of learners progressing together (e.g. Class of 2029). | Used for reporting and bulk actions. |
| **Student number** | Institution-scoped human-readable identifier. | Not a global identifier. |
| **Person** | A human known to the platform, whether or not they are a learner or staff member. | Global identity anchor. |
| **Guardian** | A person with legal or authorised responsibility for a learner. | Relationship carries permissions (pick-up, medical, billing). |
| **Staff member** | An employee or contractor of the institution. | May also be a guardian or learner. |

## Admissions & records

| Term | Definition |
|---|---|
| **Intake** | A period in which applications are accepted for a programme/term. |
| **Application** | A prospective learner's submission for an intake, with answers, documents and fee. |
| **Offer** | A conditional or unconditional place offered to an applicant. |
| **Acceptance** | Applicant's confirmation, often with a deposit. |
| **Applicant** | A person with an application but no active enrolment. |
| **Learner / student / pupil** | A person enrolled in education. "Learner" is the canonical term. |
| **Status** | Lifecycle state of a learner (applicant → enrolled → active → graduated/withdrawn). |
| **Support plan / IEP** | Individual education plan documenting needs, accommodations and reviews. |
| **Transcript** | Official, versioned record of achieved results and awards. |
| **Report card** | Periodic summary of a learner's attendance, assessment and comments. |
| **Academic standing** | A learner's status relative to progression rules (good standing, probation, excluded). |
| **Credit** | A unit quantifying learning volume; definition varies by system (e.g. 1 credit = 10 notional hours). |

## Attendance & scheduling

| Term | Definition |
|---|---|
| **Attendance session** | A dated register for a section, period or whole day. |
| **Attendance record** | One learner's status in one session. |
| **Status code** | Present, absent, late, excused, sick, suspended, holiday, remote. |
| **Timetable** | The scheduled allocation of sections to time, room and teacher. |
| **Period** | A named time slot in the institution day. |
| **Roll-call** | A hostel check confirming presence at a point in time. |
| **Exeat** | Authorised temporary leave from boarding. |

## Assessment

| Term | Definition |
|---|---|
| **Assessment** | Any scored task (exam, quiz, coursework, practical, observation). |
| **Weight** | Contribution of an assessment to a course/term total, expressed as a percentage. |
| **Grading scheme** | The mapping from scores/levels to grades and grade points. |
| **Grade band** | A range within a scheme (e.g. 80–100 = A = 4.0). |
| **GPA / CGPA** | Grade point average for a term / cumulative across terms. |
| **Moderation** | Independent review of marks before ratification. |
| **Exam board** | The body that approves results and progression decisions. |
| **Publication** | The act of making results visible to learners/guardians; audited and reversible only by a new version. |
| **Competency** | A demonstrable skill/outcome assessed against a rubric rather than a percentage. |
| **Rubric** | A criteria-by-level scoring guide. |

## Finance

| Term | Definition |
|---|---|
| **Fee schedule** | The priced set of items applicable to a cohort/programme/term. |
| **Fee item** | A single charge definition (tuition, transport, meals, exam fee). |
| **Invoice** | A demand for payment to a payer (guardian, sponsor, organisation). |
| **Payer** | The party responsible for payment; not necessarily the guardian or learner. |
| **Allocation** | The application of a payment/credit to one or more invoice lines. |
| **Unallocated credit** | Money received but not yet matched to a charge. |
| **Credit note** | A document reducing the amount owed, with reason and approval. |
| **Scholarship / bursary** | An award reducing fees, with eligibility and funding source. |
| **Journal** | A balanced double-entry accounting entry (debits = credits). |
| **Ledger** | The append-only book of accounts and journals. |
| **Trial balance** | Report of all account balances proving debits equal credits. |
| **Settlement** | PSP transfer of captured funds to the institution's bank, with fees. |
| **Reconciliation** | Matching PSP transactions, bank deposits and ledger entries. |
| **Encumbrance** | A commitment against a budget before expenditure. |

## People & payroll

| Term | Definition |
|---|---|
| **Contract** | The terms of a staff member's employment, effective-dated. |
| **Payroll run** | A versioned calculation of pay for a period, approved and locked. |
| **Payslip** | An employee's itemised pay statement for a run. |
| **Statutory deduction** | Tax/social insurance required by law, with jurisdiction-specific rules. |
| **Leave balance** | Accrued entitlement minus taken/planned leave. |

## Communication & learning

| Term | Definition |
|---|---|
| **Announcement** | One-to-many message to a defined audience. |
| **Conversation** | A threaded two-way exchange between participants. |
| **Notification** | A delivery attempt of a message through a channel (email/SMS/push/in-app). |
| **Preference** | A user's chosen channels, language and quiet hours. |
| **Resource** | A file/link in a course. |
| **Assignment** | Work submitted by a learner for feedback/marks. |
| **Submission** | A learner's uploaded response, timestamped and versioned. |

## Cloudflare platform

| Term | Definition |
|---|---|
| **Worker** | A Cloudflare serverless compute unit deployed globally; at Athena, each bounded context is one or more Workers. |
| **Service binding** | Account-internal, RPC-style connection between Workers that avoids the public internet. |
| **Durable Object (DO)** | A single-threaded, strongly consistent object with its own storage and alarms; used for coordination, limits, sequences, presence and revocation. |
| **KV** | Globally replicated, eventually consistent key-value cache; never the authority for sessions or permissions. |
| **R2** | S3-compatible object storage with zero egress fees; stores documents, media, exports and audit archives. |
| **Queue** | At-least-once asynchronous message delivery with batching and a dead-letter queue. |
| **Workflow** | Durable, multi-step execution for long-running jobs such as onboarding, term billing and report-card batches. |
| **Hyperdrive** | Cloudflare's connection pooler and accelerator in front of regional PostgreSQL. |
| **D1** | Cloudflare's SQLite-based database; **not used for core transactional data** in this platform. |
| **BFF** | Backend-for-frontend: the Nuxt/Nitro layer that holds the session cookie, aggregates APIs and shapes data for a UI. |
| **Edge** | Cloudflare's global network where Workers execute, close to the user. |
| **Cell** | A deployable, region-pinned slice of the platform (gateway, Workers, PostgreSQL, R2, queues) serving a set of tenants. |
| **Tail Worker** | A Worker that receives execution traces/logs from another Worker for observability and alerting. |
| **Logpush** | Cloudflare's log export pipeline to R2 or a SIEM. |
| **Analytics Engine** | High-cardinality time-series metrics written from Workers. |
| **Turnstile** | Cloudflare's privacy-preserving bot challenge for public forms. |
| **API Shield** | Edge API protection: schema validation, mTLS and JWT validation. |
| **Workers for Platforms** | Dispatch namespaces for running isolated customer/partner Workers; the basis of the extension marketplace. |
| **Waiting Room** | Cloudflare queueing page for traffic spikes (registration, results day). |
| **Access** | Cloudflare Zero Trust access control for workforce/internal applications — not customer CIAM. |

## Platform & security

| Term | Definition |
|---|---|
| **Cell** | A deployable, region-pinned slice of the platform (gateway, services, databases) serving a set of tenants. |
| **Isolation mode** | `shared` (RLS), `schema`, or `dedicated` (separate database/cluster). |
| **Entitlement** | A feature or limit granted to a tenant by plan/contract. |
| **Principal** | An authenticated actor: user, service account or API client. |
| **Scope** | A coarse permission granted to a token/client (e.g. `students:read`). |
| **Permission** | A fine-grained `resource:action` check evaluated by the policy decision point. |
| **Role** | A named bundle of permissions, assignable within a scope (tenant/institution/section). |
| **ABAC** | Attribute-based access control (e.g. only the learner's assigned teacher). |
| **ReBAC** | Relationship-based access control (guardian-of, teacher-of). |
| **PDP / PEP** | Policy decision point / enforcement point. |
| **Step-up authentication** | Re-authentication (MFA) required immediately before a sensitive action. |
| **Break-glass** | Time-bound, heavily audited emergency access for platform operators. |
| **DPIA** | Data protection impact assessment. |
| **DSAR** | Data subject access request. |
| **RTO / RPO** | Recovery time objective / recovery point objective. |
| **SLO / SLI / error budget** | Service level objective / indicator / permitted unreliability. |
| **Outbox / inbox** | Transactional tables guaranteeing events are published / consumed exactly once effectively. |
| **Saga** | A multi-service workflow with compensating actions. |
| **Idempotency key** | Client-supplied unique key ensuring a retried write has one effect. |

## Naming rules

| Concept | Rule | Example |
|---|---|---|
| Service | singular domain noun + `-service` | `student-service` |
| Database schema | singular domain noun | `student` |
| Table | plural `snake_case` | `student_guardians` |
| API resource | plural `kebab-case` | `/v1/student-guardians` |
| Event | `athena.<domain>.<past-tense-event>.v<major>` | `athena.student.enrolled.v1` |
| Permission | `resource:action` | `invoice:void` |
| Feature flag | `domain.capability` | `finance.autopay` |
| Timezone | IANA identifier | `Africa/Accra` |
| Currency | ISO 4217 | `GHS` |
