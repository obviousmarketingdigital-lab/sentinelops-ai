# OmniRouter Global Expansion Plan

## Context
The goal is to consolidate the ecosystem by expanding the OmniRouter Global Monetization Engine, refining the security scanner, and preparing the infrastructure for a production deploy. This will unify the Sentinel security tools with the growth/outreach automation.

## 1. OmniRouter Expansion
- **Simulated Payments**: Implement `app/api/revenue/checkout/route.ts` to simulate Stripe checkout flows.
- **New Niches**: Update `lib/revenue-engine.ts` with diverse global market targets (E-commerce LatAm, Fintech EU, etc.).
- **Dashboard Refinement**: Update `components/revenue-dashboard.tsx` to include pricing tiers and simulation status.

## 2. Security Scanner Refinement
- **Rules Engine**: Expand `lib/security-scanner.ts` with custom regex-based rules for detecting insecure patterns (e.g., hardcoded secrets, `eval()` usage).
- **Integration**: Link new security rules to the existing `SentinelDashboard` audit tab.

## 3. Production Readiness
- **Dockerization**: Create a `Dockerfile` and `docker-compose.yml` for multi-service deployment.
- **Deployment Script**: Create a `scripts/deploy.sh` for Vercel/Fly.io target compatibility.

## Critical Files
- `lib/revenue-engine.ts`
- `components/revenue-dashboard.tsx`
- `lib/security-scanner.ts`
- `Dockerfile`
- `scripts/deploy.sh`

## Verification
- Run `npm run typecheck` to ensure all updates are type-safe.
- Verify simulated payment flow via the Revenue Dashboard.
- Trigger Sentinel sweep and verify results on the dashboard.
- Run `npm run build` to verify production readiness.
