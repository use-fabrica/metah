import type { WorkOrderStage } from "@t3tools/contracts";

/**
 * Board column order. Parked is rendered as its own lane so a parked WorkOrder
 * never hides inside the stage it was parked from.
 */
export const BOARD_STAGES: ReadonlyArray<{ stage: WorkOrderStage; label: string }> = [
  { stage: "grilling", label: "Grilling" },
  { stage: "spec", label: "Spec" },
  { stage: "tickets", label: "Tickets" },
  { stage: "running", label: "Running" },
  { stage: "review", label: "Review" },
  { stage: "done", label: "Done" },
];

export const PARKED_STAGE: WorkOrderStage = "parked";
