# 0003 — PostgreSQL + Hyperdrive + RLS

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Data & Architecture

## Context

The platform needs strong relational integrity for money, grades, enrolment and identity; complex
reporting; multi-tenant isolation; and 1M DAU scale. Cloudflare offers D1 (SQLite), KV and Durable
Objects, but no managed PostgreSQL. Hyperdrive provides pooling/acceleration to regional Postgres.

## Decision

- **PostgreSQL 17** is the transactional source of truth, one **schema per service** (dedicated
  clusters for Tier-1 services when needed).
- Workers connect through **Hyperdrive**; no raw database credentials in Workers.
- **Tenant isolation:** `tenant_id` on every row, **explicit predicate in every query**, RLS enabled
  and forced, runtime role without `BYPASSRLS`.
- Tenant context is set with `SET LOCAL app.tenant_id` **inside the transaction**.
- **Hyperdrive query caching is disabled for tenant-scoped statements**, or the tenant is part of an
  explicit cache key.
- Migrations run in CI with the migrator role using expand/contract; never from a Worker request.
- **No D1 for core data** (see ADR-0010).
- Read replicas serve reporting/search; read-your-writes goes to the primary.

## Consequences

**Positive:** ACID guarantees, mature tooling, SQL reporting, row-level isolation, provider
portability, predictable migrations.

**Negative:** Postgres is a regional dependency and the main scaling bottleneck; Hyperdrive caching
must be handled carefully; connection/pool tuning; provider operations.

**Mitigations:** multi-AZ, PITR, replicas, cell sharding, queue buffering, query budgets,
cross-tenant test suite, load tests, restore drills.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Cloudflare D1 | SQLite limits, cross-DB joins, write throughput, reporting, no mature multi-service transactions. |
| DynamoDB/Firestore | Weak relational invariants for ledger/grading; complex reporting. |
| CockroachDB | Strong but higher cost/ops; not needed at launch. |
| Neon-only without Hyperdrive | Bypasses Cloudflare pooling/acceleration; more connection management. |

## References

- [Database conventions](../03-data/database-conventions.md)
- [Multi-tenancy](../01-architecture/multi-tenancy.md)
- [Cloudflare review](../01-architecture/cloudflare-platform-review.md)
