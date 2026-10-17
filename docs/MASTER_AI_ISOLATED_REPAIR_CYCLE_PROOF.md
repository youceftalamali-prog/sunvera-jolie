# Master AI isolated repair cycle proof

Date: 2026-10-17

## What this proves

1. **Protected branch guard** – writes to `main` / `master` / `release/*` / `production` are refused.
2. **Context validation** – `oldText` must exist in the live file snapshot before any apply.
3. **Isolated branch** – this branch is `fix/master-ai-isolated-repair-cycle-proof` only.
4. **PR without merge** – the repair executor opens a PR and never sets `merged: true`.

## Stages exercised

- `guard` → `read_context` → `validate_patch` → `create_branch` → `apply_patch` → `create_pr` → `done`

## Required tests

- `scripts/test-p2-master-ai-code-repair.mjs` (integration: `P2_MASTER_AI_CODE_REPAIR_INTEGRATION_PR_CYCLE_PASS`)
- `scripts/test-p2-master-ai-contract.mjs`

## Explicit non-goals

- No production deploy
- No auto-merge
- No secrets required for the pure integration test path
