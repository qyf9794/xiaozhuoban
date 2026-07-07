import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBrowserSpeechWakeWordEngine,
  type LocalWakeWordDetection,
  type LocalWakeWordStatus
} from "../assistant/localWakeWord";
import type { AssistantDiagnosticEvent } from "../assistant/assistantDiagnostics";

export const LOCAL_WAKE_WORD_STORAGE_KEY = "xiaozhuoban.localWakeWord.enabled";

export function readLocalWakeWordEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOCAL_WAKE_WORD_STORAGE_KEY) === "true";
}

export function useLocalWakeWord({
  enabled,
  realtimeConnected,
  onWake,
  onDiagnostic
}: {
  enabled: boolean;
  realtimeConnected: boolean;
  onWake: (detection: LocalWakeWordDetection) => void | Promise<void>;
  onDiagnostic?: (event: AssistantDiagnosticEvent) => void;
}) {
  const [status, setStatus] = useState<LocalWakeWordStatus>("idle");
  const onWakeRef = useRef(onWake);
  const onDiagnosticRef = useRef(onDiagnostic);

  onWakeRef.current = onWake;
  onDiagnosticRef.current = onDiagnostic;

  const engine = useMemo(
    () =>
      createBrowserSpeechWakeWordEngine({
        onWake: (detection) => {
          onDiagnosticRef.current?.({
            type: "local_wake_word.detected",
            status: "success",
            data: { wakeWord: detection.wakeWord, command: detection.command }
          });
          void onWakeRef.current(detection);
        },
        onStatusChange: (nextStatus) => {
          setStatus(nextStatus);
          onDiagnosticRef.current?.({ type: "local_wake_word.status", status: nextStatus });
        }
      }),
    []
  );

  useEffect(() => {
    if (!enabled || realtimeConnected) {
      engine.stop();
      return;
    }
    engine.start();
    return () => engine.stop();
  }, [enabled, engine, realtimeConnected]);

  return {
    status: engine.isSupported() ? status : "unsupported",
    supported: engine.isSupported()
  };
}
