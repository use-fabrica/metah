import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, MessageSquareIcon } from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";
import { BOARD_STAGES } from "~/workOrder/stages";
import { useWorkOrder } from "~/workOrder/state";

function stageLabel(stage: string): string {
  return (
    BOARD_STAGES.find((entry) => entry.stage === stage)?.label ??
    (stage === "parked" ? "Parked" : stage)
  );
}

/**
 * Placeholder detail view: header with stage and Integration Branch. The
 * Ticket Graph board arrives in ticket #5.
 */
export function WorkOrderDetail(props: { readonly workOrderId: string }) {
  const environmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const { detail, error } = useWorkOrder(environmentId, props.workOrderId);

  const openPlanningSession = () => {
    if (environmentId === null || detail?.planningThreadId == null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, detail.planningThreadId)),
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-row items-center gap-3 border-border border-b px-4 py-3">
        <Link
          to="/workorders"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          aria-label="Back to WorkOrders"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {detail?.slug ?? "WorkOrder"}
        </h1>
        {detail?.planningThreadId !== null && detail?.planningThreadId !== undefined ? (
          <Button variant="outline" size="sm" onClick={openPlanningSession}>
            <MessageSquareIcon className="size-4" />
            Planning Session
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-4 p-4">
        {error !== null ? <p className="text-destructive text-sm">{error}</p> : null}
        {detail === null ? (
          error === null ? (
            <p className="text-muted-foreground text-sm">Loading WorkOrder…</p>
          ) : null
        ) : (
          <dl className="flex flex-row gap-8 text-sm">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground text-xs uppercase">Stage</dt>
              <dd>
                <Badge variant={detail.stage === "parked" ? "warning" : "info"}>
                  {stageLabel(detail.stage)}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground text-xs uppercase">Integration Branch</dt>
              <dd className="font-mono text-xs">{detail.integrationBranch ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground text-xs uppercase">Autopilot</dt>
              <dd>{detail.autopilot ? "On" : "Off"}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
