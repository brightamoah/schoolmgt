# 0002 — Cloudflare Workers + Nitro

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Architecture

## Context

The platform must serve up to 1M daily active users globally, with bursty traffic around
registration, results and payments. The team is TypeScript-centric and wants low operational
overhead, global latency and integrated edge security. Cloudflare is the selected platform.

## Decision

- Run applications and services on **Cloudflare Workers** (paid plan).
- Use **Nitro** (`cloudflare-module` preset) as the service/app framework, with Zod validation and
  OpenAPI generation.
- Pin a `compatibility_date` per Worker; enable `nodejs_compat` only where needed.
- Keep request CPU low; offload PDF generation, imports, bulk billing and report cards to
  **Workflows/Queues**.
- Do not rely on local disk, long-lived processes, or Node-only APIs in Workers.
- Keep domain/application code free of Cloudflare imports behind ports/adapters.

## Consequences

**Positive:** global edge, no servers to patch, integrated WAF/DDoS/cache, fast deploys, usage-based
cost, strong TypeScript support.

**Negative:** runtime limits (CPU, memory, subrequests), no managed Postgres on Cloudflare, vendor
lock-in, local emulation gaps, cold starts for some patterns.

**Mitigations:** capacity model, async offload, Hyperdrive for Postgres, port/adapter boundaries,
Miniflare + `vitest-pool-workers`, documented exit paths, limit monitoring.

## Alternatives considered

| Option | Why rejected |
|---|---|
| AWS Lambda@Edge / regional Lambda | More operational complexity; weaker edge integration; cold starts. |
| Containers on ECS/Kubernetes | Higher ops burden, slower scale-to-zero, unnecessary for request/response. |
| Vercel/Netlify | Less control over WAF/queues/DO/storage; cost at scale. |
| Cloudflare Pages Functions only | Insufficient for long-running/queued workflows and service composition. |

## References

- [System architecture](../01-architecture/system-architecture.md)
- [Cloudflare review](../01-architecture/cloudflare-platform-review.md)
- [ADR-0003](0003-postgres-hyperdrive-and-rls.md)
