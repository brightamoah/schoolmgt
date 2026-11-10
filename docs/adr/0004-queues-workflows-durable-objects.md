# 0004 — Queues, Workflows, Durable Objects

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Architecture

## Context

Services must communicate asynchronously without a shared database or distributed transactions.
Some processes are long-running (tenant onboarding, term billing, report cards, payroll), some need
strict coordination (invoice numbers, seat reservation, publication locks, session revocation), and
some need real-time fan-out (messaging, transport).

Kafka is not available as a Cloudflare-native service; operating it would add a cluster and skills
the team does not need.

## Decision

- **Transactional outbox** in Postgres for every event; relay to **Cloudflare Queues**.
- Consumers are **idempotent** using an inbox table keyed by event ID; failures retry then go to a
  **DLQ** with replay tooling.
- **Workflows** for durable, multi-step processes with compensations and visible status.
- **Durable Objects** for coordination only: rate limits, idempotency keys, sequences, locks,
  session revocation, presence, live trip state, audit chain heads.
- **KV is cache only** — never the authority for sessions or permissions.
- Ordering-sensitive flows use aggregate versions or a DO; Queues are at-least-once and unordered.

## Consequences

**Positive:** no Kafka cluster, native Cloudflare integration, durable long-running work, strong
per-key coordination, clear failure handling.

**Negative:** at-least-once semantics, no global ordering, DO single-threaded/hot-key limits,
Queue/Workflow limits, more application-level idempotency.

**Mitigations:** outbox/inbox, unique constraints, DLQ + replay, DO sharding, capacity tests,
monitoring of queue age and DO request rates.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Kafka/Redpanda | Extra cluster, ops, cost; not needed for current volume. |
| Temporal | Excellent but another platform to operate; Workflows covers v1. |
| Direct Queue publish from handlers | Dual-write data loss/inconsistency. |
| DO as primary event store | Not a database; storage/throughput limits. |
| Cron + DB polling only | Higher latency, thundering herd, poor fan-out. |

## References

- [Integration & events](../01-architecture/integration-and-events.md)
- [Cloudflare review](../01-architecture/cloudflare-platform-review.md)
- [ADR-0003](0003-postgres-hyperdrive-and-rls.md)
