# API & Event Contracts

> **Status:** Accepted · **Owner:** API Guild · **Version:** 2.0
>
> Public and internal APIs are contracts, not implementation details. They are versioned, documented
> with OpenAPI 3.1, tested for compatibility, and generated from the same Zod schemas used at runtime.
> Wire format is **snake_case** for API JSON and events; TypeScript may map to camelCase internally.

## 1. API styles

| Interface | Style | Transport | Audience |
|---|---|---|---|
| Public API | REST/JSON + OpenAPI 3.1 | HTTPS via gateway | Customers, partners |
| App/BFF API | REST/JSON (private) | HTTPS via gateway | Athena frontends |
| Internal service API | REST/JSON over service binding | Cloudflare internal | Other services |
| Events | CloudEvents 1.0 JSON | Cloudflare Queues | Services, integrations |
| Webhooks | CloudEvents + HMAC | HTTPS | Partners |
| Bulk import/export | Async job + R2 signed URL | HTTPS | Admins |

GraphQL is not used initially. If a partner/analytics graph is needed later, it is a BFF over the
same contracts, not a second source of truth.

## 2. URL and resource conventions

```text
https://{tenant-host}/api/v1/{resource}
https://api.athena.example/v1/{resource}          # platform/public API
```

| Rule | Example |
|---|---|
| Plural nouns | `/v1/students` |
| Kebab-case segments | `/v1/student-guardians` |
| IDs in path | `/v1/students/{student_id}` |
| Sub-resources | `/v1/students/{id}/enrolments` |
| Actions as sub-resources | `/v1/invoices/{id}/void`, `/v1/transcripts/{id}/issue` |
| No verbs for CRUD | `POST /v1/students`, not `/createStudent` |
| Tenant from token | Never `/v1/tenants/{tenant_id}/students` for tenant users |
| Platform admin | `/v1/platform/tenants/{id}` (separate scope, audited) |

Status codes:

| Code | Use |
|---|---|
| 200 | OK |
| 201 | Created + `Location` |
| 202 | Accepted (async job) + `Location` |
| 204 | No content |
| 400 | Malformed request |
| 401 | Not authenticated |
| 403 | Authenticated but not permitted |
| 404 | Not found **or not visible in tenant** |
| 409 | Conflict/idempotency/version |
| 412 | Precondition failed (`If-Match`) |
| 422 | Validation error (field-level) |
| 429 | Rate limited + `Retry-After` |
| 500 | Unexpected (no internals leaked) |
| 503 | Dependency unavailable + `Retry-After` |

## 3. Request and response format

### 3.1 Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization: Bearer <token>` | Request | OAuth2/API key |
| `Content-Type: application/json` | Request | JSON only |
| `Accept: application/json` | Request | JSON only |
| `Idempotency-Key` | Request | Write dedupe (UUID) |
| `If-Match` | Request | Optimistic concurrency |
| `traceparent` | Both | W3C distributed trace |
| `X-Request-Id` | Both | Human support ID |
| `ETag` | Response | Version/concurrency |
| `Location` | Response | Created/async resource |
| `RateLimit-*`, `Retry-After` | Response | Quotas |
| `Sunset`, `Deprecation` | Response | Version lifecycle |

### 3.2 Success envelope

Single resource:

```json
{
  "data": {
    "id": "0192f4c1-7a2e-7c3b-9f10-2d6a8e4b1c55",
    "student_number": "S-2026-00142",
    "status": "active",
    "created_at": "2026-09-01T08:00:00Z"
  },
  "meta": { "trace_id": "4bf92f3577b34da6" }
}
```

List:

```json
{
  "data": [ { "id": "..." }, { "id": "..." } ],
  "page_info": {
    "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0wOS0wMVQwODowMDowMFoiLCJpZCI6Ii4uLiJ9",
    "has_more": true,
    "limit": 25
  },
  "meta": { "trace_id": "..." }
}
```

Rules:

- Always an object at the top level (no bare arrays).
- `meta` is optional; `data` is always present.
- Dates/timestamps are ISO-8601 UTC (`Z`); dates are `YYYY-MM-DD`.
- Money is a string decimal + currency: `{ "amount": "1250.00", "currency": "GHS" }`.
- IDs are UUID strings; never expose sequential integers.
- Nulls are explicit; omitted means "not requested" (sparse fieldsets).
- Field names `snake_case`; booleans `is_*`/`has_*`/`can_*`.

## 4. Errors (RFC 9457 Problem Details)

```json
{
  "type": "https://docs.athena.example/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/v1/students",
  "code": "VALIDATION_FAILED",
  "trace_id": "4bf92f3577b34da6",
  "errors": [
    { "field": "date_of_birth", "code": "INVALID_DATE", "message": "Must be a valid date." }
  ]
}
```

Rules:

- Stable `code` for clients; human `detail` for UI.
- Never include stack traces, SQL, secrets, internal hostnames or other tenants' data.
- 401 vs 403: 401 = no/invalid credentials; 403 = authenticated but not allowed.
- 404 for foreign-tenant or unauthorized resource existence.
- Include `Retry-After` for 429/503.
- Log full error server-side with trace ID; return only the safe subset.

## 5. Pagination, filtering, sorting

| Concern | Standard |
|---|---|
| Pagination | Cursor: `?limit=25&after=<cursor>`; max 100 |
| Response | `page_info.next_cursor`, `has_more` |
| Filtering | Allowlisted params: `?status=active&term_id=...`; repeated/comma lists |
| Date ranges | `?created_from=...&created_to=...` (inclusive start, exclusive end) |
| Sorting | `?sort=created_at` / `-created_at`; allowlist only |
| Search | `?q=` with type allowlist; no arbitrary query language |
| Sparse fields | `?fields=id,status,student_number` (allowlist) |
| Expansion | `?include=guardians` (bounded, authorization-checked) |

No unbounded `limit`, no `OFFSET` for large sets, no client-controlled SQL/column names.

## 6. Idempotency and concurrency

### Idempotency

- Required on `POST`/`PATCH` that create money, enrolment, attendance, marks or messages.
- `Idempotency-Key` is a client-generated UUID; stored per tenant/client for 24 h (payments 7 days).
- Same key + same body → replay original response (with `Idempotent-Replay: true`).
- Same key + different body → `409 IDEMPOTENCY_CONFLICT`.
- Concurrent requests with the same key → one executes, others wait/replay.
- Server-side unique constraints are the final guard.

### Optimistic concurrency

- Mutable resources return `ETag: "v3"`.
- Update requires `If-Match: "v3"`; mismatch → `412 PRECONDITION_FAILED`.
- `409` for unique conflicts; `422` for validation.
- Bulk operations report per-item results.

## 7. Authentication and scopes

| Client | Auth | Scopes |
|---|---|---|
| Web app | OIDC + BFF session cookie | Session-bound permissions |
| Mobile app | OIDC + PKCE, refresh rotation | Session-bound |
| Partner API | OAuth2 client credentials | Explicit scopes |
| Simple integration | API key (hashed) | Limited scopes |
| Internal service | Service JWT | Service + tenant scopes |

Scopes are coarse (`students:read`, `invoices:write`); fine-grained permissions are enforced by the
PDP. A token's tenant claim is authoritative; a request body `tenant_id` is ignored/rejected.

## 8. Rate limits and quotas

| Scope | Example | Enforcement |
|---|---|---|
| Per IP | 60 req/min unauthenticated | Edge/DO |
| Per user | 600 req/min | Gateway/DO |
| Per tenant | 5,000 req/min | Gateway/DO |
| Per endpoint | Login 10/min, export 2/hour, payment 20/min | DO |
| Bulk | 5 concurrent jobs | Queue admission |
| Payload | 1 MB JSON; 25 MB upload (direct R2) | Edge |

Response:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit-Limit: 600
RateLimit-Remaining: 0
RateLimit-Reset: 30
```

Quotas are visible to tenant admins; a 429 includes a machine-readable reason.

## 9. Versioning and deprecation

- Major version in URL: `/v1`, `/v2`.
- Additive changes (new optional fields, new endpoints) are non-breaking and allowed in `v1`.
- Breaking changes: removing/renaming fields, changing types/semantics, tightening validation,
  changing auth → new major version.
- Deprecation: `Deprecation: true` + `Sunset: <date>`; minimum 12 months for public APIs.
- Clients must ignore unknown fields.
- Contract tests run against the last two minor versions.
- Internal service contracts follow the same rules; a service can require a minimum peer version
  during rollout.

## 10. OpenAPI and SDKs

- OpenAPI 3.1 generated from Zod schemas (`zod-openapi`).
- Specs live in `packages/openapi` and are published per service.
- Spectral lint: naming, errors, security, examples.
- Breaking-change detection (`oasdiff`) in CI.
- SDKs generated (`openapi-typescript` for frontends; `orval`/custom for partners).
- Examples are tested against a mock server.
- Docs portal includes auth, pagination, errors, rate limits, webhooks and changelog.

## 11. Internal service APIs

- Exposed only via service bindings; no public route.
- Same JSON conventions, but optimized for service needs (batch, context).
- Internal JWT with `aud`, `tenant_id`, `scope`, `trace_id`, `exp ≤ 60s`.
- Timeout/deadline headers; idempotency keys; no retries on non-idempotent calls.
- Contract tests between consumer and provider; consumer-driven where practical.
- A service cannot call another service's database.

```http
POST /internal/students/{id}/context
Authorization: Bearer <service-jwt>
x-athena-deadline-ms: 1500
traceparent: 00-...
```

## 12. Async jobs

For long-running work (exports, report cards, imports, billing runs):

```http
POST /v1/report-cards/batch
Idempotency-Key: ...
→ 202 Accepted
Location: /v1/jobs/0192f4c1-...
```

```json
{
  "data": {
    "job_id": "0192f4c1-...",
    "status": "queued",
    "progress": 0,
    "result_url": null
  }
}
```

- Job status: `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Result is an R2 signed URL (expiring) or a resource link.
- Job events are emitted for UI progress (SSE/polling).
- Idempotent submission; duplicate jobs return the existing job.

## 13. File upload/download

```http
POST /v1/documents/upload-intents
{
  "filename": "birth-certificate.pdf",
  "content_type": "application/pdf",
  "size_bytes": 482133,
  "checksum_sha256": "...",
  "owner_type": "student",
  "owner_id": "...",
  "classification": "confidential"
}
→ 201 { "document_id": "...", "upload_url": "https://...r2...", "expires_at": "..." }
```

- Upload direct to R2; BFF never proxies large files.
- Server validates type/size/checksum; virus scan before availability.
- Download URLs expire ≤ 15 min; `Content-Disposition: attachment`.
- No public buckets; no predictable keys.

## 14. Webhooks

### Subscription

```json
{
  "url": "https://partner.example/athena",
  "event_types": ["athena.payments.captured.v1", "athena.billing.invoice.issued.v1"],
  "secret_ref": "whsec_...",
  "active": true
}
```

### Delivery

```http
POST /athena
Content-Type: application/json
Athena-Event-Id: 0192f4c1-...
Athena-Delivery-Id: 0192f4d0-...
Athena-Signature: t=1762756462,v1=hex(hmac_sha256(secret, timestamp + "." + raw_body))
```

Rules:

- Sign the **raw body** before parsing.
- Timestamp tolerance 5 min; receiver dedupes by `Athena-Event-Id`.
- Retries: 6 attempts over 24 h, exponential backoff + jitter; then DLQ.
- 2xx = success; 4xx (except 408/429) = permanent failure; 5xx/timeout = retry.
- No redirects; HTTPS only; block private IP ranges (SSRF).
- Delivery log: status, latency, attempt, response snippet (no secrets).
- Secrets rotatable with overlap; disable after sustained failure.

## 15. Event contracts

CloudEvents 1.0 envelope; `type = athena.<context>.<past_tense>.v<major>`.

```json
{
  "specversion": "1.0",
  "id": "0192f4c1-7a2e-7c3b-9f10-2d6a8e4b1c55",
  "source": "athena.billing",
  "type": "athena.billing.invoice.issued.v1",
  "subject": "invoices/0192f4c1-...",
  "time": "2026-11-10T09:14:22.318Z",
  "datacontenttype": "application/json",
  "tenantid": "0192f2a0-...",
  "traceparent": "00-...",
  "dataschema": "https://schemas.athena.example/billing/invoice-issued/v1.json",
  "data": {
    "invoice_id": "0192f4c1-...",
    "payer_id": "0192f3b2-...",
    "total_amount": "1250.00",
    "currency": "GHS",
    "due_date": "2026-11-30"
  }
}
```

Rules:

- `id` UUIDv7; dedupe key.
- `tenantid` mandatory and verified by consumers.
- Minimal PII; IDs and facts, not full records.
- Large payloads in R2; event carries `object_ref` + checksum.
- JSON Schema in `packages/contracts/events`, versioned; CI checks backward compatibility.
- Additive optional fields allowed; removals/retypes need a new major.
- Consumers tolerate unknown fields and ignore out-of-order events via version/state.

## 16. Example flows

### Create a student (idempotent)

```http
POST /v1/students
Authorization: Bearer ...
Idempotency-Key: 6f1c2a7e-...
Content-Type: application/json

{
  "institution_id": "0192...",
  "first_name": "Ama",
  "last_name": "Mensah",
  "date_of_birth": "2016-04-12",
  "guardian": {
    "first_name": "Kofi",
    "last_name": "Mensah",
    "email": "kofi@example.com",
    "relationship": "father"
  }
}
```

```http
HTTP/1.1 201 Created
Location: /v1/students/0192f4c1-...
ETag: "v1"
```

### Batch attendance

```http
POST /v1/attendance/sessions/{session_id}/records:batch
Idempotency-Key: ...
{
  "records": [
    { "student_id": "...", "status": "present" },
    { "student_id": "...", "status": "absent", "reason_code": "sick" }
  ]
}
→ 200 { "data": { "accepted": 30, "conflicts": [] } }
```

### Publish results

```http
POST /v1/sections/{section_id}/publications
Idempotency-Key: ...
If-Match: "v7"
→ 202 { "data": { "publication_id": "...", "status": "processing" } }
```

## 17. API review checklist

- [ ] Resource naming, status codes, headers consistent.
- [ ] Zod schema shared; OpenAPI regenerated and linted.
- [ ] Auth scope + permission declared; 401/403/404 tests.
- [ ] Tenant isolation: token tenant, no body tenant.
- [ ] Idempotency on writes; ETag on mutable resources.
- [ ] Pagination/filter/sort allowlists; no unbounded queries.
- [ ] Error codes stable; no internal leakage.
- [ ] Rate limits and quotas defined.
- [ ] Events emitted via outbox; schema versioned.
- [ ] Webhook signature/retry documented.
- [ ] Backward compatibility checked; deprecation plan if breaking.
- [ ] Examples tested; docs updated.
