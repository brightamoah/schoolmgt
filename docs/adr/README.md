# Architecture Decision Records

> **Status:** Accepted · **Owner:** Architecture Guild

## Process

1. Copy `TEMPLATE.md` to `NNNN-short-title.md`.
2. Fill Context, Decision, Consequences, Alternatives.
3. Open a PR; architecture guild reviews within 3 business days.
4. Accepted ADRs are immutable. Supersede with a new ADR that references the old one.
5. Link the ADR from affected docs and code comments.

Status values: `Proposed`, `Accepted`, `Rejected`, `Superseded by NNNN`, `Deprecated`.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-microservices-in-a-monorepo.md) | Microservices in a monorepo | Accepted |
| [0002](0002-cloudflare-workers-and-nitro.md) | Cloudflare Workers + Nitro | Accepted |
| [0003](0003-postgres-hyperdrive-and-rls.md) | PostgreSQL + Hyperdrive + RLS | Accepted |
| [0004](0004-queues-workflows-durable-objects.md) | Queues, Workflows, Durable Objects | Accepted |
| [0005](0005-managed-identity-and-cedar.md) | Managed identity + Cedar/ReBAC | Accepted |
| [0006](0006-nuxt-bff-frontend.md) | Nuxt BFF frontend | Accepted |
| [0007](0007-wrangler-terraform-and-gitops.md) | Wrangler + Terraform + GitOps | Accepted |
| [0008](0008-rest-openapi-and-event-contracts.md) | REST/OpenAPI + event contracts | Accepted |
| [0009](0009-phased-service-delivery.md) | Phased service delivery | Accepted |
| [0010](0010-no-d1-for-core-data.md) | No D1 for core data | Accepted |
| [0011](0011-strict-typescript-policy.md) | Strict TypeScript policy | Accepted |

## Template

```markdown
# NNNN — Title

> **Status:** Proposed · **Date:** YYYY-MM-DD · **Owner:** Role
> **Supersedes:** NNNN (optional)

## Context
What forces are at play? Constraints, scale, regulations, team.

## Decision
What we will do, precisely.

## Consequences
Positive, negative, risks, follow-ups.

## Alternatives considered
Option, why rejected.

## References
Links to docs, spikes, benchmarks.
```
