import type { AssistantOperationEvent } from "./AssistantHarness";

export type AssistantOperationDisplayPhase = "executing" | "waiting_confirmation" | "success" | "error";

export interface AssistantOperationDisplayStatus {
  phase: AssistantOperationDisplayPhase;
  command?: string;
  message?: string;
}

export interface AssistantOperationSnapshot {
  active: AssistantOperationEvent[];
  last?: AssistantOperationEvent;
}

function isActiveOperation(event: AssistantOperationEvent): boolean {
  return event.phase === "running" || event.phase === "waiting_confirmation";
}

function getDisplayPhase(event: AssistantOperationEvent): AssistantOperationDisplayPhase {
  if (event.phase === "running") return "executing";
  if (event.phase === "waiting_confirmation") return "waiting_confirmation";
  if (event.phase === "success") return "success";
  return "error";
}

function getOperationName(event: AssistantOperationEvent): string {
  return event.toolName ?? event.id;
}

export function updateAssistantOperationSnapshot(
  snapshot: AssistantOperationSnapshot,
  event: AssistantOperationEvent
): AssistantOperationSnapshot {
  const activeWithoutEvent = snapshot.active.filter((item) => item.id !== event.id);
  return {
    active: isActiveOperation(event) ? [...activeWithoutEvent, event] : activeWithoutEvent,
    last: event
  };
}

export function clearAssistantTerminalOperation(
  snapshot: AssistantOperationSnapshot,
  operationId: string
): AssistantOperationSnapshot {
  if (snapshot.active.length > 0 || snapshot.last?.id !== operationId || isActiveOperation(snapshot.last)) {
    return snapshot;
  }
  return { active: [] };
}

export function getAssistantOperationStatus(
  snapshot: AssistantOperationSnapshot
): AssistantOperationDisplayStatus | null {
  if (snapshot.active.length === 0) {
    if (!snapshot.last) return null;
    return {
      phase: getDisplayPhase(snapshot.last),
      command: snapshot.last.toolName,
      message: snapshot.last.message
    };
  }

  if (snapshot.active.length === 1) {
    const [event] = snapshot.active;
    return {
      phase: getDisplayPhase(event),
      command: event.toolName,
      message: event.message
    };
  }

  const names = snapshot.active.map(getOperationName);
  const visibleNames = names.slice(0, 3).join("、");
  const suffix = names.length > 3 ? `等 ${names.length} 项` : "";
  return {
    phase: snapshot.active.some((event) => event.phase === "waiting_confirmation") ? "waiting_confirmation" : "executing",
    command: `${snapshot.active.length} 项工具：${visibleNames}${suffix}`
  };
}
