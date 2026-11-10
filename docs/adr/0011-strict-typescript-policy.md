# 0011 — Strict TypeScript policy

> **Status:** Accepted · **Date:** 2026-11-10 · **Owner:** Engineering

## Context

The supplied implementation plan required "zero `any` and zero `as`". The intent is correct: prevent
type escapes that hide runtime failures. Taken literally, the rule is impractical — `as const` is
idiomatic, some third-party typings require a boundary adapter, and banning all assertions
encourages worse escapes (`@ts-ignore`, `unknown` casts).

## Decision

**Banned**

- `any` (explicit or implicit).
- Unsafe `as SomeType` on external/untrusted data.
- `@ts-ignore`; `@ts-expect-error` only with a description and expiry ticket.
- Non-null assertions on untrusted values.
- Floating promises and unawaited async handlers.

**Allowed**

- `as const` and `satisfies`.
- Type guards (`is`) after runtime validation.
- A narrow, documented **boundary adapter** for third-party types that cannot be inferred, isolated
  in `infrastructure/adapters/*`, with a runtime schema test and owner review.

**Enforcement**

- `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`.
- ESLint `no-explicit-any`, `no-unsafe-*`, `no-non-null-assertion`, `ban-ts-comment`,
  `no-floating-promises`, `no-misused-promises`; custom restricted syntax for unsafe assertions.
- Zod parses every external boundary; Drizzle infers database rows; no hand-written duplicate types.
- CI blocks merge on violations.

## Consequences

**Positive:** fewer runtime type errors, explicit contracts, safer refactors, better editor support.

**Negative:** more schema/validation code; occasional boundary adapter; stricter onboarding.

**Mitigations:** shared schemas, generators, examples, lint autofix, review checklist, training.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Plain `strict` only | Allows `any`/assertions that defeat safety. |
| Absolute zero `as` | Impractical; encourages hidden escapes; no real safety gain. |
| Runtime-only validation | No compile-time safety; slower feedback. |
| Flow/other type system | Ecosystem/tooling mismatch. |

## References

- [Monorepo & tooling](../01-architecture/monorepo-and-tooling.md)
- [API & event contracts](../05-api/api-and-event-contracts.md)
