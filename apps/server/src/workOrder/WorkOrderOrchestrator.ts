import {
  CommandId,
  WorkOrderCommandRejectedError,
  WorkOrderCreateCommand,
  type WorkOrderAnyCommand,
  type WorkOrderDomainEvent,
  type WorkOrderListItem,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as WorkOrderStore from "./WorkOrderStore.ts";

export const PROVISION_EFFECT_TYPE = "provision";

/** Kebab-case slug from the idea; ≤40 chars. Matches contracts.md naming. */
export const slugifyIdea = (idea: string): string => {
  const base = idea
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "work-order";
};

/** Unique per project: `-2`, `-3`… suffix on collision. */
export const uniqueSlug = (base: string, existingSlugs: ReadonlySet<string>): string => {
  if (!existingSlugs.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 40)}-${n}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }
};

export class WorkOrderOrchestrator extends Context.Service<
  WorkOrderOrchestrator,
  {
    readonly dispatch: (
      command: WorkOrderAnyCommand,
    ) => Effect.Effect<
      { readonly sequence: number },
      WorkOrderCommandRejectedError | WorkOrderStore.WorkOrderStoreError
    >;
    readonly list: () => Effect.Effect<
      ReadonlyArray<WorkOrderListItem>,
      WorkOrderStore.WorkOrderStoreError
    >;
    readonly get: (
      id: string,
    ) => Effect.Effect<WorkOrderListItem | null, WorkOrderStore.WorkOrderStoreError>;
  }
>()("t3/workOrder/WorkOrderOrchestrator") {}

export interface WorkOrderProjectionState {
  readonly byId: ReadonlyMap<string, WorkOrderListItem>;
  readonly slugsByProject: ReadonlyMap<string, ReadonlySet<string>>;
}

export const emptyProjectionState: WorkOrderProjectionState = {
  byId: new Map(),
  slugsByProject: new Map(),
};

export const applyListItem = (
  state: WorkOrderProjectionState,
  item: WorkOrderListItem,
): WorkOrderProjectionState => {
  const byId = new Map(state.byId);
  const previous = byId.get(item.id);
  const slugsByProject = new Map(state.slugsByProject);
  if (previous !== undefined && previous.slug !== item.slug) {
    const previousSlugs = slugsByProject.get(item.projectId);
    if (previousSlugs !== undefined) {
      const next = new Set(previousSlugs);
      next.delete(previous.slug);
      slugsByProject.set(item.projectId, next);
    }
  }
  const slugs = new Set(state.slugsByProject.get(item.projectId) ?? []);
  slugs.add(item.slug);
  slugsByProject.set(item.projectId, slugs);
  byId.set(item.id, item);
  return { byId, slugsByProject };
};

export type Decision =
  | { readonly events: ReadonlyArray<WorkOrderDomainEvent> }
  | { readonly rejection: { readonly commandId: CommandId; readonly reason: string } };

/** Pure decide: only the create command is accepted in this ticket. */
export const decide = (
  state: WorkOrderProjectionState,
  command: WorkOrderAnyCommand,
  now: DateTime.Utc,
): Decision => {
  switch (command.type) {
    case "workOrder.create": {
      const create: WorkOrderCreateCommand = command;
      const existing = state.slugsByProject.get(create.projectId) ?? new Set<string>();
      const slug = uniqueSlug(slugifyIdea(create.idea), existing);
      const workOrderId = create.workOrderId;
      return {
        events: [
          {
            type: "workOrder.created",
            workOrderId,
            projectId: create.projectId,
            slug,
            idea: create.idea,
            modelSelection: create.modelSelection,
            stage: "grilling",
            occurredAt: now,
          },
          {
            type: "workOrder.effectRequested",
            workOrderId,
            effect: {
              type: "provision",
              launchCommandId: launchCommandIdFor(workOrderId),
            },
            occurredAt: now,
          },
        ],
      };
    }
    case "workOrder.passGate":
    case "workOrder.park":
    case "workOrder.unpark":
    case "workOrder.startRun":
    case "workOrder.retryRun":
    case "workOrder.abandonTicket":
    case "workOrder.resumeForGraphChange":
    case "workOrder.setAutopilot":
    case "workOrder.setDomainDocsInRepo":
    case "workOrder.discard":
      // Declared for later tickets; the decider rejects them until implemented.
      return {
        rejection: {
          commandId: command.commandId,
          reason: `Command ${command.type} is not implemented yet.`,
        },
      };
    case "workOrder.provisionCompleted":
      return {
        events: [
          {
            type: "workOrder.provisioned",
            workOrderId: command.workOrderId,
            worktreePath: command.worktreePath,
            integrationBranch: command.integrationBranch,
            planningThreadId: command.planningThreadId,
            occurredAt: now,
          },
        ],
      };
    case "workOrder.provisionFailed":
      return {
        events: [
          {
            type: "workOrder.provisionFailed",
            workOrderId: command.workOrderId,
            message: command.message,
            occurredAt: now,
          },
        ],
      };
  }
};

export const launchCommandIdFor = (workOrderId: string) =>
  CommandId.make(`server:work-orders:${workOrderId}:planning-thread`);

const make = Effect.gen(function* () {
  const store = yield* WorkOrderStore.WorkOrderStore;
  const projectStore = yield* ProjectStore.ProjectStoreV2;
  const state = yield* Ref.make(emptyProjectionState);

  const reload = Effect.gen(function* () {
    const items = yield* store.list();
    let next = emptyProjectionState;
    for (const item of items) next = applyListItem(next, item);
    yield* Ref.set(state, next);
  });
  yield* reload;

  const dispatch = (command: WorkOrderAnyCommand) =>
    Effect.gen(function* () {
      const receipt = yield* store.readReceipt(command.commandId);
      if (receipt !== null) return { sequence: receipt.sequence };
      const current = yield* Ref.get(state);
      const now = DateTime.nowUnsafe();
      const decision = decide(current, command, now);
      if ("rejection" in decision) {
        return yield* new WorkOrderCommandRejectedError({
          commandId: decision.rejection.commandId,
          reason: decision.rejection.reason,
        });
      }
      const events = decision.events;
      // Internal feedback commands and create reference the work order they
      // mint; every other command needs an existing work order.
      const mintsWorkOrder =
        command.type === "workOrder.create" ||
        command.type === "workOrder.provisionCompleted" ||
        command.type === "workOrder.provisionFailed";
      if (!mintsWorkOrder && current.byId.get(command.workOrderId) === undefined) {
        return yield* new WorkOrderCommandRejectedError({
          commandId: command.commandId,
          reason: "Unknown work order.",
        });
      }
      const { sequence } = yield* store.append(events);
      yield* store.commitReceipt({ commandId: command.commandId, sequence });
      // Refresh only the rows the events touched; a full reload would also pick
      // up sibling writers, but there are none in this ticket.
      let next = yield* Ref.get(state);
      for (const event of events) {
        const item = yield* store.get(event.workOrderId);
        if (item !== null) next = applyListItem(next, item);
      }
      yield* Ref.set(state, next);
      return { sequence };
    });

  return {
    dispatch,
    list: () => store.list(),
    get: (id: string) => store.get(id),
    reload,
  } as const;
});

export const WorkOrderOrchestratorLive = Layer.effect(WorkOrderOrchestrator, make).pipe(
  Layer.provide(WorkOrderStore.WorkOrderStoreLive),
  Layer.provide(ProjectStore.layer),
);
