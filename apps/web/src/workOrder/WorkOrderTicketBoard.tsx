import {
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
  type ThreadId,
  type WorkOrderId,
  type WorkOrderDetail,
  type WorkOrderRunSummary,
  type WorkOrderTicketGraphTicket,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleDotIcon,
  GitMergeIcon,
  HelpCircleIcon,
  MessageSquareIcon,
  OctagonMinusIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import type { ModelEsque } from "~/components/chat/providerIconUtils";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { useEnvironmentProviders } from "~/state/environments";
import { getCustomModelOptionsByInstance, resolveAppModelSelectionState } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "~/providerInstances";
import { useWorkOrderDispatch } from "~/workOrder/state";

const TICKET_COLUMNS: ReadonlyArray<{
  state: WorkOrderTicketGraphTicket["state"];
  label: string;
  highlight?: boolean;
}> = [
  { state: "blocked", label: "Blocked" },
  { state: "frontier", label: "Frontier", highlight: true },
  { state: "running", label: "Running" },
  { state: "needs_input", label: "Needs input" },
  { state: "failed", label: "Failed" },
  { state: "merged", label: "Merged" },
  { state: "abandoned", label: "Abandoned" },
];

/** Resolved provider/model options for run overrides, mirroring NewWorkOrderDialog. */
function useProviderModelOptions(environmentId: EnvironmentId, projectId: ProjectIdLike) {
  const providersByEnvironment = useEnvironmentProviders();
  const settings = useEnvironmentSettings(environmentId);
  return useMemo(() => {
    const providers =
      providersByEnvironment.get(environmentId) ?? ([] as ReadonlyArray<ServerProvider>);
    const textGenerationProviders = providers.filter(
      (provider) => provider.supportsTextGeneration !== false,
    );
    const instanceEntries = sortProviderInstanceEntries(
      applyProviderInstanceSettings(
        deriveProviderInstanceEntries(textGenerationProviders),
        settings,
        projectId,
      ),
    ).filter((entry) => entry.enabled && entry.isAvailable && entry.models.length > 0);
    const resolvedDefault = resolveAppModelSelectionState(settings, textGenerationProviders);
    const fallbackInstanceId = instanceEntries.some(
      (entry) => entry.instanceId === resolvedDefault.instanceId,
    )
      ? resolvedDefault.instanceId
      : (instanceEntries[0]?.instanceId ?? resolvedDefault.instanceId);
    const modelOptionsByInstance = getCustomModelOptionsByInstance(
      settings,
      textGenerationProviders,
      fallbackInstanceId,
      resolvedDefault.model,
    );
    return { instanceEntries, fallbackInstanceId, modelOptionsByInstance };
  }, [providersByEnvironment, environmentId, settings, projectId]);
}

function runStateBadgeVariant(state: WorkOrderRunSummary["state"]) {
  switch (state) {
    case "running":
      return "info";
    case "needs_input":
      return "warning";
    case "failed":
      return "error";
    default:
      return "outline";
  }
}

function RunChatLink(props: {
  readonly threadId: ThreadId;
  readonly label: string;
  readonly onOpen: (threadId: ThreadId) => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-primary text-xs underline-offset-2 hover:underline"
      onClick={(event) => {
        event.stopPropagation();
        props.onOpen(props.threadId);
      }}
    >
      <MessageSquareIcon className="size-3" />
      {props.label}
    </button>
  );
}

interface TicketCardProps {
  readonly ticket: WorkOrderTicketGraphTicket;
  readonly workOrderId: WorkOrderId;
  readonly environmentId: EnvironmentId;
  readonly instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  readonly modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  readonly defaultInstanceId: ProviderInstanceId;
  readonly defaultModel: string;
  readonly highlighted: boolean;
  readonly onHoverTicket: (number: number | null) => void;
  readonly onOpenThread: (threadId: ThreadId) => void;
}

function TicketCard(props: TicketCardProps) {
  const { ticket } = props;
  const dispatch = useWorkOrderDispatch(props.environmentId);
  const [override, setOverride] = useState<{
    instanceId: ProviderInstanceId;
    model: string;
  } | null>(null);

  const currentRun = ticket.runs.find((run) => run.state !== "superseded") ?? null;
  const priorRuns = ticket.runs.filter((run) => run !== currentRun);
  const currentRunThreadId = currentRun?.threadId ?? null;

  const startRun = () => {
    void dispatch({
      type: "workOrder.startRun",
      workOrderId: props.workOrderId,
      ticketNumber: ticket.number,
      ...(override === null
        ? {}
        : {
            modelSelection: {
              providerInstanceId: override.instanceId,
              model: override.model,
            },
          }),
    });
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-52 flex-col gap-2 rounded-lg border bg-background p-3 text-left",
        props.highlighted ? "border-primary" : "border-border",
        ticket.state === "frontier" && "border-primary/60 shadow-sm",
      )}
      onMouseEnter={() => props.onHoverTicket(ticket.number)}
      onMouseLeave={() => props.onHoverTicket(null)}
    >
      <div className="flex flex-row items-center gap-2">
        <span className="shrink-0 font-mono text-muted-foreground text-xs">#{ticket.number}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{ticket.title}</span>
      </div>
      {ticket.body.trim().length > 0 ? (
        <p className="line-clamp-2 text-muted-foreground text-xs">{ticket.body}</p>
      ) : null}
      {ticket.blockedBy.length > 0 ? (
        <div className="flex flex-row flex-wrap items-center gap-1">
          {ticket.blockedBy.map((blocker) => (
            <button
              key={blocker}
              type="button"
              className="rounded border border-border px-1.5 py-0.5 font-mono text-muted-foreground text-xs hover:border-primary hover:text-primary"
              onMouseEnter={() => props.onHoverTicket(blocker)}
              onMouseLeave={() => props.onHoverTicket(ticket.number)}
              onClick={() => props.onHoverTicket(blocker)}
            >
              #{blocker}
            </button>
          ))}
        </div>
      ) : null}
      {currentRun !== null ? (
        <div className="flex flex-col gap-1 text-muted-foreground text-xs">
          <div className="flex flex-row flex-wrap items-center gap-1.5">
            <Badge size="sm" variant={runStateBadgeVariant(currentRun.state)}>
              {currentRun.state.replace("_", " ")}
            </Badge>
            <span className="font-mono">attempt {currentRun.attempt}</span>
            {currentRun.kind === "fix" ? (
              <Badge size="sm" variant="outline">
                fix
              </Badge>
            ) : null}
          </div>
          {currentRun.threadId !== null ? (
            <RunChatLink
              threadId={currentRun.threadId}
              label="Run chat"
              onOpen={props.onOpenThread}
            />
          ) : null}
          <span className="truncate font-mono">{currentRun.branch}</span>
        </div>
      ) : null}
      {priorRuns.length > 0 ? (
        <div className="flex flex-col gap-0.5 text-muted-foreground text-xs">
          <span className="text-[10px] uppercase">Prior attempts</span>
          {priorRuns.map((run) => (
            <div key={run.runId} className="flex flex-row items-center gap-1.5">
              <span className="font-mono">#{run.attempt}</span>
              <Badge size="sm" variant={runStateBadgeVariant(run.state)}>
                {run.state.replace("_", " ")}
              </Badge>
              {run.threadId !== null ? (
                <RunChatLink threadId={run.threadId} label="chat" onOpen={props.onOpenThread} />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex flex-row flex-wrap items-center gap-1.5">
        {ticket.state === "frontier" ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button size="sm" variant="outline" disabled={props.instanceEntries.length === 0}>
                  <PlayIcon className="size-3.5" />
                  Start Run
                </Button>
              }
            />
            <PopoverPopup className="flex w-64 flex-col gap-2 p-3">
              <p className="text-muted-foreground text-xs">
                Optional provider/model override; defaults to the WorkOrder selection.
              </p>
              <ProviderModelPicker
                environmentId={props.environmentId}
                activeInstanceId={override?.instanceId ?? props.defaultInstanceId}
                model={override?.model ?? props.defaultModel}
                instanceEntries={props.instanceEntries}
                modelOptionsByInstance={props.modelOptionsByInstance}
                lockedProvider={null}
                onInstanceModelChange={(instanceId, model) => setOverride({ instanceId, model })}
              />
              <Button size="sm" onClick={startRun}>
                <PlayIcon className="size-3.5" />
                {override === null ? "Start Run" : "Start Run (override)"}
              </Button>
            </PopoverPopup>
          </Popover>
        ) : null}
        {ticket.state === "failed" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void dispatch({
                type: "workOrder.retryRun",
                workOrderId: props.workOrderId,
                ticketNumber: ticket.number,
              })
            }
          >
            <RotateCcwIcon className="size-3.5" />
            Retry
          </Button>
        ) : null}
        {ticket.state === "frontier" ||
        ticket.state === "failed" ||
        ticket.state === "needs_input" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void dispatch({
                type: "workOrder.abandonTicket",
                workOrderId: props.workOrderId,
                ticketNumber: ticket.number,
              })
            }
          >
            <OctagonMinusIcon className="size-3.5" />
            Abandon
          </Button>
        ) : null}
        {ticket.state === "needs_input" && currentRunThreadId !== null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={
              currentRunThreadId === null ? undefined : () => props.onOpenThread(currentRunThreadId)
            }
          >
            <HelpCircleIcon className="size-3.5" />
            Open chat
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type ProjectIdLike = Parameters<typeof applyProviderInstanceSettings>[2];

/** Ticket Graph board: one column per ticket state; Frontier highlighted. */
export function WorkOrderTicketBoard(props: {
  readonly detail: WorkOrderDetail;
  readonly environmentId: EnvironmentId;
}) {
  const navigate = useNavigate();
  const [hoveredTicket, setHoveredTicket] = useState<number | null>(null);
  const { instanceEntries, modelOptionsByInstance } = useProviderModelOptions(
    props.environmentId,
    props.detail.projectId,
  );

  const byState = useMemo(() => {
    const map = new Map<WorkOrderTicketGraphTicket["state"], WorkOrderTicketGraphTicket[]>();
    for (const column of TICKET_COLUMNS) map.set(column.state, []);
    for (const ticket of props.detail.tickets) {
      map.get(ticket.state)?.push(ticket);
    }
    return map;
  }, [props.detail.tickets]);

  const openThread = (threadId: ThreadId) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(props.environmentId, threadId)),
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {TICKET_COLUMNS.map((column) => {
        const tickets = byState.get(column.state) ?? [];
        return (
          <div key={column.state} className="flex min-w-60 flex-1 flex-col gap-2">
            <div className="flex flex-row items-center gap-1.5 px-1">
              {column.state === "running" ? (
                <CircleDotIcon className="size-3.5 text-muted-foreground" />
              ) : column.state === "merged" ? (
                <GitMergeIcon className="size-3.5 text-muted-foreground" />
              ) : column.state === "needs_input" ? (
                <HelpCircleIcon className="size-3.5 text-muted-foreground" />
              ) : column.state === "failed" ? (
                <TriangleAlertIcon className="size-3.5 text-muted-foreground" />
              ) : column.state === "abandoned" ? (
                <PauseIcon className="size-3.5 text-muted-foreground" />
              ) : null}
              <h3
                className={cn(
                  "text-xs font-semibold tracking-wide uppercase",
                  column.highlight ? "text-primary" : "text-muted-foreground",
                )}
              >
                {column.label}
              </h3>
              <span className="text-muted-foreground text-xs">{tickets.length}</span>
            </div>
            <div
              className={cn(
                "flex flex-1 flex-col gap-2 rounded-xl p-2",
                column.highlight ? "bg-primary/5 ring-1 ring-primary/40" : "bg-muted/30",
              )}
            >
              {tickets.length === 0 ? (
                <p className="px-1 py-2 text-muted-foreground text-xs">—</p>
              ) : (
                tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.number}
                    ticket={ticket}
                    workOrderId={props.detail.id}
                    environmentId={props.environmentId}
                    instanceEntries={instanceEntries}
                    modelOptionsByInstance={modelOptionsByInstance}
                    defaultInstanceId={props.detail.modelSelection.providerInstanceId}
                    defaultModel={props.detail.modelSelection.model}
                    highlighted={hoveredTicket === ticket.number}
                    onHoverTicket={setHoveredTicket}
                    onOpenThread={openThread}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
