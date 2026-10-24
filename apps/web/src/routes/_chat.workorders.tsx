import { Outlet, createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { WorkOrdersDesktopOnly } from "~/workOrder/WorkOrdersDesktopOnly";

export const Route = createFileRoute("/_chat/workorders")({
  component: WorkOrdersLayout,
});

function WorkOrdersLayout() {
  if (!isElectron) {
    return <WorkOrdersDesktopOnly />;
  }
  return <Outlet />;
}
