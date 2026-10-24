import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { WorkOrderBoardPage } from "~/workOrder/WorkOrderBoardPage";
import { WorkOrdersDesktopOnly } from "~/workOrder/WorkOrdersDesktopOnly";

export const Route = createFileRoute("/_chat/workorders/")({
  component: WorkOrdersBoardRoute,
});

function WorkOrdersBoardRoute() {
  if (!isElectron) {
    return <WorkOrdersDesktopOnly />;
  }
  return <WorkOrderBoardPage />;
}
