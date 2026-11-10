# 0005 — Managed identity + Cedar/ReBAC

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Security & Architecture

## Context

Athena serves parents, minors, staff, administrators, auditors and partners. RBAC alone cannot answer
"which learners may this teacher see?" or "is this adult the guardian of this child?". Building
credential storage, MFA, federation and breach response is high-risk and undifferentiated.

Cloudflare Access is designed for workforce zero-trust, not millions of customer identities. Running
Keycloak/OpenFGA as separate clusters conflicts with the Cloudflare-native, low-ops goal.

## Decision

- **Customer identity:** managed OIDC IdP (Clerk/Auth0/Entra External ID) with SAML federation, SCIM,
  passkeys/TOTP; abstracted behind `identity-service`.
- **Workforce/platform:** Cloudflare Access + MFA, separate from customer identity.
- **Sessions:** opaque `HttpOnly` cookie at the BFF; Postgres authority; DO revocation; KV cache.
- **Authorization:** `authorization-service` combines RBAC + ABAC + ReBAC, evaluated by **Cedar
  (WASM)** with relationship tuples in Postgres; decisions cached briefly with versioned keys.
- **Service-to-service:** short-lived signed service JWT; every service re-authorizes.
- No tokens in browser storage; no shared static service secrets.

## Consequences

**Positive:** avoids building auth; enterprise SSO/SCIM; phishing-resistant MFA; expressive,
auditable policies; relationship-aware access; no extra policy cluster.

**Negative:** IdP vendor dependency and cost; Cedar/ReBAC policy authoring and testing; cache
invalidation complexity; IdP outage affects new logins.

**Mitigations:** abstraction in `identity-service`, break-glass tenant admin, SLA review, policy test
vectors, invalidation events, session authority in Postgres, pen test.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Build auth in-house | High security risk and cost; not differentiated. |
| Keycloak self-hosted | Another cluster to operate; conflicts with low-ops goal. |
| Cloudflare Access for customers | Workforce-oriented; not a CIAM for millions of parents/learners. |
| RBAC only | Cannot express guardian/teacher relationships safely. |
| OpenFGA/SpiceDB hosted | Another service/DB to operate; Cedar + Postgres covers current graph. |

## References

- [Identity & access](../04-security/identity-and-access.md)
- [Security architecture](../04-security/security-architecture.md)
- [ADR-0003](0003-postgres-hyperdrive-and-rls.md)
