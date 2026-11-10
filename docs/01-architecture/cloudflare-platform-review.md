# Review: Supplied Cloudflare Implementation Plan

> **Status:** Accepted with changes · **Owner:** Architecture Guild · **Reviewed:** 2026-11-10
> **Subject:** "Enterprise School Management System Architecture" — Nuxt 4 / Nitro / Cloudflare /
> PostgreSQL / Drizzle / 1M daily users.
>
> **Verdict:** The plan's engineering instincts are sound and most of its building blocks are
> retained. It is **not yet a microservice architecture**, it under-specifies the hard parts
> (database topology, tenancy, service-to-service trust, transactional messaging, capacity), and
> three specific choices would create production incidents if implemented literally:
> **KV as the session authority**, **Hyperdrive query caching with RLS**, and **one Worker for the
> whole domain**. This document records the review and the corrections now adopted in the baseline.

---

## 1. What the plan gets right (retained)

| # | Decision | Why it survives review |
|---|---|---|
| R1 | **Strict TypeScript, no `any`** | Catches a large class of defects at compile time and makes contracts explicit. |
| R2 | **Layered architecture** (handler → application → domain → infrastructure) | Keeps business rules independent of Cloudflare bindings and testable without the edge. |
| R3 | **Zod at every boundary** | Runtime validation is mandatory at the edge; types alone do not protect an API. |
| R4 | **Drizzle ORM + PostgreSQL** | Typed SQL, migrations, transactions and a real relational store for financial invariants. |
| R5 | **Cloudflare-native primitives** (DO, KV, R2, Queues, Workflows, Hyperdrive) | Correct tool families for coordination, cache, objects, async and durable long-running work. |
| R6 | **Circuit breakers and graceful degradation** | Essential when the database is a regional dependency and the edge is global. |
| R7 | **Edge rate limiting and DDoS protection** | Cloudflare is the right place to absorb hostile and burst traffic. |
| R8 | **Nuxt UI + Nuxt 4** | Strong SSR/PWA story, good accessibility primitives, fast delivery. |
| R9 | **Multi-tenant RBAC** | Required, but insufficient on its own — see §3.5. |
| R10 | **Type-safe API wrappers and shared types** | Reduces client/server drift; must be paired with generated OpenAPI contracts. |

## 2. Review scorecard

| Dimension | Score | Comment |
|---|---|---|
| Type safety | 8/10 | Right goal; the absolute "zero `as`" rule is impractical and needs narrow, documented exceptions. |
| Layering | 7/10 | Correct pattern, but applied to a single app. Needs per-service composition roots and dependency rules. |
| Cloudflare usage | 6/10 | Good primitive selection; several services are used for the wrong job (KV sessions, DO as coordinator, Queue without outbox). |
| Scalability | 4/10 | "1M concurrent" is not modelled; the database is the bottleneck and has no topology. |
| Reliability | 5/10 | Mentions circuit breakers, but no outbox, idempotency, DLQ policy or failure-mode analysis. |
| Security | 5/10 | RBAC listed; missing service-to-service auth, tenant isolation depth, session revocation, secret handling, supply chain. |
| Data architecture | 5/10 | No schema ownership, migration strategy, partitioning, retention or read-model plan. |
| Operability | 4/10 | No SLOs, tracing, log retention, cost model, preview environments or rollback strategy. |
| Delivery model | 5/10 | One app contradicts the monorepo/microservice requirement; no phased extraction. |
| **Overall** | **5.3/10** | **Promising foundation; not production-ready as written.** |

## 3. Required corrections

### 3.1 One Nuxt/Nitro app is a modular monolith, not microservices

The supplied plan puts users, auth, RBAC, database access and UI in one deployable. That is a valid
starting point, but it is the opposite of the stated requirement and it creates a single blast
radius: a bad deployment or a memory-hungry PDF render takes down admissions, payments and
attendance together.

**Correction (adopted):**

- `apps/*` — Nuxt 4 frontends and BFF routes only (no domain writes, no direct SQL).
- `services/*` — one independently deployed Nitro Worker per bounded context, with its own data
  ownership and release cadence.
- `packages/*` — pure domain, application ports, contracts, UI, config, observability.
- Synchronous internal calls use **Worker service bindings** (no public hop). Asynchronous work uses
  **Queues**; long-running work uses **Workflows**; coordination uses **Durable Objects**.
- A thin **gateway Worker** handles public routing, JWT validation, rate limits, request size limits
  and tenant resolution. It does **not** contain business logic.

See [System architecture](system-architecture.md) and [Service catalog](service-catalog.md).

### 3.2 "1,000,000 concurrent daily users" is an unmade capacity decision

One million **daily active users** and one million **concurrent users** are different systems by an
order of magnitude. The phrase must be replaced with a load model before it drives architecture.

**Adopted baseline (to validate in Phase 1):**

| Dimension | Design target | Notes |
|---|---|---|
| Daily active users | 1,000,000 | Across all tenants and regions |
| Peak concurrent sessions | 100,000 (10% of DAU) | Registration/results days can spike 3–5× |
| Peak API request rate | 10,000 RPS sustained, 30,000 RPS burst | Gateway-level; mostly reads |
| Write rate | 1,500–3,000 writes/s at peak | Attendance and payments are bursty |
| Database QPS | ≤ 20,000 read QPS per primary-cell; ≤ 5,000 write QPS | Requires replicas, caching, batching |
| Tenant size | 250,000 learners max | Larger customers get a dedicated cell |
| Data volume | 5–10 TB/year per large cell | Partition hot tables; archive cold data |

If the true requirement is **1M simultaneous** users, the design needs 10–50× more database
capacity and aggressive sharding; that is a different programme and must be confirmed in writing.
**Action:** Product and CTO sign off on the load model before Phase 2 exit.

### 3.3 KV must not be the session authority

Cloudflare KV is eventually consistent (changes can take up to ~60 seconds to propagate globally).
Using it as the source of truth for sessions means a revoked session can remain valid, and a login
on one edge can be invisible on another. That is a security defect, not a latency trade-off.

**Correction (adopted):**

- Browser receives an **opaque, HttpOnly, Secure, SameSite=Lax session cookie** — never a JWT in
  JavaScript-accessible storage.
- Session record lives in **Postgres** (authoritative) with a short-lived **KV cache** keyed by
  `session:<id>:<version>` for fast validation.
- Revocation writes the record and bumps `session_version`; a **Durable Object** per user (or per
  tenant shard) pushes invalidation and enforces immediate cutoff. KV TTL ≤ 60 s is a backstop, not
  the control.
- Access tokens (for service calls) are short-lived (≤ 10 min), audience-scoped and never stored in
  the browser.
- Step-up authentication is required for money movement, role changes, transcript issuance and
  bulk exports.

### 3.4 Hyperdrive caching + RLS can leak data across tenants

Hyperdrive pools and may cache query results. If tenant isolation depends only on a session
variable (`SET app.tenant_id`) and the cache key is the SQL text, two tenants issuing the same SQL
can receive each other's cached rows.

**Correction (adopted) — defence in depth:**

1. Every tenant-scoped query includes an **explicit `tenant_id = $n` predicate**. RLS is a second
   line, never the only line.
2. Tenant context is set with `SET LOCAL app.tenant_id` **inside the same transaction** as the query.
3. Hyperdrive query caching is **disabled for tenant-scoped statements** (or the tenant ID is part
   of an explicit cache key where caching is safe).
4. Database roles: the runtime role has **no `BYPASSRLS`**; migrations and control-plane jobs use a
   separate role.
5. A cross-tenant test suite runs on every PR against a seeded two-tenant database; it asserts 404
   (not 403) for foreign IDs.
6. Analytics and exports use a separate read-only role with tenant filters injected by the query
   builder, not by user input.

### 3.5 RBAC alone is not enough for a school

Roles such as `teacher` do not answer "which learners may this teacher see?" A teacher must see
their sections, not every learner in the institution. A guardian must see their children, not other
children in the class. A bursar must see balances, not medical notes.

**Correction (adopted):** combine **RBAC + ABAC + ReBAC**:

- RBAC: coarse role → permission bundles (`student:read`, `invoice:void`).
- ABAC: institution, campus, programme, section, ownership, classification.
- ReBAC: `guardian_of`, `teacher_of`, `assigned_to`, `approver_of` relationships stored as a graph and evaluated by the authorization service (Cedar + ReBAC).
- Authorization is centralized in `authorization-service` (PDP), enforced at gateway and in every
  service (PEP). Deny by default. See [Identity & access](../04-security/identity-and-access.md).

### 3.6 No transactional messaging

Writing to Postgres and then enqueueing to Cloudflare Queues is a dual write. If the queue call fails
after commit, the event is lost; if it succeeds before commit, consumers see a state that never
existed.

**Correction (adopted):** transactional **outbox** in the same database transaction, relayed by a
scheduled Worker or Durable Object alarm; consumers are idempotent (`event_id` inbox table); failures
go to a DLQ with an operator runbook. Queues are at-least-once and unordered; ordering-sensitive
flows use a DO or a per-aggregate sequence. See [Integration & events](integration-and-events.md).

### 3.7 No service-to-service trust model

Service bindings are account-internal but not automatically authenticated or tenant-scoped. A
compromised Worker or an accidental call with a forged header could act as another tenant.

**Correction (adopted):**

- Gateway strips all inbound `x-athena-*` and `x-tenant-*` headers and re-injects verified context.
- Internal calls carry a short-lived **service JWT** signed by the platform: `iss`, `aud` (target
  service), `sub` (service or user), `tenant_id`, `scope`, `trace_id`, `exp` ≤ 60 s.
- Each service verifies signature, audience, expiry and tenant; it never trusts a raw header.
- Service-to-service calls use **Cloudflare Access service tokens** for non-Worker origins and
  **mTLS** for external partners. No shared static secrets.
- Egress to external providers goes through a small `integration-service`, not from every domain
  service.

### 3.8 The plan has no migration or data-lifecycle strategy

Drizzle Kit is named but not how migrations run, who owns them, or how zero-downtime changes work.

**Correction (adopted):**

- One schema per service; migrations are owned by the service team and run by CI **before** the
  Worker deploy, never from a Worker request.
- Expand → backfill → switch → contract; destructive changes only after two releases.
- Migrations are linted, reviewed, reversible where possible, and tested against a production-like
  snapshot.
- PII retention, legal hold and deletion are designed per table (see
  [Data architecture](../03-data/data-architecture.md)).

### 3.9 The "zero `as`" rule is directionally right but unenforceable as stated

Banning `any` is correct. Banning every `as` breaks legitimate patterns (`as const`, discriminated
unions, library interop) and encourages worse workarounds (`@ts-ignore`, `unknown` casts).

**Correction (adopted):**

- **Banned:** `any`, `@ts-ignore` without an expiry and owner, unsafe `as SomeType` on external data,
  non-null assertions on untrusted values.
- **Allowed:** `as const`, `satisfies`, type guards, and a narrow, documented boundary adapter for
  third-party types (with a runtime schema test).
- All external input is parsed by Zod at the edge; all database rows are typed by Drizzle inference.
- ESLint rules enforce the policy in CI; `tsc --noEmit` is a required check.

### 3.10 Missing production controls

The plan omits: SLOs/error budgets, OpenTelemetry traces, audit retention, secret management,
supply-chain signing, preview environments, rollback, load testing, DR, cost controls, and a
data-residency model. These are added in the platform docs and are **release gates**, not later
hardening.

## 4. Corrected Cloudflare responsibility map

The goal is to give each concern to the service designed for it, so no single primitive becomes a
bottleneck or a single point of failure.

| Concern | Cloudflare service | Responsibility | Explicitly not for |
|---|---|---|---|
| DNS, TLS, certificates | DNS, SSL/TLS, Certificate Manager | Authoritative DNS, edge certs, custom hostnames | Application routing logic |
| CDN & caching | Cache Rules, Tiered Cache, Smart Shield | Static assets, public pages, safe GET caching | Authenticated tenant data unless keyed correctly |
| DDoS & WAF | DDoS Protection, WAF managed/custom rules, Bot Management | Absorb attacks, block OWASP patterns, bot scoring | Business authorization |
| Forms & signup abuse | Turnstile | Bot-resistant public forms, login, admissions | Replacing MFA |
| API protection | API Shield (schema validation, JWT validation, mTLS) | Reject malformed/unauthorized traffic at edge | Domain validation |
| Peak shaping | Waiting Room | Registration/results/exam-result spikes | Normal traffic |
| Public routing | Gateway Worker | AuthN, tenant resolution, routing, quotas | Business logic, SQL |
| Frontends / BFF | Workers (Nuxt/Nitro), Workers Builds | SSR, session cookies, aggregation, UI | Domain writes, cross-service SQL |
| Domain logic | Service Workers + service bindings | Bounded-context business rules, transactions | Public exposure |
| Coordination / realtime | Durable Objects | Rate limits, idempotency keys, sequences, presence, WebSocket fan-out, session revocation | Primary database, long-term storage |
| Cache / config | KV | Read-heavy reference data, rendered fragments, public config | Authoritative sessions, permissions, money |
| Objects | R2 + presigned URLs + event notifications | Documents, media, exports, backups, audit archive (object lock) | Transactional metadata |
| Async work | Queues + DLQ | Events, notifications, audit, document processing, webhooks | Strict ordering, long-running steps |
| Durable workflows | Workflows | Tenant onboarding, term billing, report-card batches, payroll runs | Per-request latency paths |
| SQL access | Hyperdrive | Pooling, regional acceleration, controlled caching | Query semantics, tenant isolation |
| Analytics | Analytics Engine, Logpush, GraphQL Analytics | High-cardinality ops metrics, logs to R2/SIEM | System of record, billing ledger |
| AI | Workers AI, AI Gateway, Vectorize, AI Search | Copilots, semantic search, document Q&A | Unsupervised decisions on learners |
| Media | Images, Stream | Photos, lesson video, thumbnails | Original document archive |
| Live | Realtime / Calls | Live classes, webinars | Recorded content store |
| Inbound email | Email Routing / Email Workers | Support and admissions inboxes | Bulk transactional sending |
| Outbound email/SMS | External providers via `integration-service` | Transactional and bulk messaging | — |
| Workforce access | Cloudflare Access, Gateway, WARP | Zero-trust access to internal tools and admin | Customer CIAM |
| Device/on-prem connectivity | Cloudflare Tunnel, Spectrum | Biometric devices, cameras, legacy systems | General public APIs |
| Feature flags | Flagship (where available) or KV/DO config | Gradual rollout, tenant entitlements | Authorization |
| Extensions | Workers for Platforms | Sandboxed customer/partner extensions | Core domain execution |

## 5. Answers to the plan's open questions

### 5.1 Database provider & connection method

**Recommendation: PostgreSQL 17 behind Hyperdrive, provider chosen per cell.**

| Option | Use when | Trade-offs |
|---|---|---|
| **Neon** (recommended default) | SaaS launch, fast branching, autoscaling, per-PR databases | Serverless cold starts; connection limits; verify Hyperdrive compatibility and pooling mode |
| **AWS RDS/Aurora** | Enterprise cells, existing AWS commitments, predictable heavy writes | Less elastic; operational overhead; cross-region read replicas |
| **Google Cloud SQL** | GCP-centric customers | Similar to RDS; region selection |
| **Self-managed Postgres** | Data-sovereignty or on-prem contracts | You own HA, backups, patching, PITR |

Rules:

- Hyperdrive is always the Worker-facing connection path; Workers never hold raw DB credentials
  beyond the Hyperdrive binding.
- Use **transaction pooling**; set tenant context with `SET LOCAL` inside a transaction.
- Read replicas serve reporting/search projections; never read-your-writes from a replica in a
  write-then-read flow.
- Each cell has a primary, at least one replica, PITR ≥ 35 days, and a tested restore runbook.
- **Do not use D1 for core transactional data.** D1 is acceptable only for a future edge-local,
  non-authoritative cache/reference use case, and only after an ADR.

### 5.2 Authentication method

**Recommendation: managed OIDC IdP + BFF session cookies + short-lived internal tokens.**

- Customer identity (parents, learners, staff): managed OIDC (Clerk, Auth0 or Entra External ID)
  with SAML federation for enterprise schools, SCIM for provisioning, passkeys/TOTP MFA.
- Workforce/platform operators: **Cloudflare Access** (zero trust) in front of internal consoles.
- Browser: opaque session cookie; no tokens in `localStorage`; CSRF protection; rotation on privilege
  change.
- Internal: service JWT (see §3.7), verified per service.
- Revocation: Postgres authority + DO invalidation + KV cache backstop.
- If a customer contract forbids a third-party IdP, `identity-service` can implement OIDC with
  WebAuthn/Argon2id, but this is a **deliberate security exception** requiring a threat model and
  penetration test; it is not the default.

## 6. Cloudflare limits that shape the design

Verify exact current limits at build time; these are design constraints, not contractual numbers.

| Limit / behaviour | Design response |
|---|---|
| Worker CPU time is bounded per request | Keep requests short; move PDF generation, imports, bulk billing and report cards to Workflows/Queues. |
| Worker memory is bounded | Stream large files; never load a full export into memory; use R2 multipart. |
| Subrequest limits per invocation | Batch external calls; use Queues for fan-out; avoid N+1 provider calls. |
| KV is eventually consistent | Cache only; version keys; never use for authorization or session authority. |
| Queues are at-least-once and not strictly ordered | Idempotent consumers; inbox table; per-aggregate ordering via DO when required. |
| Queue message size is bounded | Store payloads in R2/Postgres and pass references for large events. |
| Workflows are for durable, multi-step work | Idempotent steps; checkpoint; do not use for interactive latency. |
| Durable Objects are single-threaded per object | Shard keys (tenant + bucket); avoid one global counter; use alarms, not busy loops. |
| DO storage is not a general database | Authoritative data in Postgres; DO holds coordination state and short-lived metadata. |
| Hyperdrive pools connections | Use transactions; avoid long-held connections; monitor pool saturation. |
| Workers have no local disk | R2 for files; Postgres for state; no `/tmp` assumptions. |
| Logs have retention limits | Tail Workers/Logpush to R2/SIEM; audit is separately retained. |
| Cloudflare has no managed Postgres | Hyperdrive + external Postgres; this is the regional dependency. |

## 7. What changes in the baseline

| Area | Before (supplied plan) | After (this baseline) |
|---|---|---|
| Deployable | One Nuxt/Nitro app | Apps + 20+ service Workers |
| Routing | Nuxt server routes | Gateway Worker + service bindings |
| Sessions | KV | Postgres authority + DO invalidation + KV cache |
| Messaging | Queue calls inline | Transactional outbox + Queues + DLQ |
| Long jobs | In-request | Workflows |
| Tenancy | RBAC + tenant FK | RLS + explicit predicates + Cedar/ReBAC + per-tenant keys |
| Auth | Custom KV/JWT | Managed OIDC + BFF cookies + service JWT |
| Database | One Postgres, unspecified | Schema per service, Hyperdrive, replicas, cells |
| Scale | "1M concurrent" | Signed load model: 1M DAU, 100k concurrent, 10k RPS |
| Type policy | Zero `as` | No `any`/unsafe assertions; narrow documented exceptions |
| Ops | Not specified | SLOs, OTel, Logpush, runbooks, DR, cost model |
| Extensibility | None | Webhooks, API, Workers for Platforms, marketplace |

## 8. Residual risks accepted for now

| Risk | Impact | Mitigation | Owner |
|---|---|---|---|
| External Postgres is a regional dependency | Latency and availability below edge SLO | Multi-AZ, replicas, Hyperdrive, cell failover, read caching | Platform |
| Managed IdP adds a vendor | Cost, contract, outage | Abstraction in `identity-service`, break-glass local admin, SLA review | Security |
| Cloudflare-specific bindings | Lock-in | Pure domain/application packages; adapters behind ports; exit plan | Architecture |
| 1M DAU unproven at launch | Cost/performance surprises | Load model, k6 tests, staged rollout, cell sharding | CTO |
| DO hot keys | Latency/limits | Shard by tenant + bucket; monitor; fallback to edge rate limits | Platform |
| Queue duplicates | Double side effects | Idempotency + inbox + unique constraints | Services |
| Workers runtime limits | Timeouts on large operations | Workflows, chunking, streaming, async jobs | Services |
| Regulatory change | Re-work | Configurable retention/policy, legal review, DPIA | Compliance |

## 9. Decision log

| ID | Decision | Status |
|---|---|---|
| D-01 | Adopt Cloudflare Workers as the compute platform; Nitro for services and apps. | Accepted |
| D-02 | Microservices per bounded context in one pnpm/Turborepo monorepo; service bindings for sync, Queues for async. | Accepted |
| D-03 | PostgreSQL per service schema, Hyperdrive, RLS + explicit tenant predicates. | Accepted |
| D-04 | Managed OIDC for customer identity; Cloudflare Access for workforce; Cedar + ReBAC for relationships. | Accepted |
| D-05 | Outbox + idempotent consumers; Workflows for long-running jobs; DO for coordination only. | Accepted |
| D-06 | R2 for objects with object lock for audit; KV as cache only. | Accepted |
| D-07 | Capacity baseline: 1M DAU, 100k concurrent, 10k RPS; confirm in Phase 1. | Accepted pending sign-off |
| D-08 | No D1 for core data. | Accepted |
| D-09 | Cloudflare is not the database or the IdP; deliberate exceptions documented. | Accepted |

## 10. Recommendation

Proceed with the corrected baseline. Retain the plan's **type discipline and layering**, but apply
them **per service**, not to one application. Treat the database, identity and messaging as
first-class design problems. Do not start Phase 2 until the load model, database topology and
identity decision are signed off, because all three are expensive to reverse.
