# Master AI Code-Repair Demo

This file exists only on the isolated branch `fix/master-ai-code-repair-demo-20261017`.

## Purpose

Prove that when `classifyRepairNeed` returns `frontend_code` or `backend_code`,
the Master AI repair path prepares work on an **isolated branch** rather than
mutating the release branch or production data.

## Classification examples (from unit test)

| Signal | Classification | Strategy |
|--------|----------------|----------|
| `homepage.reorder.verify` failure | `cms_or_db` | `execute_master_ops` |
| RTL carousel / component className | `frontend_code` | `prepare_code_pr` |
| Verifier / drizzle / executor gap | `backend_code` | `prepare_code_pr` |

## Safety

- No production deploy
- No customer data writes
- No automatic merge into `release/sunvera-jolie-unified`

## Related

- Module: `src/lib/ai-master-code-repair.ts`
- Test: `scripts/test-p2-master-ai-code-repair.mjs`
- Parent verification branch: `fix/master-ai-execution-verification`
