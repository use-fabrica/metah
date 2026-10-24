import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { WorkOrdersDesktopOnly } from "~/workOrder/WorkOrdersDesktopOnly";
import { WorkOrderDetail } from "~/workOrder/WorkOrderDetail";

export const Route = createFileRoute("/_chat/workorders/$workOrderId")({
  component: WorkOrderDetailRoute,
});

function WorkOrderDetailRoute() {
  const { workOrderId } = Route.useParams();
  if (!isElectron) {
    return <WorkOrdersDesktopOnly />;
  }
  return <WorkOrderDetail workOrderId={workOrderId} />;
}
