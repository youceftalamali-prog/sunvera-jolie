/**
 * Bridge used by Master AI runner to attempt isolated source-code repair
 * after the Critic marks needs_repair and classification is prepare_code_pr.
 */
import {
  buildCodeRepairPlan,
  decideRepairStrategy,
  type CodeRepairPlan,
} from "@/lib/ai-master-code-repair";
import { tryMasterAiIsolatedCodeRepair } from "@/lib/ai-master-code-repair-github";
import type { MasterCriticResult } from "@/lib/ai-master-critic";

export type IsolatedCodeRepairReport = {
  strategy: string;
  plan: CodeRepairPlan | null;
  result: Awaited<ReturnType<typeof tryMasterAiIsolatedCodeRepair>>["result"];
  message: string;
};

export async function attemptIsolatedCodeRepairFromCritic(input: {
  intent: string;
  critic: MasterCriticResult;
  failedChecks: Array<{ operation: string; evidence: string }>;
  baseBranch?: string;
}): Promise<{ critic: MasterCriticResult; report: IsolatedCodeRepairReport }> {
  const codePlan = buildCodeRepairPlan({
    intent: input.intent,
    criticIssues: input.critic.issues,
    failedChecks: input.failedChecks,
    errorMessage: input.critic.summary,
  });
  const strategy = decideRepairStrategy(codePlan);

  if (strategy === "execute_master_ops") {
    return {
      critic: input.critic,
      report: {
        strategy,
        plan: codePlan,
        result: null,
        message: "Issue is CMS/DB-scoped; existing Master AI operations should be used.",
      },
    };
  }

  if (strategy !== "prepare_code_pr") {
    return {
      critic: input.critic,
      report: {
        strategy,
        plan: codePlan,
        result: null,
        message: "Code repair blocked: unable to classify or unsafe to proceed.",
      },
    };
  }

  const codeResult = await tryMasterAiIsolatedCodeRepair({
    intent: input.intent,
    criticIssues: input.critic.issues,
    failedChecks: input.failedChecks,
    errorMessage: input.critic.summary,
    baseBranch: input.baseBranch ?? "release/sunvera-jolie-unified",
    skipCiPoll: false,
  });

  const report: IsolatedCodeRepairReport = {
    strategy: codeResult.strategy,
    plan: codeResult.plan,
    result: codeResult.result,
    message: codeResult.message,
  };

  const repairSucceeded =
    codeResult.result?.status === "pr_opened" && codeResult.result.merged === false;

  if (repairSucceeded) {
    return {
      critic: {
        ...input.critic,
        status: "pass",
        summary: `Isolated code repair opened PR #${codeResult.result?.prNumber} (not merged). ${codeResult.message}`,
        repairInstructions: codeResult.result?.prUrl ?? codeResult.plan.suggestedBranch,
      },
      report,
    };
  }

  const needsRetry = codeResult.result?.status === "needs_retry";
  return {
    critic: {
      ...input.critic,
      status: needsRetry ? "needs_repair" : "blocked",
      summary: needsRetry
        ? `Isolated code PR was opened but CI failed — not a successful repair. ${codeResult.message}`
        : `Isolated code repair did not complete successfully. ${codeResult.message}`,
      issues: [
        ...input.critic.issues,
        {
          severity: "high" as const,
          area: "execution" as const,
          message: "Source-code repair requires an isolated branch + PR; production was not modified.",
          evidence: codeResult.message.slice(0, 240),
        },
      ].slice(0, 12),
      repairInstructions: [
        codeResult.plan.suggestedBranch,
        ...codeResult.plan.filePatches.map((p) => p.path),
        codeResult.message,
      ]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 500),
    },
    report,
  };
}
