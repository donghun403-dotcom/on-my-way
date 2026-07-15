# Deployment policy

Production and pull-request deployments use separate Worker configurations and must never share a deploy command.

## Repository rules

- `wrangler.production.jsonc` is the only configuration that owns `on-my-way` and `onmyway.olivenrich.com`.
- `wrangler.jsonc` is deliberately non-production. A bare `npx wrangler deploy` cannot update the live service.
- `.github/workflows/production.yml` deploys production only after a push to `main` passes unit and Playwright checks.
- `.github/workflows/pr-preview.yml` deploys `on-my-way-pr-<number>` only for pull-request events.
- `npm run deploy:production` refuses to run outside `main` unless an operator explicitly sets `ALLOW_PRODUCTION_DEPLOY=true` for emergency recovery.

## One-time Cloudflare dashboard change

The existing Workers Builds Git integration is external to this repository. In **Worker > Settings > Build > Branch control**:

1. Set the production branch to `main`.
2. Disable non-production branch builds for the production Worker, or set the non-production deploy command to `npx wrangler versions upload --config wrangler.production.jsonc`.
3. Prefer disabling the production Worker's Git build entirely when GitHub Actions owns deployment, to avoid two independent deployers.
4. Keep the GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the protected `production` environment.

After changing the dashboard, merge through `main`, verify the Production workflow, and compare its commit SHA with the active Cloudflare version before announcing a release.
