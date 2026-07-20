# Staging AI QA evidence

- Status: `BLOCKED`
- Execution: `NOT RUN`
- Health: `environment=staging`, `payments=false`, `accountStorage=true`, `ai=false`
- Reason: the Staging GitHub Environment has no `OPENAI_API_KEY` Secret name, and the guarded workflow does not yet sync that name.
- Secret values inspected or copied: no
- Production changed: no

Run exactly one proposal generation only after a dedicated Staging key has been registered through an approved guarded path and `/api/health` reports `ai=true`.
