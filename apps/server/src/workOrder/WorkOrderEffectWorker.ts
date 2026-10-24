import { CommandId, type WorkOrderId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import { renderGrillingBrief } from "./brief/brief.ts";
import * as Orchestrator from "./WorkOrderOrchestrator.ts";
import { TRACKER_DIR, TRACKER_GITIGNORE } from "./tracker/TrackerLayout.ts";
import * as WorkOrderStore from "./WorkOrderStore.ts";

export const PROVISION_EFFECT_TYPE = "provision";

export class WorkOrderEffectWorker extends Context.Service<
  WorkOrderEffectWorker,
  {
    /** Test hook: claims and executes until no pending intent remains. */
    readonly drain: () => Effect.Effect<number, never>;
    /** Production loop; forks a daemon fiber. */
    readonly start: () => Effect.Effect<void>;
  }
>()("t3/workOrder/WorkOrderEffectWorker") {}

/** The project checkout's current branch is its default branch for our purposes. */
const resolveDefaultBranchRef = (vcs: VcsProcess.VcsProcess["Service"], cwd: string) =>
  vcs
    .run({
      operation: "WorkOrderEffectWorker.resolveDefaultBranchRef",
      command: "git",
      args: ["symbolic-ref", "--short", "HEAD"],
      cwd,
    })
    .pipe(
      Effect.option,
      Effect.map((resolved) => {
        if (Option.isSome(resolved)) {
          const ref = resolved.value.stdout.trim();
          if (ref.length > 0) return ref;
        }
        return "HEAD";
      }),
    );

const make = Effect.gen(function* () {
  const store = yield* WorkOrderStore.WorkOrderStore;
  const orchestrator = yield* Orchestrator.WorkOrderOrchestrator;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const launches = yield* ThreadLaunch.ThreadLaunchService;
  const vcs = yield* VcsProcess.VcsProcess;
  const fs = yield* FileSystem.FileSystem;

  const executeProvision = (workOrderId: WorkOrderId) =>
    Effect.gen(function* () {
      const workOrder = yield* store.get(workOrderId);
      if (workOrder === null) return;
      const project = yield* projects.get(workOrder.projectId);
      if (Option.isNone(project)) {
        yield* orchestrator.dispatch({
          type: "workOrder.provisionFailed",
          commandId: CommandId.make(`server:work-orders:${workOrderId}:provision-failed`),
          workOrderId,
          message: "Project not found.",
        });
        return;
      }
      const workspaceRoot = project.value.workspaceRoot;
      const baseRef = yield* resolveDefaultBranchRef(vcs, workspaceRoot);
      const integrationBranch = `metah/${workOrder.slug}`;

      const launch = yield* launches.launch({
        // Deterministic: a retried provision reuses the same create receipt.
        commandId: Orchestrator.launchCommandIdFor(workOrderId),
        projectId: workOrder.projectId,
        title: `WorkOrder: ${workOrder.slug}`,
        modelSelection: {
          instanceId: workOrder.modelSelection.providerInstanceId,
          model: workOrder.modelSelection.model,
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        workspaceStrategy: { type: "worktree", baseRef, branch: integrationBranch },
        initialMessage: {
          text: renderGrillingBrief({ idea: workOrder.idea, domainDocsInRepo: true }),
          attachments: [],
        },
        createdBy: "agent",
        creationSource: "server",
      });

      const worktreePath = launch.projection.thread.worktreePath ?? "";

      // The Tracker directory self-ignores so the worktree starts git-clean.
      yield* fs
        .makeDirectory(`${worktreePath}/${TRACKER_DIR}`, { recursive: true })
        .pipe(Effect.orElseSucceed(() => undefined));
      yield* fs.writeFileString(
        `${worktreePath}/${TRACKER_DIR}/.gitignore`,
        TRACKER_GITIGNORE,
      );

      yield* orchestrator.dispatch({
        type: "workOrder.provisionCompleted",
        commandId: CommandId.make(`server:work-orders:${workOrderId}:provisioned`),
        workOrderId,
        worktreePath,
        integrationBranch,
        planningThreadId: launch.threadId,
      });
    });

  const runOnce: Effect.Effect<boolean, never, never> = Effect.gen(function* () {
    const claimed = yield* store.claimNextIntent([PROVISION_EFFECT_TYPE]);
    if (claimed === null) return false;
    const outcome = yield* Effect.result(executeProvision(claimed.workOrderId as WorkOrderId));
    if (Result.isSuccess(outcome)) {
      yield* store.completeIntent(claimed.id);
    } else {
      yield* Effect.logWarning("WorkOrder provision failed", { cause: outcome.failure });
      yield* store.failIntent(claimed.id, 1);
    }
    return true;
  }).pipe(Effect.catchCause(() => Effect.succeed(false)));

  const drain = (): Effect.Effect<number, never> =>
    Effect.gen(function* () {
      let count = 0;
      let ran = true;
      while (ran) {
        ran = yield* runOnce;
        if (ran) count += 1;
      }
      return count;
    });

  const start = (): Effect.Effect<void> =>
    drain().pipe(
      Effect.andThen(Effect.sleep("1 second")),
      Effect.ignore,
      Effect.forever,
      Effect.forkDetach,
      Effect.asVoid,
    );

  return { drain, start } as const;
});

export const WorkOrderEffectWorkerLive = Layer.effect(WorkOrderEffectWorker, make).pipe(
  Layer.provide(WorkOrderStore.WorkOrderStoreLive),
  Layer.provide(Orchestrator.WorkOrderOrchestratorLive),
  Layer.provide(ProjectStore.layer),
  Layer.provide(VcsProcess.layer),
);

