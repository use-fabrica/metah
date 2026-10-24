import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

import { CommandId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentAuthorizationError,
  type AuthEnvironmentScope,
} from "./auth.ts";

export const WorkOrderId = TrimmedNonEmptyString.pipe(Schema.brand("WorkOrderId"));
export type WorkOrderId = typeof WorkOrderId.Type;

/** Slug portion of the idea; kebab-case, unique per project, ≤40 chars. */
export const WorkOrderSlug = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  Schema.isMaxLength(40),
);
export type WorkOrderSlug = typeof WorkOrderSlug.Type;

/** Stage machine: Grilling → Spec → Tickets → Running → Review → Done; Parked is a side state of Grilling. */
export const WorkOrderStage = Schema.Literals([
  "grilling",
  "parked",
  "spec",
  "tickets",
  "running",
  "review",
  "done",
  "discarded",
]);
export type WorkOrderStage = typeof WorkOrderStage.Type;

export const WorkOrderTicketState = Schema.Literals([
  "blocked",
  "frontier",
  "running",
  "needs_input",
  "failed",
  "merged",
  "abandoned",
]);
export type WorkOrderTicketState = typeof WorkOrderTicketState.Type;

export const WorkOrderModelSelection = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  model: TrimmedNonEmptyString,
});
export type WorkOrderModelSelection = typeof WorkOrderModelSelection.Type;

export const IntegrationBranch = TrimmedNonEmptyString.check(
  Schema.isPattern(/^metah\/[a-z0-9]+(-[a-z0-9]+)*$/),
);
export type IntegrationBranch = typeof IntegrationBranch.Type;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const WorkOrderCreateCommand = Schema.Struct({
  type: Schema.Literal("workOrder.create"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  projectId: ProjectId,
  idea: TrimmedNonEmptyString.check(Schema.isMaxLength(20_000)),
  modelSelection: WorkOrderModelSelection,
});
export type WorkOrderCreateCommand = typeof WorkOrderCreateCommand.Type;

/**
 * Declared for later tickets (#4–#13); only `workOrder.create` is accepted by
 * the decider in this ticket.
 */
export const WorkOrderPassGateCommand = Schema.Struct({
  type: Schema.Literal("workOrder.passGate"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  gate: Schema.Literals(["grilling", "spec", "tickets", "review"]),
});
export type WorkOrderPassGateCommand = typeof WorkOrderPassGateCommand.Type;

export const WorkOrderParkCommand = Schema.Struct({
  type: Schema.Literal("workOrder.park"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  question: TrimmedNonEmptyString,
});
export type WorkOrderParkCommand = typeof WorkOrderParkCommand.Type;

export const WorkOrderUnparkCommand = Schema.Struct({
  type: Schema.Literal("workOrder.unpark"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  verdict: TrimmedNonEmptyString,
});
export type WorkOrderUnparkCommand = typeof WorkOrderUnparkCommand.Type;

export const WorkOrderStartRunCommand = Schema.Struct({
  type: Schema.Literal("workOrder.startRun"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  ticketNumber: Schema.Int,
  modelSelection: Schema.optional(WorkOrderModelSelection),
});
export type WorkOrderStartRunCommand = typeof WorkOrderStartRunCommand.Type;

export const WorkOrderRetryRunCommand = Schema.Struct({
  type: Schema.Literal("workOrder.retryRun"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  ticketNumber: Schema.Int,
});
export type WorkOrderRetryRunCommand = typeof WorkOrderRetryRunCommand.Type;

export const WorkOrderAbandonTicketCommand = Schema.Struct({
  type: Schema.Literal("workOrder.abandonTicket"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  ticketNumber: Schema.Int,
});
export type WorkOrderAbandonTicketCommand = typeof WorkOrderAbandonTicketCommand.Type;

export const WorkOrderResumeForGraphChangeCommand = Schema.Struct({
  type: Schema.Literal("workOrder.resumeForGraphChange"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  request: TrimmedNonEmptyString,
});
export type WorkOrderResumeForGraphChangeCommand = typeof WorkOrderResumeForGraphChangeCommand.Type;

export const WorkOrderSetAutopilotCommand = Schema.Struct({
  type: Schema.Literal("workOrder.setAutopilot"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  enabled: Schema.Boolean,
});
export type WorkOrderSetAutopilotCommand = typeof WorkOrderSetAutopilotCommand.Type;

export const WorkOrderSetDomainDocsInRepoCommand = Schema.Struct({
  type: Schema.Literal("workOrder.setDomainDocsInRepo"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
  enabled: Schema.Boolean,
});
export type WorkOrderSetDomainDocsInRepoCommand = typeof WorkOrderSetDomainDocsInRepoCommand.Type;

export const WorkOrderDiscardCommand = Schema.Struct({
  type: Schema.Literal("workOrder.discard"),
  commandId: CommandId,
  workOrderId: WorkOrderId,
});
export type WorkOrderDiscardCommand = typeof WorkOrderDiscardCommand.Type;

export const WorkOrderCommand = Schema.Union([
  WorkOrderCreateCommand,
  WorkOrderPassGateCommand,
  WorkOrderParkCommand,
  WorkOrderUnparkCommand,
  WorkOrderStartRunCommand,
  WorkOrderRetryRunCommand,
  WorkOrderAbandonTicketCommand,
  WorkOrderResumeForGraphChangeCommand,
  WorkOrderSetAutopilotCommand,
  WorkOrderSetDomainDocsInRepoCommand,
  WorkOrderDiscardCommand,
]);
export type WorkOrderCommand = typeof WorkOrderCommand.Type;

/** Server-only feedback commands the effect worker issues after performing I/O. */
export const WorkOrderInternalCommand = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("workOrder.provisionCompleted"),
    commandId: CommandId,
    workOrderId: WorkOrderId,
    worktreePath: TrimmedNonEmptyString,
    integrationBranch: IntegrationBranch,
    planningThreadId: ThreadId,
  }),
  Schema.Struct({
    type: Schema.Literal("workOrder.provisionFailed"),
    commandId: CommandId,
    workOrderId: WorkOrderId,
    message: TrimmedNonEmptyString,
  }),
]);
export type WorkOrderInternalCommand = typeof WorkOrderInternalCommand.Type;

export type WorkOrderAnyCommand = WorkOrderCommand | WorkOrderInternalCommand;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const WorkOrderCreatedEvent = Schema.Struct({
  type: Schema.Literal("workOrder.created"),
  workOrderId: WorkOrderId,
  projectId: ProjectId,
  slug: WorkOrderSlug,
  idea: TrimmedNonEmptyString,
  modelSelection: WorkOrderModelSelection,
  stage: Schema.Literal("grilling"),
  occurredAt: Schema.DateTimeUtc,
});
export type WorkOrderCreatedEvent = typeof WorkOrderCreatedEvent.Type;

export const WorkOrderEffectRequestedEvent = Schema.Struct({
  type: Schema.Literal("workOrder.effectRequested"),
  workOrderId: WorkOrderId,
  effect: Schema.Struct({
    type: Schema.Literal("provision"),
    // Deterministic so a retried effect reuses the same thread-create receipt.
    launchCommandId: CommandId,
  }),
  occurredAt: Schema.DateTimeUtc,
});
export type WorkOrderEffectRequestedEvent = typeof WorkOrderEffectRequestedEvent.Type;

export const WorkOrderProvisionedEvent = Schema.Struct({
  type: Schema.Literal("workOrder.provisioned"),
  workOrderId: WorkOrderId,
  worktreePath: TrimmedNonEmptyString,
  integrationBranch: IntegrationBranch,
  planningThreadId: ThreadId,
  occurredAt: Schema.DateTimeUtc,
});
export type WorkOrderProvisionedEvent = typeof WorkOrderProvisionedEvent.Type;

export const WorkOrderProvisionFailedEvent = Schema.Struct({
  type: Schema.Literal("workOrder.provisionFailed"),
  workOrderId: WorkOrderId,
  message: TrimmedNonEmptyString,
  occurredAt: Schema.DateTimeUtc,
});
export type WorkOrderProvisionFailedEvent = typeof WorkOrderProvisionFailedEvent.Type;

export const WorkOrderDomainEvent = Schema.Union([
  WorkOrderCreatedEvent,
  WorkOrderEffectRequestedEvent,
  WorkOrderProvisionedEvent,
  WorkOrderProvisionFailedEvent,
]);
export type WorkOrderDomainEvent = typeof WorkOrderDomainEvent.Type;

export const WorkOrderStoredEvent = Schema.Struct({
  sequence: Schema.Number,
  eventId: Schema.String,
  event: WorkOrderDomainEvent,
});
export type WorkOrderStoredEvent = typeof WorkOrderStoredEvent.Type;

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export const WorkOrderListItem = Schema.Struct({
  id: WorkOrderId,
  slug: WorkOrderSlug,
  projectId: ProjectId,
  idea: TrimmedNonEmptyString,
  stage: WorkOrderStage,
  modelSelection: WorkOrderModelSelection,
  frontierSize: Schema.Number,
  runsInFlight: Schema.Number,
  needsInputCount: Schema.Number,
  integrationBranch: Schema.NullOr(IntegrationBranch),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  planningThreadId: Schema.NullOr(ThreadId),
  createdAt: Schema.DateTimeUtc,
});
export type WorkOrderListItem = typeof WorkOrderListItem.Type;

export const WorkOrderTicketGraphTicket = Schema.Struct({
  number: Schema.Int,
  slug: WorkOrderSlug,
  title: TrimmedNonEmptyString,
  state: WorkOrderTicketState,
  blockedBy: Schema.Array(Schema.Int),
});
export type WorkOrderTicketGraphTicket = typeof WorkOrderTicketGraphTicket.Type;

/** Ticket Graph is populated by the Tickets stage (#8+); placeholder until then. */
export const WorkOrderDetail = Schema.Struct({
  id: WorkOrderId,
  slug: WorkOrderSlug,
  projectId: ProjectId,
  idea: TrimmedNonEmptyString,
  stage: WorkOrderStage,
  modelSelection: WorkOrderModelSelection,
  integrationBranch: Schema.NullOr(IntegrationBranch),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  planningThreadId: Schema.NullOr(ThreadId),
  autopilot: Schema.Boolean,
  domainDocsInRepo: Schema.Boolean,
  parkedQuestion: Schema.NullOr(TrimmedNonEmptyString),
  tickets: Schema.Array(WorkOrderTicketGraphTicket),
  specText: Schema.NullOr(TrimmedNonEmptyString),
  reviewFindings: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: Schema.DateTimeUtc,
});
export type WorkOrderDetail = typeof WorkOrderDetail.Type;

export class WorkOrderNotFoundError extends Schema.TaggedError<WorkOrderNotFoundError>()(
  "WorkOrderNotFoundError",
  { workOrderId: WorkOrderId },
) {}

export class WorkOrderCommandRejectedError extends Schema.TaggedError<WorkOrderCommandRejectedError>()(
  "WorkOrderCommandRejectedError",
  { commandId: CommandId, reason: Schema.String },
) {}

// ---------------------------------------------------------------------------
// RPC surface
// ---------------------------------------------------------------------------

export const WORK_ORDER_WS_METHODS = {
  dispatchCommand: "workOrder.dispatchCommand",
  subscribeList: "workOrder.subscribeList",
  subscribeDetail: "workOrder.subscribeDetail",
} as const;

export const WorkOrderDispatchCommandInput = Schema.Struct({
  command: WorkOrderCommand,
});
export type WorkOrderDispatchCommandInput = typeof WorkOrderDispatchCommandInput.Type;

export const WorkOrderDispatchCommandResult = Schema.Struct({
  sequence: Schema.Number,
});
export type WorkOrderDispatchCommandResult = typeof WorkOrderDispatchCommandResult.Type;

export const WorkOrderSubscribeListInput = Schema.Struct({
  afterSequence: Schema.optional(Schema.Number),
});
export type WorkOrderSubscribeListInput = typeof WorkOrderSubscribeListInput.Type;

export const WorkOrderSubscribeDetailInput = Schema.Struct({
  workOrderId: WorkOrderId,
  afterSequence: Schema.optional(Schema.Number),
});
export type WorkOrderSubscribeDetailInput = typeof WorkOrderSubscribeDetailInput.Type;

/**
 * Stream items follow the orchestration pattern: `synchronized`/`snapshot`
 * first, then `event` frames carrying the sequence for resume. Unknown item
 * types are skipped by older clients.
 */
export const WorkOrderListStreamItem = Schema.Union([
  Schema.Struct({ type: Schema.Literal("synchronized") }),
  Schema.Struct({ type: Schema.Literal("snapshot"), items: Schema.Array(WorkOrderListItem) }),
  Schema.Struct({
    type: Schema.Literal("event"),
    sequence: Schema.Number,
    event: WorkOrderDomainEvent,
  }),
  Schema.Struct({ type: Schema.Literal("unknown-event") }),
]);
export type WorkOrderListStreamItem = typeof WorkOrderListStreamItem.Type;

export const WorkOrderDetailStreamItem = Schema.Union([
  Schema.Struct({ type: Schema.Literal("synchronized") }),
  Schema.Struct({ type: Schema.Literal("snapshot"), detail: WorkOrderDetail }),
  Schema.Struct({
    type: Schema.Literal("event"),
    sequence: Schema.Number,
    event: WorkOrderDomainEvent,
  }),
  Schema.Struct({ type: Schema.Literal("unknown-event") }),
]);
export type WorkOrderDetailStreamItem = typeof WorkOrderDetailStreamItem.Type;

export const WorkOrderRpcSchemas = {
  dispatchCommand: {
    input: WorkOrderDispatchCommandInput,
    output: WorkOrderDispatchCommandResult,
  },
  subscribeList: {
    input: WorkOrderSubscribeListInput,
    output: WorkOrderListStreamItem,
  },
  subscribeDetail: {
    input: WorkOrderSubscribeDetailInput,
    output: WorkOrderDetailStreamItem,
  },
} as const;

const WsWorkOrderDispatchCommandRpc = Rpc.make(WORK_ORDER_WS_METHODS.dispatchCommand, {
  payload: WorkOrderRpcSchemas.dispatchCommand.input,
  success: WorkOrderRpcSchemas.dispatchCommand.output,
  error: Schema.Union([
    WorkOrderNotFoundError,
    WorkOrderCommandRejectedError,
    EnvironmentAuthorizationError,
  ]),
});

const WsWorkOrderSubscribeListRpc = Rpc.make(WORK_ORDER_WS_METHODS.subscribeList, {
  payload: WorkOrderRpcSchemas.subscribeList.input,
  success: WorkOrderRpcSchemas.subscribeList.output,
  error: Schema.Union([EnvironmentAuthorizationError]),
  stream: true,
});

const WsWorkOrderSubscribeDetailRpc = Rpc.make(WORK_ORDER_WS_METHODS.subscribeDetail, {
  payload: WorkOrderRpcSchemas.subscribeDetail.input,
  success: WorkOrderRpcSchemas.subscribeDetail.output,
  error: Schema.Union([WorkOrderNotFoundError, EnvironmentAuthorizationError]),
  stream: true,
});

export const WorkOrderRpcs = [
  WsWorkOrderDispatchCommandRpc,
  WsWorkOrderSubscribeListRpc,
  WsWorkOrderSubscribeDetailRpc,
] as const;

/** Server mirror lives in apps/server/src/auth/RpcAuthorization.ts. */
export const WORK_ORDER_RPC_REQUIRED_SCOPES = {
  [WORK_ORDER_WS_METHODS.dispatchCommand]: AuthOrchestrationOperateScope,
  [WORK_ORDER_WS_METHODS.subscribeList]: AuthOrchestrationReadScope,
  [WORK_ORDER_WS_METHODS.subscribeDetail]: AuthOrchestrationReadScope,
} as const satisfies Record<string, AuthEnvironmentScope>;

/** Client-side guarded subset (see clientRpcPermissions.ts). */
export const WORK_ORDER_CLIENT_GUARDED_RPC_SCOPES = {
  [WORK_ORDER_WS_METHODS.dispatchCommand]: AuthOrchestrationOperateScope,
} as const satisfies Record<string, AuthEnvironmentScope>;
