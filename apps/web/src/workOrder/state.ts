import { useMemo } from "react";
import {
  WORK_ORDER_WS_METHODS,
  WorkOrderId,
  type EnvironmentId,
  type ThreadId,
  type WorkOrderDetail,
  type WorkOrderDetailStreamItem,
  type WorkOrderListItem,
  type WorkOrderListStreamItem,
  type WorkOrderStage,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { deriveProviderInstanceEntries } from "~/providerInstances";
import { useEnvironmentProviders } from "~/state/environments";
import { useProjects } from "~/state/entities";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { connectionAtomRuntime } from "~/connection/runtime";
import { useEnvironmentQuery } from "~/state/query";

const isWorkOrderId = Schema.is(WorkOrderId);

// ---------------------------------------------------------------------------
// List subscription: fold the event stream into a running snapshot.
// ---------------------------------------------------------------------------

export interface WorkOrderListState {
  /** True once the server sent its initial `synchronized` frame. */
  readonly ready: boolean;
  readonly orders: ReadonlyArray<WorkOrderListItem>;
}

const EMPTY_LIST_STATE: WorkOrderListState = { ready: false, orders: [] };

function applyListEvent(
  state: WorkOrderListState,
  event: WorkOrderListStreamItem,
): WorkOrderListState {
  switch (event.type) {
    case "synchronized":
      return { ...state, ready: true };
    case "snapshot":
      return { ready: true, orders: event.items };
    case "event": {
      const payload = event.event;
      switch (payload.type) {
        case "workOrder.created": {
          const created: WorkOrderListItem = {
            id: payload.workOrderId,
            slug: payload.slug,
            projectId: payload.projectId,
            idea: payload.idea,
            stage: payload.stage,
            modelSelection: payload.modelSelection,
            frontierSize: 0,
            runsInFlight: 0,
            needsInputCount: 0,
            integrationBranch: null,
            worktreePath: null,
            planningThreadId: null,
            createdAt: payload.occurredAt,
          };
          return {
            ...state,
            orders: [...state.orders.filter((order) => order.id !== created.id), created],
          };
        }
        case "workOrder.provisioned":
          return {
            ...state,
            orders: state.orders.map((order) =>
              order.id === payload.workOrderId
                ? {
                    ...order,
                    worktreePath: payload.worktreePath,
                    integrationBranch: payload.integrationBranch,
                    planningThreadId: payload.planningThreadId,
                  }
                : order,
            ),
          };
        case "workOrder.provisionFailed":
          return state;
        case "workOrder.effectRequested":
          return state;
      }
      return state;
    }
    case "unknown-event":
      return state;
  }
}

export const workOrderListAtom = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "workorder:list",
  tag: WORK_ORDER_WS_METHODS.subscribeList,
  idleTtlMs: 60_000,
  transform: (stream) =>
    Stream.mapAccum(
      stream,
      (): WorkOrderListState => EMPTY_LIST_STATE,
      (state: WorkOrderListState, item: WorkOrderListStreamItem) => {
        const next = applyListEvent(state, item);
        return [next, [next]] as const;
      },
    ),
});

// ---------------------------------------------------------------------------
// Detail subscription: fold into the latest WorkOrderDetail.
// ---------------------------------------------------------------------------

export interface WorkOrderDetailState {
  /** True once the server sent its initial `synchronized` frame. */
  readonly ready: boolean;
  readonly detail: WorkOrderDetail | null;
}

function applyDetailEvent(
  state: WorkOrderDetailState,
  event: WorkOrderDetailStreamItem,
): WorkOrderDetailState {
  switch (event.type) {
    case "synchronized":
      return { ...state, ready: true };
    case "snapshot":
      return { ready: true, detail: event.detail };
    case "event": {
      const detail = state.detail;
      const payload = event.event;
      if (detail === null || detail.id !== payload.workOrderId) {
        return state;
      }
      switch (payload.type) {
        case "workOrder.created":
          return state;
        case "workOrder.provisioned":
          return {
            ...state,
            detail: {
              ...detail,
              worktreePath: payload.worktreePath,
              integrationBranch: payload.integrationBranch,
              planningThreadId: payload.planningThreadId,
            },
          };
        case "workOrder.provisionFailed":
        case "workOrder.effectRequested":
          return state;
      }
      return state;
    }
    case "unknown-event":
      return state;
  }
}

const EMPTY_DETAIL_STATE: WorkOrderDetailState = { ready: false, detail: null };

export const workOrderDetailAtom = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  {
    label: "workorder:detail",
    tag: WORK_ORDER_WS_METHODS.subscribeDetail,
    idleTtlMs: 60_000,
    transform: (stream) =>
      Stream.mapAccum(
        stream,
        (): WorkOrderDetailState => EMPTY_DETAIL_STATE,
        (state: WorkOrderDetailState, item: WorkOrderDetailStreamItem) => {
          const next = applyDetailEvent(state, item);
          return [next, [next]] as const;
        },
      ),
  },
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Dispatches WorkOrder commands; for #3 only `workOrder.create` is accepted by
 * the server decider.
 */
export const workOrderDispatchCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "workorder:dispatch-command",
  tag: WORK_ORDER_WS_METHODS.dispatchCommand,
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** View model the board renders; decoupled from the wire schema. */
export interface WorkOrderCardModel {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly stage: WorkOrderStage;
  readonly parked: boolean;
  readonly projectTitle: string | null;
  readonly providerLabel: string | null;
  readonly model: string | null;
  readonly frontierSize: number | null;
  readonly runsInFlight: number;
  readonly needsInputCount: number;
  readonly integrationBranch: string | null;
  readonly planningThreadId: ThreadId | null;
  readonly environmentId: EnvironmentId | null;
}

function listItemToCard(
  order: WorkOrderListItem,
  projectTitle: string | null,
  providerLabel: string | null,
): WorkOrderCardModel {
  return {
    id: order.id,
    slug: order.slug,
    title: order.slug,
    stage: order.stage,
    parked: order.stage === "parked",
    projectTitle,
    providerLabel,
    model: order.modelSelection.model,
    frontierSize: order.frontierSize,
    runsInFlight: order.runsInFlight,
    needsInputCount: order.needsInputCount,
    integrationBranch: order.integrationBranch,
    planningThreadId: order.planningThreadId,
    environmentId: null,
  };
}

export function useWorkOrders(environmentId: EnvironmentId | null): {
  readonly orders: ReadonlyArray<WorkOrderCardModel> | null;
  readonly error: string | null;
} {
  const projects = useProjects();
  const providersByEnvironment = useEnvironmentProviders();
  const view = useEnvironmentQuery(
    environmentId === null ? null : workOrderListAtom({ environmentId, input: {} }),
  );
  const items = view.data?.orders ?? null;
  const cards = useMemo(() => {
    if (items === null) return null;
    const projectTitles = new Map(projects.map((project) => [project.id, project.title] as const));
    const providerNames =
      environmentId === null
        ? new Map<string, string>()
        : new Map(
            deriveProviderInstanceEntries(providersByEnvironment.get(environmentId) ?? []).map(
              (entry) => [entry.instanceId, entry.displayName] as const,
            ),
          );
    return items.map((item) =>
      listItemToCard(
        item,
        projectTitles.get(item.projectId) ?? null,
        providerNames.get(item.modelSelection.providerInstanceId) ?? null,
      ),
    );
  }, [items, projects, providersByEnvironment, environmentId]);
  return { orders: cards, error: view.error };
}

export function useWorkOrder(
  environmentId: EnvironmentId | null,
  workOrderId: string,
): {
  readonly detail: WorkOrderDetail | null;
  readonly error: string | null;
} {
  const view = useEnvironmentQuery(
    environmentId === null || !isWorkOrderId(workOrderId)
      ? null
      : workOrderDetailAtom({ environmentId, input: { workOrderId } }),
  );
  return { detail: view.data?.detail ?? null, error: view.error };
}
