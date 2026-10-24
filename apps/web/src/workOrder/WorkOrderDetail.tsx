import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  MessageSquareIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { type ThreadId, type WorkOrderId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import ChatMarkdown from "~/components/ChatMarkdown";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";
import { BOARD_STAGES } from "~/workOrder/stages";
import { useWorkOrder, useWorkOrderDispatch, type WorkOrderCommandInput } from "~/workOrder/state";
import { WorkOrderTicketBoard } from "~/workOrder/WorkOrderTicketBoard";

function stageLabel(stage: string): string {
  return (
    BOARD_STAGES.find((entry) => entry.stage === stage)?.label ??
    (stage === "parked" ? "Parked" : stage)
  );
}

function GateButton(props: {
  readonly label: string;
  readonly gate: "grilling" | "spec" | "tickets" | "review";
  readonly workOrderId: WorkOrderId;
  readonly disabled: boolean;
}) {
  const dispatch = useWorkOrderDispatch(usePrimaryEnvironmentId());
  return (
    <Button
      size="sm"
      disabled={props.disabled}
      onClick={() =>
        void dispatch({
          type: "workOrder.passGate",
          workOrderId: props.workOrderId,
          gate: props.gate,
        })
      }
    >
      <CheckIcon className="size-4" />
      {props.label}
    </Button>
  );
}

function RequestTextAreaAction(props: {
  readonly workOrderId: WorkOrderId;
  readonly placeholder: string;
  readonly buttonLabel: string;
  readonly disabled: boolean;
  readonly buildCommand: (workOrderId: WorkOrderId, value: string) => WorkOrderCommandInput;
}) {
  const dispatch = useWorkOrderDispatch(usePrimaryEnvironmentId());
  const [value, setValue] = useState("");
  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    void dispatch(props.buildCommand(props.workOrderId, trimmed));
    setValue("");
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={props.placeholder}
        className="min-h-20"
      />
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={props.disabled || value.trim().length === 0}
          onClick={submit}
        >
          {props.buttonLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Desktop WorkOrder detail: header with stage/gates/autopilot/discard, spec and
 * review viewers, and the Ticket Graph board. All actions go through
 * workOrder.dispatchCommand; rejections surface as toasts with the reason.
 */
export function WorkOrderDetail(props: { readonly workOrderId: string }) {
  const environmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const dispatch = useWorkOrderDispatch(environmentId);
  const { detail, error } = useWorkOrder(environmentId, props.workOrderId);
  const [discardOpen, setDiscardOpen] = useState(false);

  const openThread = (threadId: ThreadId) => {
    if (environmentId === null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });
  };

  const copyBranch = () => {
    if (detail?.integrationBranch == null) return;
    void navigator.clipboard.writeText(detail.integrationBranch).catch(() => undefined);
  };

  if (environmentId === null || detail === null) {
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
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold">WorkOrder</h1>
        </div>
        <div className="p-4">
          {error !== null ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : (
            <p className="text-muted-foreground text-sm">Loading WorkOrder…</p>
          )}
        </div>
      </div>
    );
  }

  const stage = detail.stage;
  const isDiscarded = stage === "discarded";

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex flex-row flex-wrap items-center gap-3 border-border border-b px-4 py-3">
        <Link
          to="/workorders"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          aria-label="Back to WorkOrders"
        >
          <ArrowLeftIcon className="size-4" />
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold">{detail.slug}</h1>
        <Badge variant={stage === "parked" ? "warning" : isDiscarded ? "error" : "info"}>
          {stageLabel(stage)}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm" title={detail.idea}>
          {detail.idea}
        </span>
        {detail.planningThreadId !== null ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const threadId = detail.planningThreadId;
              if (threadId !== null) openThread(threadId);
            }}
          >
            <MessageSquareIcon className="size-4" />
            Planning Session
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {isDiscarded ? (
          <p className="text-destructive text-sm">
            This WorkOrder was discarded. Its Spec, Tickets, and findings stay viewable.
          </p>
        ) : null}

        {/* Meta row */}
        <div className="flex flex-row flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs uppercase">Integration Branch</span>
            <div className="flex flex-row items-center gap-1.5">
              <code
                className={
                  stage === "done"
                    ? "rounded bg-primary/10 px-2 py-1 font-mono text-sm text-primary"
                    : "rounded bg-muted px-2 py-1 font-mono text-xs"
                }
              >
                {detail.integrationBranch ?? "—"}
              </code>
              {detail.integrationBranch !== null ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy integration branch"
                  onClick={copyBranch}
                >
                  <CopyIcon className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs uppercase">Autopilot</span>
            <Switch
              checked={detail.autopilot}
              disabled={isDiscarded}
              onCheckedChange={(checked) =>
                void dispatch({
                  type: "workOrder.setAutopilot",
                  workOrderId: detail.id,
                  enabled: checked === true,
                })
              }
              aria-label="Toggle autopilot"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs uppercase">Domain docs in repo</span>
            <Switch
              checked={detail.domainDocsInRepo}
              disabled={isDiscarded}
              onCheckedChange={(checked) =>
                void dispatch({
                  type: "workOrder.setDomainDocsInRepo",
                  workOrderId: detail.id,
                  enabled: checked === true,
                })
              }
              aria-label="Toggle domain docs in repo"
            />
          </div>
          {!isDiscarded ? (
            <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDiscardOpen(true)}
              >
                <Trash2Icon className="size-4" />
                Discard
              </Button>
              <AlertDialogPopup>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard this WorkOrder?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The WorkOrder moves to Discarded. Its Spec, Tickets, and findings stay viewable,
                    but no further commands run.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDiscardOpen(false);
                      void dispatch({ type: "workOrder.discard", workOrderId: detail.id });
                    }}
                  >
                    Discard
                  </Button>
                </AlertDialogFooter>
              </AlertDialogPopup>
            </AlertDialog>
          ) : null}
        </div>

        {/* Stage actions */}
        {!isDiscarded ? (
          <div className="flex flex-col gap-3">
            {stage === "grilling" ? (
              <div className="flex flex-col gap-3">
                <GateButton
                  label="Grilling Done"
                  gate="grilling"
                  workOrderId={detail.id}
                  disabled={false}
                />
                <RequestTextAreaAction
                  workOrderId={detail.id}
                  placeholder="Question to park the WorkOrder with…"
                  buttonLabel="Park"
                  disabled={false}
                  buildCommand={(workOrderId, question) => ({
                    type: "workOrder.park",
                    workOrderId,
                    question,
                  })}
                />
              </div>
            ) : null}
            {stage === "parked" ? (
              <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <div className="flex flex-row items-center gap-2">
                  <PauseCircleIcon className="size-4 text-warning" />
                  <span className="text-sm font-medium">Parked</span>
                </div>
                {detail.parkedQuestion !== null ? (
                  <p className="text-muted-foreground text-sm">{detail.parkedQuestion}</p>
                ) : null}
                <RequestTextAreaAction
                  workOrderId={detail.id}
                  placeholder="Verdict answering the parked question…"
                  buttonLabel="Unpark"
                  disabled={false}
                  buildCommand={(workOrderId, verdict) => ({
                    type: "workOrder.unpark",
                    workOrderId,
                    verdict,
                  })}
                />
              </div>
            ) : null}
            {stage === "spec" ? (
              <GateButton
                label="Spec approved"
                gate="spec"
                workOrderId={detail.id}
                disabled={false}
              />
            ) : null}
            {stage === "tickets" ? (
              <GateButton
                label="Tickets approved"
                gate="tickets"
                workOrderId={detail.id}
                disabled={false}
              />
            ) : null}
            {stage === "running" ? (
              <RequestTextAreaAction
                workOrderId={detail.id}
                placeholder="Requested graph change…"
                buttonLabel="Request graph change"
                disabled={false}
                buildCommand={(workOrderId, request) => ({
                  type: "workOrder.resumeForGraphChange",
                  workOrderId,
                  request,
                })}
              />
            ) : null}
            {stage === "review" ? (
              <GateButton
                label="Accept Review"
                gate="review"
                workOrderId={detail.id}
                disabled={false}
              />
            ) : null}
          </div>
        ) : null}

        {/* Spec viewer */}
        {detail.specText !== null ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">{detail.specTitle ?? "Spec"}</h2>
            <div className="rounded-lg border border-border p-4">
              <ChatMarkdown
                text={detail.specText}
                cwd={detail.worktreePath ?? undefined}
                environmentId={environmentId}
              />
            </div>
          </section>
        ) : null}

        {/* Review findings */}
        {(detail.reviewThreadId !== null || detail.fixRun !== null) && !isDiscarded ? (
          <section className="flex flex-row flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold">Review</h2>
            {detail.reviewThreadId !== null ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (detail.reviewThreadId !== null) openThread(detail.reviewThreadId);
                }}
              >
                <MessageSquareIcon className="size-4" />
                Review Session
              </Button>
            ) : null}
            {detail.fixRun !== null && detail.fixRun.threadId !== null ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const threadId = detail.fixRun?.threadId;
                  if (threadId != null) openThread(threadId);
                }}
              >
                <PlayCircleIcon className="size-4" />
                Fix Run chat
              </Button>
            ) : null}
          </section>
        ) : null}
        {detail.reviewFindings !== null ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Review findings</h2>
            <div className="rounded-lg border border-border p-4">
              <ChatMarkdown
                text={detail.reviewFindings.text}
                cwd={detail.worktreePath ?? undefined}
                environmentId={environmentId}
              />
            </div>
            <div className="flex flex-col gap-3">
              {(["standards", "spec"] as const).map((axis) => {
                const findings = detail.reviewFindings?.findings.filter(
                  (finding) => finding.axis === axis,
                );
                if (findings === undefined || findings.length === 0) return null;
                return (
                  <div key={axis} className="flex flex-col gap-1">
                    <Label className="text-muted-foreground text-xs uppercase">{axis}</Label>
                    <ul className="flex list-disc flex-col gap-1 pl-5">
                      {findings.map((finding, index) => (
                        <li key={index} className="text-sm">
                          {finding.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Ticket Graph board */}
        {detail.tickets.length > 0 ? (
          <section className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-semibold">Ticket Graph</h2>
            <WorkOrderTicketBoard detail={detail} environmentId={environmentId} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
