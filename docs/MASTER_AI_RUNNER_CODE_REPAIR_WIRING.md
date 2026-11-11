# Master AI runner → isolated code repair wiring

## Status

Bridge modules are on this branch:

- `src/lib/ai-master-code-repair.ts` — `executeIsolatedCodeRepair` (CI fail → `needs_retry`, never merge)
- `src/lib/ai-master-code-repair-github.ts` — token-gated GitHub port (`MASTER_AI_GITHUB_TOKEN` / `GITHUB_TOKEN`)
- `src/lib/ai-master-attempt-code-repair.ts` — `attemptIsolatedCodeRepairFromCritic`

## Required runner edits (`netlify/functions/_lib/master-ai-runner.ts`)

1. Import:
```ts
import { buildCodeRepairPlan, decideRepairStrategy } from "../../../src/lib/ai-master-code-repair";
import { attemptIsolatedCodeRepairFromCritic } from "../../../src/lib/ai-master-attempt-code-repair";
```

2. Inside `attemptCriticRepair`, when `critic.status === "needs_repair"`:
   - Build `failedChecks` from `deterministicVerification.checks`
   - `decideRepairStrategy(buildCodeRepairPlan(...))`
   - If `prepare_code_pr` → `attemptIsolatedCodeRepairFromCritic(...)` and update `critic` + `isolatedCodeRepair` report
   - Else keep existing CMS/DB critic repair via `generateText` + `applyCriticRepair`

3. Include `isolatedCodeRepair` in the JSON response and responseUser payload.

## Safe GitHub token

- Prefer `MASTER_AI_GITHUB_TOKEN` with `contents:write` + `pull_requests:write` only
- Never grant merge permission to the bot token
- Without a token, classification still runs; no branch/PR is created

## Tests

```bash
node --experimental-strip-types scripts/test-p2-master-ai-code-repair.mjs
node scripts/test-p2-master-ai-contract.mjs
```

Workflow: `.github/workflows/master-ai-code-repair.yml`
