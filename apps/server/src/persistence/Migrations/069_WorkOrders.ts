import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE work_order_events (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      work_order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX work_order_events_work_order_idx
    ON work_order_events(work_order_id, sequence)
  `;

  yield* sql`
    CREATE TABLE work_orders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      idea TEXT NOT NULL,
      stage TEXT NOT NULL,
      provider_instance_id TEXT NOT NULL,
      model TEXT NOT NULL,
      integration_branch TEXT,
      worktree_path TEXT,
      planning_thread_id TEXT,
      autopilot INTEGER NOT NULL DEFAULT 0,
      domain_docs_in_repo INTEGER NOT NULL DEFAULT 1,
      parked_question TEXT,
      spec_text TEXT,
      review_findings TEXT,
      frontier_size INTEGER NOT NULL DEFAULT 0,
      runs_in_flight INTEGER NOT NULL DEFAULT 0,
      needs_input_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, slug)
    )
  `;

  yield* sql`
    CREATE INDEX work_orders_project_idx ON work_orders(project_id, slug)
  `;

  yield* sql`
    CREATE TABLE work_order_effect_intents (
      id TEXT PRIMARY KEY,
      work_order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX work_order_effect_intents_status_idx
    ON work_order_effect_intents(status, created_at)
  `;

  yield* sql`
    CREATE TABLE work_order_command_receipts (
      command_id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL,
      rejected INTEGER NOT NULL DEFAULT 0,
      response_json TEXT
    )
  `;
});
