# 0010 — No D1 for core data

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Data & Architecture

## Context

Cloudflare D1 is a managed SQLite database with edge read replication. It is attractive for
low-latency edge data, but Athena needs multi-tenant financial ledgers, complex reporting, strong
constraints, high write throughput and cross-entity transactions at 1M DAU. PostgreSQL via
Hyperdrive is already selected for these reasons.

## Decision

- **D1 is not used for core transactional data.**
- Acceptable future uses (requiring a new ADR): a non-authoritative, edge-local reference cache or a
  small per-tenant configuration store that can be rebuilt from Postgres.
- If D1 is introduced, it must have a documented source of truth, sync/rebuild path, tenant
  isolation test and failure behaviour.
- Core data remains in PostgreSQL; derived/edge caches use KV/DO with explicit invalidation.

## Consequences

**Positive:** one transactional model; strong constraints and reporting; no dual-write/sync
complexity; avoids SQLite write/scale limits.

**Negative:** no edge-local SQL reads; higher latency for distant DB regions (mitigated by
Hyperdrive, replicas, caching, cells).

**Mitigations:** read replicas, KV caching, regional cells, query budgets, reporting read models.

## Alternatives considered

| Option | Why rejected |
|---|---|
| D1 for all data | SQLite limits, cross-DB joins, reporting, write throughput, transactions. |
| D1 for tenant config + Postgres core | Dual source of truth/sync complexity; low benefit. |
| D1 for audit | Append-only/high volume and 7-year retention; Postgres + R2 WORM better. |

## References

- [Data architecture](../03-data/data-architecture.md)
- [ADR-0003](0003-postgres-hyperdrive-and-rls.md)
- [Cloudflare review](../01-architecture/cloudflare-platform-review.md)
