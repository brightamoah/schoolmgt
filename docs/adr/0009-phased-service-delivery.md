# 0009 — Phased service delivery

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Architecture & Delivery

## Context

The target catalog has 28+ bounded-context services. A ~20-person team cannot build, secure, observe
and operate all of them in 18 months while also delivering product. Premature splitting multiplies
failure modes, contracts and on-call load.

## Decision

- Deliver in **phases**:
  - **Phase 2:** gateway, tenant, identity, authorization, audit, document, notification,
    integration + portal/admin BFF (10 deployables).
  - **Phase 3:** academic, admissions, student, attendance, assessment, billing, payments, ledger,
    reporting (basic) (19 total).
  - **Phase 4:** scheduling, HR, payroll, library, transport, hostel, inventory, health, LMS,
    communication, engagement, search, reporting advanced, parent/student BFFs (33 total).
- **Merge before split:** if two services always change together, keep one.
- A new service requires: clear data ownership, independent scaling/release need, owner, SLO,
  runbook, and a migration plan.
- Start with **logical** database separation (schema + role) even when physically co-located; split
  clusters for Tier-1/high-volume services.
- Re-evaluate boundaries after each phase using cycle time, incidents and coupling data.

## Consequences

**Positive:** earlier value, lower operational risk, fewer contracts, team focus, evidence-based
splitting.

**Negative:** some services are coarser than ideal at launch; later extraction work; risk of
temporary coupling.

**Mitigations:** strict module boundaries, no cross-service SQL, service template, dependency rules,
extraction playbook, architecture review at each gate.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Build all services upfront | Too much surface; delays MVP; operational overload. |
| Permanent modular monolith | Contradicts requirement; scaling/blast-radius limits. |
| One service per developer | Org-driven boundaries; nano-services; high overhead. |

## References

- [Service catalog](../01-architecture/service-catalog.md)
- [SDLC plan](../06-sdlc/sdlc-plan.md)
- [ADR-0001](0001-microservices-in-a-monorepo.md)
