import type {
  WorkOrderDomainEvent,
  WorkOrderListItem,
  WorkOrderStoredEvent as WorkOrderStoredEventT,
} from "@t3tools/contracts";
import {
  WorkOrderDomainEvent as WorkOrderDomainEventSchema,
  WorkOrderListItem as WorkOrderListItemSchema,
  WorkOrderStage,
  WorkOrderStoredEvent as WorkOrderStoredEventSchema,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";

export class WorkOrderStoreError extends Schema.TaggedError<WorkOrderStoreError>()(
  "WorkOrderStoreError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}

export interface WorkOrderClaimedIntent {
  readonly id: string;
  readonly workOrderId: string;
  readonly type: string;
  readonly payload: unknown;
}

export class WorkOrderStore extends Context.Service<
  WorkOrderStore,
  {
    /** Appends events and applies projections atomically, then publishes. */
    readonly append: (
      events: ReadonlyArray<WorkOrderDomainEvent>,
    ) => Effect.Effect<
      { readonly sequence: number; readonly storedEvents: ReadonlyArray<WorkOrderStoredEventT> },
      WorkOrderStoreError
    >;
    readonly readEvents: (input: {
      readonly afterSequence?: number | undefined;
    }) => Stream.Stream<WorkOrderStoredEventT, WorkOrderStoreError>;
    readonly liveEvents: Stream.Stream<WorkOrderStoredEventT>;
    readonly latestSequence: () => Effect.Effect<number, WorkOrderStoreError>;
    readonly list: () => Effect.Effect<ReadonlyArray<WorkOrderListItem>, WorkOrderStoreError>;
    readonly get: (id: string) => Effect.Effect<WorkOrderListItem | null, WorkOrderStoreError>;
    readonly readReceipt: (
      commandId: string,
    ) => Effect.Effect<{ readonly sequence: number } | null, WorkOrderStoreError>;
    readonly commitReceipt: (input: {
      readonly commandId: string;
      readonly sequence: number;
    }) => Effect.Effect<void, WorkOrderStoreError>;
    readonly enqueueIntent: (input: {
      readonly id: string;
      readonly workOrderId: string;
      readonly type: string;
      readonly payload: unknown;
    }) => Effect.Effect<void, WorkOrderStoreError>;
    readonly claimNextIntent: (
      types: ReadonlyArray<string>,
    ) => Effect.Effect<WorkOrderClaimedIntent | null, WorkOrderStoreError>;
    readonly completeIntent: (id: string) => Effect.Effect<void, WorkOrderStoreError>;
    readonly failIntent: (id: string, attempts: number) => Effect.Effect<void, WorkOrderStoreError>;
    readonly countPendingIntents: (
      types: ReadonlyArray<string>,
    ) => Effect.Effect<number, WorkOrderStoreError>;
  }
>()("t3/workOrder/WorkOrderStore") {}

interface WorkOrderRow {
  readonly id: string;
  readonly project_id: string;
  readonly slug: string;
  readonly idea: string;
  readonly stage: string;
  readonly provider_instance_id: string;
  readonly model: string;
  readonly integration_branch: string | null;
  readonly worktree_path: string | null;
  readonly planning_thread_id: string | null;
  readonly frontier_size: number;
  readonly runs_in_flight: number;
  readonly needs_input_count: number;
  readonly created_at: string;
}

const decodeListItem = Schema.decodeUnknownSync(WorkOrderListItemSchema);

const rowToListItem = (row: WorkOrderRow): WorkOrderListItem =>
  decodeListItem({
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    idea: row.idea,
    stage: Schema.decodeUnknownSync(WorkOrderStage)(row.stage),
    modelSelection: { providerInstanceId: row.provider_instance_id, model: row.model },
    frontierSize: Number(row.frontier_size),
    runsInFlight: Number(row.runs_in_flight),
    needsInputCount: Number(row.needs_input_count),
    integrationBranch: row.integration_branch,
    worktreePath: row.worktree_path,
    planningThreadId: row.planning_thread_id,
    createdAt: row.created_at,
  });

const encodeStoredEvent = Schema.encodeSync(WorkOrderStoredEventSchema);
const decodeStoredEvent = Schema.decodeUnknownSync(WorkOrderStoredEventSchema);
const encodeWorkOrderEvent = Schema.encodeSync(WorkOrderDomainEventSchema);

const storeError = (operation: string) => (cause: unknown) =>
  new WorkOrderStoreError({ operation, cause });

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const live = yield* PubSub.unbounded<ReadonlyArray<WorkOrderStoredEventT>>();
  const nowIso = () => DateTime.formatIso(DateTime.nowUnsafe());

  const applyProjection = (event: WorkOrderDomainEvent) =>
    Effect.gen(function* () {
      const now = nowIso();
      switch (event.type) {
        case "workOrder.created": {
          yield* sql`
            INSERT INTO work_orders (
              id, project_id, slug, idea, stage, provider_instance_id, model,
              created_at, updated_at
            ) VALUES (
              ${event.workOrderId}, ${event.projectId}, ${event.slug}, ${event.idea},
              ${event.stage}, ${event.modelSelection.providerInstanceId}, ${event.modelSelection.model},
              ${now}, ${now}
            )
          `;
          return;
        }
        case "workOrder.provisioned": {
          yield* sql`
            UPDATE work_orders
            SET integration_branch = ${event.integrationBranch},
                worktree_path = ${event.worktreePath},
                planning_thread_id = ${event.planningThreadId},
                updated_at = ${now}
            WHERE id = ${event.workOrderId}
          `;
          return;
        }
        case "workOrder.provisionFailed": {
          yield* sql`
            UPDATE work_orders SET updated_at = ${now} WHERE id = ${event.workOrderId}
          `;
          return;
        }
        case "workOrder.effectRequested":
          return;
      }
    });

  const append = (events: ReadonlyArray<WorkOrderDomainEvent>) =>
    Effect.gen(function* () {
      const stored: WorkOrderStoredEventT[] = [];
      for (const event of events) {
        const encoded = encodeWorkOrderEvent(event);
        const eventId = `woe-${yield* crypto.randomUUIDv4()}`;
        const occurredAt =
          typeof encoded.occurredAt === "string" ? encoded.occurredAt : nowIso();
        const rows = yield* sql<{ sequence: number | string }>`
          INSERT INTO work_order_events (event_id, work_order_id, type, payload_json, occurred_at)
          VALUES (${eventId}, ${event.workOrderId}, ${encoded.type}, ${JSON.stringify(encoded)}, ${occurredAt})
          RETURNING sequence
        `;
        const inserted = rows[0];
        if (inserted === undefined) {
          return yield* Effect.die("work_order_events insert returned no sequence");
        }
        const sequence = Number(inserted.sequence);
        yield* applyProjection(event);
        // The decider builds these literals; encode re-validates and produces
        // the wire shape stored in the event log.
        stored.push({ sequence, eventId, event: encoded } as unknown as WorkOrderStoredEventT);
      }
      yield* PubSub.publish(live, stored);
      return {
        sequence: stored[stored.length - 1]?.sequence ?? 0,
        storedEvents: stored,
      };
    }).pipe(
      (effect) => sql.withTransaction(effect),
      Effect.mapError(storeError("append")),
    );

  const readEvents = (input: { readonly afterSequence?: number | undefined }) =>
    Effect.gen(function* () {
      const rows = yield* sql<{
        sequence: number | string;
        eventId: string;
        payload: string;
      }>`
        SELECT sequence, event_id AS "eventId", payload_json AS "payload"
        FROM work_order_events
        WHERE sequence > ${input.afterSequence ?? 0}
        ORDER BY sequence
      `;
      return rows.map((row) =>
        decodeStoredEvent({
          sequence: Number(row.sequence),
          eventId: row.eventId,
          event: JSON.parse(row.payload),
        }),
      );
    }).pipe(
      Effect.mapError(storeError("readEvents")),
      Stream.fromIterableEffect,
    );

  return {
    append,
    readEvents,
    liveEvents: Stream.fromPubSub(live).pipe(Stream.flatMap(Stream.fromIterable)),
    latestSequence: () =>
      sql<{ sequence: number | string | null }>`
        SELECT MAX(sequence) AS sequence FROM work_order_events
      `.pipe(
        Effect.map((rows) => Number(rows[0]?.sequence ?? 0)),
        Effect.mapError(storeError("latestSequence")),
      ),
    list: () =>
      sql<WorkOrderRow>`SELECT * FROM work_orders ORDER BY created_at DESC`.pipe(
        Effect.map((rows) => rows.map(rowToListItem)),
        Effect.mapError(storeError("list")),
      ),
    get: (id: string) =>
      sql<WorkOrderRow>`SELECT * FROM work_orders WHERE id = ${id}`.pipe(
        Effect.map((rows) => (rows[0] === undefined ? null : rowToListItem(rows[0]))),
        Effect.mapError(storeError("get")),
      ),
    readReceipt: (commandId: string) =>
      sql<{ sequence: number | string }>`
        SELECT sequence FROM work_order_command_receipts WHERE command_id = ${commandId}
      `.pipe(
        Effect.map((rows) =>
          rows[0] === undefined ? null : { sequence: Number(rows[0].sequence) },
        ),
        Effect.mapError(storeError("readReceipt")),
      ),
    commitReceipt: (input: { readonly commandId: string; readonly sequence: number }) =>
      sql`
        INSERT INTO work_order_command_receipts (command_id, sequence)
        VALUES (${input.commandId}, ${input.sequence})
        ON CONFLICT (command_id) DO NOTHING
      `.pipe(Effect.asVoid, Effect.mapError(storeError("commitReceipt"))),
    enqueueIntent: (input: {
      readonly id: string;
      readonly workOrderId: string;
      readonly type: string;
      readonly payload: unknown;
    }) =>
      sql`
        INSERT INTO work_order_effect_intents (id, work_order_id, type, payload_json, status, created_at, updated_at)
        VALUES (${input.id}, ${input.workOrderId}, ${input.type}, ${JSON.stringify(input.payload)}, 'pending', ${nowIso()}, ${nowIso()})
        ON CONFLICT (id) DO NOTHING
      `.pipe(Effect.asVoid, Effect.mapError(storeError("enqueueIntent"))),
    claimNextIntent: (types: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const rows = yield* sql<{
          id: string;
          workOrderId: string;
          type: string;
          payload: string;
        }>`
          SELECT id, work_order_id AS "workOrderId", type, payload_json AS "payload"
          FROM work_order_effect_intents
          WHERE status = 'pending' AND type IN ${sql.in(types)}
          ORDER BY created_at
          LIMIT 1
        `;
        const claimed = rows[0];
        if (claimed === undefined) return null;
        yield* sql`
          UPDATE work_order_effect_intents
          SET status = 'claimed', attempts = attempts + 1, updated_at = ${nowIso()}
          WHERE id = ${claimed.id} AND status = 'pending'
        `;
        return {
          id: claimed.id,
          workOrderId: claimed.workOrderId,
          type: claimed.type,
          payload: JSON.parse(claimed.payload),
        };
      }).pipe(
        (effect) => sql.withTransaction(effect),
        Effect.mapError(storeError("claimNextIntent")),
      ),
    completeIntent: (id: string) =>
      sql`
        UPDATE work_order_effect_intents
        SET status = 'done', updated_at = ${nowIso()}
        WHERE id = ${id}
      `.pipe(Effect.asVoid, Effect.mapError(storeError("completeIntent"))),
    failIntent: (id: string, attempts: number) =>
      sql`
        UPDATE work_order_effect_intents
        SET status = ${attempts >= 5 ? "failed" : "pending"}, updated_at = ${nowIso()}
        WHERE id = ${id}
      `.pipe(Effect.asVoid, Effect.mapError(storeError("failIntent"))),
    countPendingIntents: (types: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const rows = yield* sql<{ count: number | string }>`
          SELECT COUNT(*) AS count FROM work_order_effect_intents
          WHERE status = 'pending' AND type IN ${sql.in(types)}
        `;
        const counted = rows[0];
        return Number(counted === undefined ? 0 : counted.count);
      }).pipe(Effect.mapError(storeError("countPendingIntents"))),
  } as const;
});

export const WorkOrderStoreLive = Layer.effect(WorkOrderStore, make);
