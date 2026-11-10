# 0008 — REST/OpenAPI + event contracts

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** API Guild

## Context

The platform must expose stable public APIs, typed internal contracts and event schemas that evolve
without breaking consumers. The stack is TypeScript; Zod already validates at runtime. GraphQL/gRPC
add tooling and operational complexity that is not justified for v1.

## Decision

- **Public and internal sync APIs:** REST/JSON with **OpenAPI 3.1**, generated from Zod schemas.
- **Wire format:** `snake_case` JSON; ISO-8601 UTC; money as decimal string + ISO currency.
- **Versioning:** `/v1`, additive changes allowed; breaking changes require `/v2` and a 12-month
  deprecation window.
- **Errors:** RFC 9457 Problem Details with stable `code` and `trace_id`.
- **Idempotency:** `Idempotency-Key` on writes; `ETag`/`If-Match` for concurrency.
- **Events:** CloudEvents 1.0 JSON over Queues, JSON Schema/Zod contracts, `<context>.<event>.vN`.
- **No GraphQL or gRPC in v1.** A GraphQL BFF may be added later over the same contracts.
- Contract tests and breaking-change detection run in CI.

## Consequences

**Positive:** simple, cacheable, widely understood; generated types/SDKs; strong validation; clear
versioning; easy partner adoption.

**Negative:** over/under-fetching for complex screens (BFF composition mitigates); multiple round
trips; strict discipline required for event evolution.

**Mitigations:** BFF aggregation, sparse fieldsets, include/expand, contract tests, schema registry,
versioned events.

## Alternatives considered

| Option | Why rejected |
|---|---|
| GraphQL-first | Complexity, authorization per field, caching, N+1; not needed for v1. |
| gRPC/Protobuf internal | Tooling and debugging overhead; JSON contracts suffice at current scale. |
| tRPC | Great for a monolith, poor for public/partner contracts and cross-language. |
| Unversioned REST | Breaks integrations silently. |

## References

- [API & event contracts](../05-api/api-and-event-contracts.md)
- [Integration & events](../01-architecture/integration-and-events.md)
- [ADR-0004](0004-queues-workflows-durable-objects.md)
