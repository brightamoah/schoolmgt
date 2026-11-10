# 0006 — Nuxt BFF frontend

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Frontend & Security

## Context

The platform has four distinct audiences (public/staff, admin, guardian, learner) with different
navigation, density, accessibility and offline needs. The browser must not hold long-lived tokens,
and domain services must not be publicly exposed.

## Decision

- Build four **Nuxt 4** applications on Cloudflare Workers: `portal`, `admin`, `parent`, `student`.
- Each app includes a **BFF** (Nitro server routes) that:
  - owns the opaque session cookie and OIDC callback;
  - aggregates 2–3 services for a screen;
  - shapes DTOs for the UI;
  - never contains business invariants or SQL.
- The browser calls only the BFF; the BFF calls services via service bindings with signed context.
- Shared design system in `packages/ui` (Nuxt UI + Tailwind); WCAG 2.2 AA is a gate.
- Public pages use SSR/caching; authenticated pages are `no-store`.
- PWA/offline for attendance, roll-up and emergency contacts.

## Consequences

**Positive:** fast first paint, SEO for public pages, secure session handling, per-audience UX,
shared components, no CORS/token sprawl.

**Negative:** SSR compute cost, BFF discipline required, caching complexity, duplicated app shells,
Nuxt/Workers constraints.

**Mitigations:** route rules, islands, bundle budgets, BFF code review rules, shared composables,
preview environments, synthetic checks.

## Alternatives considered

| Option | Why rejected |
|---|---|
| SPA + public API | Tokens in browser; CORS; slower first paint; harder session security. |
| One app with role-based UI | Couples audiences; larger bundles; weaker UX; bigger blast radius. |
| Next.js | Viable, but team is Vue/Nuxt and existing repo is Nuxt. |
| Server-rendered monolith | Contradicts service boundaries; mixes UI and domain. |

## References

- [Frontend architecture](../01-architecture/frontend-architecture.md)
- [Identity & access](../04-security/identity-and-access.md)
- [ADR-0005](0005-managed-identity-and-cedar.md)
