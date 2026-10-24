import {
  type EnvironmentId,
  type ProjectId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { useProjects } from "~/state/entities";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { useEnvironmentProviders } from "~/state/environments";
import { getCustomModelOptionsByInstance, resolveAppModelSelectionState } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxTrigger,
} from "~/components/ui/combobox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";

export interface NewWorkOrderInput {
  readonly projectId: ProjectId;
  readonly idea: string;
  readonly instanceId: ProviderInstanceId;
  readonly model: string;
}

interface ProjectPickerItem {
  readonly value: ProjectId;
  readonly label: string;
}

export function NewWorkOrderDialog(props: {
  readonly environmentId: EnvironmentId;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: NewWorkOrderInput) => void;
  readonly isSubmitting: boolean;
  readonly error?: string | null;
}) {
  const projects = useProjects();
  const providersByEnvironment = useEnvironmentProviders();
  const settings = useEnvironmentSettings(props.environmentId);
  const [projectId, setProjectId] = useState<ProjectId | null>(null);
  const [idea, setIdea] = useState("");
  const [selection, setSelection] = useState<{
    instanceId: ProviderInstanceId;
    model: string;
  } | null>(null);

  const pickerItems: ReadonlyArray<ProjectPickerItem> = useMemo(
    () =>
      projects
        .filter((project) => project.environmentId === props.environmentId && !project.isScratch)
        .map((project) => ({ value: project.id, label: project.title })),
    [projects, props.environmentId],
  );
  const selectedProject = pickerItems.find((item) => item.value === projectId) ?? null;

  const providers =
    providersByEnvironment.get(props.environmentId) ?? ([] as ReadonlyArray<ServerProvider>);
  const textGenerationProviders = providers.filter(
    (provider) => provider.supportsTextGeneration !== false,
  );
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(
          deriveProviderInstanceEntries(textGenerationProviders),
          settings,
          projectId,
        ),
      ).filter((entry) => entry.enabled && entry.isAvailable && entry.models.length > 0),
    [textGenerationProviders, settings, projectId],
  );

  const resolvedDefault = useMemo(
    () => resolveAppModelSelectionState(settings, textGenerationProviders),
    [settings, textGenerationProviders],
  );
  const activeInstanceId =
    selection?.instanceId ??
    (instanceEntries.some((entry) => entry.instanceId === resolvedDefault.instanceId)
      ? resolvedDefault.instanceId
      : (instanceEntries[0]?.instanceId ?? resolvedDefault.instanceId));
  const activeModel = selection?.model ?? resolvedDefault.model;
  const modelOptionsByInstance = useMemo(
    () =>
      getCustomModelOptionsByInstance(
        settings,
        textGenerationProviders,
        activeInstanceId,
        activeModel,
      ),
    [settings, textGenerationProviders, activeInstanceId, activeModel],
  );

  const canSubmit = selectedProject !== null && idea.trim().length > 0;

  const handleSubmit = () => {
    if (selectedProject === null || !canSubmit) return;
    props.onSubmit({
      projectId: selectedProject.value,
      idea: idea.trim(),
      instanceId: activeInstanceId,
      model: activeModel,
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New WorkOrder</DialogTitle>
          <DialogDescription>
            Pick a project, describe the idea, and choose the default provider and model for the
            Planning Session.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="workorder-project">Project</Label>
            <Combobox
              items={pickerItems}
              itemToStringLabel={(item) => item.label}
              isItemEqualToValue={(a, b) => a.value === b.value}
              value={selectedProject}
              onValueChange={(item) => {
                setProjectId(item?.value ?? null);
              }}
            >
              <ComboboxTrigger
                id="workorder-project"
                render={<Button variant="outline" className="w-full justify-between" />}
              >
                {selectedProject?.label ?? "Choose a project"}
              </ComboboxTrigger>
              <ComboboxPopup className="w-(--trigger-width)">
                <ComboboxSearchInput placeholder="Search projects…" />
                <ComboboxEmpty>No matching projects.</ComboboxEmpty>
                <ComboboxList>
                  {(item: ProjectPickerItem) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="workorder-idea">Idea</Label>
            <Textarea
              id="workorder-idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="What should this WorkOrder accomplish?"
              className="min-h-28"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Default provider and model</Label>
            <ProviderModelPicker
              environmentId={props.environmentId}
              activeInstanceId={activeInstanceId}
              model={activeModel}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={modelOptionsByInstance}
              lockedProvider={null}
              onInstanceModelChange={(instanceId, model) => setSelection({ instanceId, model })}
              disabled={instanceEntries.length === 0}
            />
          </div>
          {props.error ? <p className="text-destructive text-sm">{props.error}</p> : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || props.isSubmitting} onClick={handleSubmit}>
            {props.isSubmitting ? "Creating…" : "Create WorkOrder"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
