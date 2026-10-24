import {
  WorkOrderDetail,
  WorkOrderDetailStreamItem,
  type WorkOrderListItem,
  WorkOrderListStreamItem,
  type WorkOrderDetailStreamItem as WorkOrderDetailStreamItemT,
  type WorkOrderListStreamItem as WorkOrderListStreamItemT,
} from "@t3tools/contracts";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as Orchestrator from "./WorkOrderOrchestrator.ts";
import * as Worker from "./WorkOrderEffectWorker.ts";
import * as WorkOrderStore from "./WorkOrderStore.ts";

const decodeDetail = Schema.decodeUnknownSync(WorkOrderDetail);

/** Ticket Graph and Spec/Review text arrive with the Tickets/Review tickets (#8+). */
export const detailFromListItem = (item: WorkOrderListItem): WorkOrderDetail =>
  decodeDetail({
    id: item.id,
    slug: item.slug,
    projectId: item.projectId,
    idea: item.idea,
    stage: item.stage,
    modelSelection: item.modelSelection,
    integrationBranch: item.integrationBranch,
    worktreePath: item.worktreePath,
    planningThreadId: item.planningThreadId,
    autopilot: false,
    domainDocsInRepo: true,
    parkedQuestion: null,
    tickets: [],
    specText: null,
    specTitle: null,
    reviewThreadId: null,
    fixRun: null,
    reviewFindings: null,
    createdAt: item.createdAt,
  });

export const subscribeList = (
  store: WorkOrderStore.WorkOrderStore["Service"],
  input: {
    readonly afterSequence?: number | undefined;
  },
): Stream.Stream<WorkOrderListStreamItemT, WorkOrderStore.WorkOrderStoreError> =>
  Effect.gen(function* () {
    const latest = yield* store.latestSequence();
    const items = yield* store.list();
    const head: WorkOrderListStreamItemT[] = [{ type: "synchronized" }];
    if (input.afterSequence === undefined) head.push({ type: "snapshot", items });
    const resumeFrom = input.afterSequence ?? latest;
    return Stream.make(head).pipe(
      Stream.flatMap(Stream.fromIterable),
      Stream.concat(
        store.liveEvents.pipe(
          Stream.filter((event) => event.sequence > resumeFrom),
          Stream.map((event): WorkOrderListStreamItemT => ({
            type: "event",
            sequence: event.sequence,
            event: event.event,
          })),
        ),
      ),
    );
  }).pipe(Stream.unwrap);

export const subscribeDetail = (
  store: WorkOrderStore.WorkOrderStore["Service"],
  input: {
    readonly workOrderId: string;
    readonly afterSequence?: number | undefined;
  },
): Stream.Stream<WorkOrderDetailStreamItemT, WorkOrderStore.WorkOrderStoreError> =>
  Effect.gen(function* () {
    const item = yield* store.get(input.workOrderId);
    if (item === null) return Stream.empty;
    const latest = yield* store.latestSequence();
    const head: WorkOrderDetailStreamItemT[] = [{ type: "synchronized" }];
    if (input.afterSequence === undefined) {
      head.push({ type: "snapshot", detail: detailFromListItem(item) });
    }
    const resumeFrom = input.afterSequence ?? latest;
    return Stream.make(head).pipe(
      Stream.flatMap(Stream.fromIterable),
      Stream.concat(
        store.liveEvents.pipe(
          Stream.filter(
            (event) => event.sequence > resumeFrom && event.event.workOrderId === input.workOrderId,
          ),
          Stream.map((event): WorkOrderDetailStreamItemT => ({
            type: "event",
            sequence: event.sequence,
            event: event.event,
          })),
        ),
      ),
    );
  }).pipe(Stream.unwrap);

/**
 * Everything the module needs beside T3's orchestration stack (SqlClient,
 * ThreadLaunchService, git drivers), which server.ts provides via its
 * orchestration application layers.
 */
export const layer = Layer.mergeAll(
  WorkOrderStore.WorkOrderStoreLive,
  Orchestrator.WorkOrderOrchestratorLive,
  Worker.WorkOrderEffectWorkerLive,
).pipe(
  Layer.provideMerge(Orchestrator.WorkOrderOrchestratorLive),
  Layer.provideMerge(Worker.WorkOrderEffectWorkerLive),
);

export const layerStarted = Layer.effectDiscard(
  Effect.gen(function* () {
    const worker = yield* Worker.WorkOrderEffectWorker;
    yield* worker.start();
  }),
).pipe(Layer.provideMerge(layer));
