import { useState } from "react";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { useAtomCommand } from "~/state/use-atom-command";
import { CommandId, WorkOrderId } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";

import { randomUUID } from "~/lib/utils";

import { Button } from "~/components/ui/button";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { WorkOrdersUnavailableNotice } from "~/workOrder/WorkOrdersDesktopOnly";
import { WorkOrderBoard } from "~/workOrder/WorkOrderBoard";
import { NewWorkOrderDialog, type NewWorkOrderInput } from "~/workOrder/NewWorkOrderDialog";
import { useWorkOrders, workOrderDispatchCommand } from "~/workOrder/state";

export function WorkOrderBoardPage() {
  const environmentId = usePrimaryEnvironmentId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { orders, error } = useWorkOrders(environmentId);
  const createWorkOrder = useAtomCommand(workOrderDispatchCommand, { reportFailure: false });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (environmentId === null) {
    return <WorkOrdersUnavailableNotice message="Connect to a machine to see WorkOrders." />;
  }

  const handleSubmit = (input: NewWorkOrderInput) => {
    setIsSubmitting(true);
    setSubmitError(null);
    void createWorkOrder({
      environmentId,
      input: {
        command: {
          type: "workOrder.create",
          commandId: CommandId.make(randomUUID()),
          workOrderId: WorkOrderId.make(randomUUID()),
          projectId: input.projectId,
          idea: input.idea,
          modelSelection: {
            providerInstanceId: input.instanceId,
            model: input.model,
          },
        },
      },
    })
      .then((result) => {
        if (result._tag === "Success") {
          setDialogOpen(false);
          return;
        }
        const error = Option.getOrNull(Cause.findErrorOption(result.cause));
        setSubmitError(
          error !== null && "reason" in error
            ? String(error.reason)
            : ((error as Error | null)?.message ?? "Failed to create WorkOrder."),
        );
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-row items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="flex-1 text-base font-semibold">WorkOrders</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon className="size-4" />
          New WorkOrder
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <WorkOrderBoard orders={orders} error={error} />
      </div>
      {dialogOpen ? (
        <NewWorkOrderDialog
          environmentId={environmentId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          error={submitError}
        />
      ) : null}
    </div>
  );
}
