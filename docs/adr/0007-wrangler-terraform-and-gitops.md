# 0007 — Wrangler + Terraform + GitOps

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Platform Engineering

## Context

Production requires reproducible infrastructure, least-privilege deployment credentials, auditability
and fast rollback. Cloudflare resources span Worker code/bindings and account-level objects (DNS,
WAF, R2, Queues, Access, Hyperdrive, Logpush).

Wrangler excels at Worker code/bindings; Terraform excels at account resources and drift detection.
Using one tool for both creates friction.

## Decision

- **Wrangler** deploys Worker code, routes, bindings, vars and secret references, by immutable
  version with gradual rollout.
- **Terraform/OpenTofu** manages account/zone resources: DNS, WAF, API Shield, Access, R2, Queues,
  Hyperdrive configs, Logpush, Waiting Room, custom hostnames.
- **GitHub Actions** is the CI/CD control plane; production requires approval; artifacts are
  versioned, hashed and attested.
- Terraform state is remote and locked; plans run on every PR; drift detection daily.
- Separate Cloudflare accounts for production and non-production; previews are ephemeral.
- No manual console changes; break-glass changes are recorded and reconciled.

## Consequences

**Positive:** reproducible environments, reviewable changes, least privilege, rollback by version,
audit evidence, drift detection.

**Negative:** two tools to learn; state management; some resource overlap; pipeline complexity.

**Mitigations:** modules, golden-path templates, documented ownership, automated drift alerts,
regular platform training.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Wrangler only | Account resources become manual/drifting; weak audit. |
| Terraform only | Worker code/bindings deployment is awkward and slower. |
| Manual console | Not reproducible, unauditable, unsafe. |
| Argo CD/Kubernetes GitOps | No Kubernetes in this architecture. |

## References

- [CI/CD, environments & infrastructure](../07-devops/cicd-environments-infrastructure.md)
- [ADR-0002](0002-cloudflare-workers-and-nitro.md)
