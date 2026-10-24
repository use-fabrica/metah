import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  CircleDotIcon,
  MessageSquareDotIcon,
  PauseCircleIcon,
} from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import { BOARD_STAGES } from "~/workOrder/stages";
import type { WorkOrderCardModel } from "~/workOrder/state";

const CARD_MIN_WIDTH = "min-w-56";

function WorkOrderCard(props: {
  readonly order: WorkOrderCardModel;
  readonly onOpen: (order: WorkOrderCardModel) => void;
}) {
  const { order } = props;
  return (
    <button
      type="button"
      onClick={() => props.onOpen(order)}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-accent/40",
        CARD_MIN_WIDTH,
      )}
    >
      <div className="flex flex-row items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{order.title}</span>
        {order.planningThreadId !== null ? (
          <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </div>
      <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {order.projectTitle ? <span className="truncate">{order.projectTitle}</span> : null}
        {order.providerLabel ? (
          <span className="truncate">
            {order.providerLabel}
            {order.model ? ` · ${order.model}` : ""}
          </span>
        ) : null}
      </div>
      <div className="flex flex-row flex-wrap items-center gap-1.5">
        {order.frontierSize !== null ? (
          <Badge variant="outline" size="sm">
            Frontier {order.frontierSize}
          </Badge>
        ) : null}
        {order.runsInFlight > 0 ? (
          <Badge variant="info" size="sm">
            <CircleDotIcon className="size-3" />
            {order.runsInFlight} running
          </Badge>
        ) : null}
        {order.needsInputCount > 0 ? (
          <Badge variant="error" size="sm">
            <MessageSquareDotIcon className="size-3" />
            {order.needsInputCount} need input
          </Badge>
        ) : null}
      </div>
    </button>
  );
}

function WorkOrderColumn(props: {
  readonly label: string;
  readonly orders: ReadonlyArray<WorkOrderCardModel>;
  readonly onOpen: (order: WorkOrderCardModel) => void;
  readonly parked?: boolean;
}) {
  return (
    <div className="flex min-w-64 flex-1 flex-col gap-2">
      <div className="flex flex-row items-center gap-2 px-1">
        {props.parked ? <PauseCircleIcon className="size-3.5 text-muted-foreground" /> : null}
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {props.label}
        </h2>
        <span className="text-xs text-muted-foreground">{props.orders.length}</span>
      </div>
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 rounded-xl p-2",
          props.parked ? "bg-warning/5" : "bg-muted/30",
        )}
      >
        {props.orders.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">No WorkOrders</p>
        ) : (
          props.orders.map((order) => (
            <WorkOrderCard key={order.id} order={order} onOpen={props.onOpen} />
          ))
        )}
      </div>
    </div>
  );
}

export function WorkOrderBoard(props: {
  readonly orders: ReadonlyArray<WorkOrderCardModel> | null;
  readonly error: string | null;
}) {
  const navigate = useNavigate();
  const byStage = new Map<string, WorkOrderCardModel[]>();
  const parked: WorkOrderCardModel[] = [];
  for (const stage of BOARD_STAGES) {
    byStage.set(stage.stage, []);
  }
  for (const order of props.orders ?? []) {
    if (order.parked) {
      parked.push(order);
    } else {
      byStage.get(order.stage)?.push(order);
    }
  }

  const openOrder = (order: WorkOrderCardModel) => {
    if (order.planningThreadId !== null && order.environmentId !== null) {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(order.environmentId, order.planningThreadId)),
      });
      return;
    }
    void navigate({ to: "/workorders/$workOrderId", params: { workOrderId: order.id } });
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 overflow-x-auto p-4">
      {props.error !== null ? <p className="text-destructive text-sm">{props.error}</p> : null}
      <div className="flex min-h-0 flex-1 gap-3">
        {BOARD_STAGES.map((stage) => (
          <WorkOrderColumn
            key={stage.stage}
            label={stage.label}
            orders={byStage.get(stage.stage) ?? []}
            onOpen={openOrder}
          />
        ))}
        <WorkOrderColumn label="Parked" orders={parked} onOpen={openOrder} parked />
      </div>
    </div>
  );
}
