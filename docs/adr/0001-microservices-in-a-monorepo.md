# 0001 — Microservices in a monorepo

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Architecture

## Context

The domain spans admissions, academic structure, attendance, assessment, finance, HR/payroll,
operations, communication and higher education. These areas have different consistency needs,
release cadences, scaling profiles and data sensitivity. The team is ~20 people and must deliver an
MVP in 10 months without operating 25 independent platforms on day one.

The supplied implementation plan described one Nuxt/Nitro application with layered folders. That is
a modular monolith, not the requested microservice architecture, and it creates a single blast
radius for auth, payments, attendance and UI.

## Decision

- Build **bounded-context services** as independently deployable Cloudflare Workers in **one pnpm +
  Turborepo monorepo**.
- Each service owns its schema, credentials, events, SLO and on-call.
- Synchronous internal calls use **service bindings**; asynchronous integration uses **Queues**;
  long-running processes use **Workflows**; coordination uses **Durable Objects**.
- Frontends (`apps/*`) are separate Workers and never own domain invariants.
- Start with a **subset** of services (see ADR-0009). Merge before splitting; do not create
  nano-services.

## Consequences

**Positive:** independent deploys, clear ownership, isolated failure domains, targeted scaling,
technology consistency through shared packages.

**Negative:** more deployables, distributed debugging, eventual consistency, contract management,
higher observability and on-call overhead.

**Mitigations:** golden-path service template, shared contracts, strict dependency rules, service
catalog with SLOs, outbox/inbox, distributed tracing, phased rollout.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Modular monolith | Faster initially but contradicts the requirement; scaling and blast-radius limits; extraction later is expensive. |
| Multi-repo | Version skew, dependency hell, slow cross-cutting changes; worse for a small team. |
| Function-per-endpoint | No bounded context, shared data, unmanageable contracts. |
| All services upfront | Too much operational surface for the team and timeline. |

## References

- [System architecture](../01-architecture/system-architecture.md)
- [Service catalog](../01-architecture/service-catalog.md)
- [ADR-0009](0009-phased-service-delivery.md)
