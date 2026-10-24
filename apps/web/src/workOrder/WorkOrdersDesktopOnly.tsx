import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { MonitorIcon } from "lucide-react";

/** Rendered when the WorkOrder board is opened outside the desktop app. */
export function WorkOrdersDesktopOnly() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <MonitorIcon />
          </EmptyMedia>
          <EmptyTitle>WorkOrders are desktop-only</EmptyTitle>
          <EmptyDescription>
            Open T3 Code in the desktop app to plan and run WorkOrders on your projects.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function WorkOrdersUnavailableNotice({ message }: { readonly message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
