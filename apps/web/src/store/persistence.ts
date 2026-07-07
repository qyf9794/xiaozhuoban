import { enqueueAssistantCloudMutation, type AssistantCloudMutation } from "../assistant/assistantOutbox";

export function persistInBackground(
  task: Promise<void>,
  label: string,
  mutation?: AssistantCloudMutation,
  operationId?: string
) {
  void task.catch((error) => {
    console.error(`[store] ${label} failed`, error);
    if (mutation) {
      void enqueueAssistantCloudMutation(mutation, operationId);
    }
  });
}
