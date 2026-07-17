# Deployment environments

This repository keeps Production, fixed Staging, and PR Preview isolated. This document records the repository-side boundary only; Cloudflare resources and secrets are not created by this change.

| Environment | Worker | Route | KV | D1 | Deploy trigger | Default billing |
| --- | --- | --- | --- | --- | --- | --- |
| Production | `on-my-way` | `https://onmyway.olivenrich.com` | Production-only `USERS_KV` | Production-only `BILLING_DB` when activated | `main` push or manual Production workflow | `PAYMENTS_ENABLED=false` |
| Staging | `on-my-way-staging` | Fixed workers.dev URL assigned to this Worker | Staging-only `USERS_KV` | Staging-only `BILLING_DB` | Manual `workflow_dispatch` only | `PAYMENTS_ENABLED=false` |
| PR Preview | `on-my-way-pr-${PR_NUMBER}` | PR deployment URL | Existing Preview `USERS_KV` | Existing Preview D1 binding | Pull request workflow | `PAYMENTS_ENABLED=false` |

## Staging boundary

The selected Staging route is the stable workers.dev URL for `on-my-way-staging`:

`https://on-my-way-staging.<CLOUDFLARE_ACCOUNT_SUBDOMAIN>.workers.dev`

The account subdomain is intentionally not guessed or committed. Cloudflare must confirm the final hostname after the first Staging deployment. No custom-domain route is added, so this Worker cannot overlap `onmyway.olivenrich.com`.

`wrangler.staging.jsonc` contains only non-secret defaults. The manual workflow generates a temporary config with the Staging KV and D1 IDs from these GitHub Environment secrets:

- `CLOUDFLARE_STAGING_USERS_KV_ID`
- `CLOUDFLARE_STAGING_D1_DATABASE_ID`

The generated file is masked where applicable, excluded from assets, and removed after the workflow. It must never contain Production IDs.

## Staging Worker secrets

Set these as Cloudflare secrets on `on-my-way-staging` only. Do not copy Production values automatically and do not put values in GitHub, source, logs, PRs, or documents.

Required for Google login and Sandbox preparation:

- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOSS_CLIENT_KEY`
- `TOSS_SECRET_KEY`

Optional providers:

- `KAKAO_CLIENT_ID`
- `KAKAO_CLIENT_SECRET`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

The workflow does not upload these values. This preserves a deliberate ACTION REQUIRED boundary before any real OAuth or Toss operation.

## Google callback

After Cloudflare confirms the account subdomain, register this exact callback in the Staging Google OAuth client:

`https://on-my-way-staging.<CLOUDFLARE_ACCOUNT_SUBDOMAIN>.workers.dev/api/auth/callback/google`

Production keeps its existing callback and OAuth client unchanged.

## Required external setup

Before running `Staging Deploy`, the user must:

1. Create a Staging-only KV namespace and record its ID in the protected `staging` GitHub Environment secret `CLOUDFLARE_STAGING_USERS_KV_ID`.
2. Create a Staging-only D1 database named `on-my-way-billing-staging`, apply `migrations/0001_billing_ledger.sql`, and record its ID in `CLOUDFLARE_STAGING_D1_DATABASE_ID`.
3. Confirm the `staging` GitHub Environment uses the intended Cloudflare account and token without exposing either value.
4. Register the Google callback above and set the Worker secrets listed above on `on-my-way-staging` only.
5. Run the workflow manually, then verify `/api/health` reports `environment=staging`, account storage is available, and payments remain disabled.

These are ACTION REQUIRED. This repository change does not create Cloudflare resources, change DNS, register OAuth callbacks, set secrets, or deploy Staging.

## Later validation order

1. Verify Staging Google login and session persistence with `PAYMENTS_ENABLED=false`.
2. Only for the separately approved Sandbox task, set Staging `PAYMENTS_ENABLED=true`, run the first test-card billing flow, verify the D1 ledger, and immediately restore `false`.
3. Keep renewal, refund, webhook, Production billing, Android, and Google Play Billing out of this step.
