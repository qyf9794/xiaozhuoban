import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AppRepository } from "@xiaozhuoban/data";
import type { AssistantRuntimeMode, RealtimeBudgetMetrics } from "@xiaozhuoban/assistant-core";
import {
  createRealtimeAssistantRuntime,
  shouldFallbackUnhandledVoiceTranscriptToHarness
} from "../assistant/createRealtimeAssistantRuntime";
import {
  recordAuthenticatedAssistantDiagnostic,
  type AssistantDiagnosticEvent
} from "../assistant/assistantDiagnostics";
import {
  clearAssistantTerminalOperation,
  getAssistantOperationStatus,
  updateAssistantOperationSnapshot,
  type AssistantOperationSnapshot
} from "../assistant/assistantOperationStatus";
import { getAssistantOutboxStatus, retryAssistantOutbox } from "../assistant/assistantOutbox";
import type { RealtimeConnectionStatus } from "../assistant/openaiRealtimeAdapter";
import { WidgetCapabilityBridge } from "../assistant/widgetCapabilityBridge";
import { useAuthStore } from "../auth/authStore";
import type { VoiceAssistantOperationStatus } from "../components/VoiceAssistantDock";

const ASSISTANT_TERMINAL_OPERATION_VISIBLE_MS = 8000;
const REALTIME_HIGH_ACCURACY_STORAGE_KEY = "xiaozhuoban.realtime.highAccuracy";

function getAssistantSpeechTextFromDiagnostic(event: AssistantDiagnosticEvent): string {
  if (event.type !== "realtime.voice.assistant_transcript" || event.status !== "success") return "";
  const transcript = event.data?.transcript;
  return typeof transcript === "string" ? transcript.trim() : "";
}

function getUserSpeechTextFromDiagnostic(event: AssistantDiagnosticEvent): string {
  if (event.type !== "realtime.voice.user_transcript" || event.status !== "success") return "";
  const transcript = event.data?.transcript;
  return typeof transcript === "string" ? transcript.trim() : "";
}

function isUnsupportedToolRealtimeReply(text: string): boolean {
  return /(没有|缺少|无法|不能).{0,16}(工具|音乐|播放|播放器|电视|频道|打开|执行)/.test(text);
}

function getAssistantRuntimeText(status: { mode: AssistantRuntimeMode; metrics: RealtimeBudgetMetrics } | null) {
  if (!status) return "本地待机 · Realtime 按需连接";
  const activeSeconds = Math.round(status.metrics.realtimeActiveMs / 1000);
  return `${status.mode} · Realtime ${activeSeconds}s · $${status.metrics.estimatedCostUsd.toFixed(4)}`;
}

function readRealtimeHighAccuracyMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REALTIME_HIGH_ACCURACY_STORAGE_KEY) === "true";
}

interface UseAssistantRuntimeControllerOptions {
  fullscreen: boolean;
  onOpenAiDialog: (prompt?: string) => void;
  onOpenCommandPalette: (query?: string) => void;
  onOpenSettings: () => void;
  onOpenWallpaperPicker: () => void;
  setFullscreen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  sidebarOpen: boolean;
}

export function useAssistantRuntimeController({
  fullscreen,
  onOpenAiDialog,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenWallpaperPicker,
  setFullscreen,
  setSidebarOpen,
  sidebarOpen
}: UseAssistantRuntimeControllerOptions) {
  const [realtimeHighAccuracyMode, setRealtimeHighAccuracyMode] = useState(readRealtimeHighAccuracyMode);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>("disconnected");
  const [realtimeAudioLevel, setRealtimeAudioLevel] = useState(0);
  const [assistantRuntimeBudget, setAssistantRuntimeBudget] = useState<{
    mode: AssistantRuntimeMode;
    metrics: RealtimeBudgetMetrics;
  } | null>(null);
  const [assistantOutboxStatus, setAssistantOutboxStatus] = useState<{ pendingCount: number; lastError?: string }>({
    pendingCount: 0
  });
  const [assistantOperationSnapshot, setAssistantOperationSnapshot] = useState<AssistantOperationSnapshot>({
    active: []
  });
  const [assistantSpeech, setAssistantSpeech] = useState<{ id: number; text: string } | null>(null);
  const [userSpeech, setUserSpeech] = useState<{ id: number; text: string } | null>(null);
  const assistantOperation: VoiceAssistantOperationStatus | null = useMemo(
    () => getAssistantOperationStatus(assistantOperationSnapshot),
    [assistantOperationSnapshot]
  );
  const assistantOperationClearTimerRef = useRef<number | null>(null);
  const assistantSpeechEventIdRef = useRef(0);
  const userSpeechEventIdRef = useRef(0);
  const lastCommandLikeUserSpeechRef = useRef("");
  const realtimeHighAccuracyModeRef = useRef(realtimeHighAccuracyMode);
  const assistantCapabilityBridgeRef = useRef(new WidgetCapabilityBridge());
  const sidebarOpenRef = useRef(sidebarOpen);
  const fullscreenRef = useRef(fullscreen);

  sidebarOpenRef.current = sidebarOpen;
  fullscreenRef.current = fullscreen;
  realtimeHighAccuracyModeRef.current = realtimeHighAccuracyMode;

  const recordDiagnostic = (event: AssistantDiagnosticEvent) => {
    const assistantSpeechText = getAssistantSpeechTextFromDiagnostic(event);
    if (assistantSpeechText) {
      const shouldSuppressUnsupportedReply =
        lastCommandLikeUserSpeechRef.current &&
        shouldFallbackUnhandledVoiceTranscriptToHarness(lastCommandLikeUserSpeechRef.current) &&
        isUnsupportedToolRealtimeReply(assistantSpeechText);
      if (!shouldSuppressUnsupportedReply) {
        assistantSpeechEventIdRef.current += 1;
        setAssistantSpeech({ id: assistantSpeechEventIdRef.current, text: assistantSpeechText });
      }
    }
    const userSpeechText = getUserSpeechTextFromDiagnostic(event);
    if (userSpeechText) {
      userSpeechEventIdRef.current += 1;
      setUserSpeech({ id: userSpeechEventIdRef.current, text: userSpeechText });
      if (shouldFallbackUnhandledVoiceTranscriptToHarness(userSpeechText)) {
        lastCommandLikeUserSpeechRef.current = userSpeechText;
      }
    }
    recordAuthenticatedAssistantDiagnostic(event);
  };

  const assistantRuntime = useMemo(
    () =>
      createRealtimeAssistantRuntime({
        capabilityBridge: assistantCapabilityBridgeRef.current,
        appShellBridge: {
          getSidebarOpen: () => sidebarOpenRef.current,
          setSidebarOpen: (open) => setSidebarOpen(open),
          getFullscreen: () => fullscreenRef.current,
          setFullscreen: async (enabled) => {
            if (enabled && !document.fullscreenElement) {
              await document.documentElement.requestFullscreen();
              return;
            }
            if (!enabled && document.fullscreenElement) {
              await document.exitFullscreen();
              return;
            }
            setFullscreen(enabled);
          },
          openSettings: onOpenSettings,
          openCommandPalette: onOpenCommandPalette,
          openAiDialog: onOpenAiDialog,
          openWallpaperPicker: onOpenWallpaperPicker
        },
        adapterOptions: {
          getAccessToken: () => useAuthStore.getState().session?.access_token,
          getHighAccuracyMode: () => realtimeHighAccuracyModeRef.current,
          onMicrophoneLevel: setRealtimeAudioLevel,
          onDiagnostic: recordDiagnostic
        },
        onStatusChange: (status) => {
          setRealtimeStatus(status);
          recordDiagnostic({ type: "voice.status", status });
        },
        onRuntimeBudgetChange: setAssistantRuntimeBudget,
        onOperation: (event) => {
          recordDiagnostic({
            type: "assistant.operation",
            commandTraceId: event.commandTraceId,
            status: event.phase,
            operationId: event.id,
            route: event.route,
            toolName: event.toolName,
            message: event.message
          });
          setAssistantOperationSnapshot((snapshot) => updateAssistantOperationSnapshot(snapshot, event));
          if (event.phase !== "running" && event.phase !== "waiting_confirmation") {
            if (assistantOperationClearTimerRef.current !== null) {
              window.clearTimeout(assistantOperationClearTimerRef.current);
            }
            assistantOperationClearTimerRef.current = window.setTimeout(() => {
              setAssistantOperationSnapshot((snapshot) => clearAssistantTerminalOperation(snapshot, event.id));
              assistantOperationClearTimerRef.current = null;
            }, ASSISTANT_TERMINAL_OPERATION_VISIBLE_MS);
          }
        }
      }),
    []
  );

  useEffect(() => {
    window.localStorage.setItem(REALTIME_HIGH_ACCURACY_STORAGE_KEY, realtimeHighAccuracyMode ? "true" : "false");
  }, [realtimeHighAccuracyMode]);

  useEffect(
    () => () => {
      assistantRuntime.disconnect();
      if (assistantOperationClearTimerRef.current !== null) {
        window.clearTimeout(assistantOperationClearTimerRef.current);
      }
    },
    [assistantRuntime]
  );

  useEffect(() => {
    const refresh = () => {
      void getAssistantOutboxStatus().then(setAssistantOutboxStatus);
    };
    refresh();
    globalThis.addEventListener?.("xiaozhuoban-assistant-outbox", refresh);
    return () => globalThis.removeEventListener?.("xiaozhuoban-assistant-outbox", refresh);
  }, []);

  const retrySync = async (repository: AppRepository) => {
    await retryAssistantOutbox(repository);
    setAssistantOutboxStatus(await getAssistantOutboxStatus());
  };

  return {
    assistantCapabilityBridge: assistantCapabilityBridgeRef.current,
    assistantOperation,
    assistantRuntime,
    assistantSpeech,
    realtimeAudioLevel,
    realtimeHighAccuracyMode,
    realtimeStatus,
    recordDiagnostic,
    retrySync,
    runtimeStatusText: getAssistantRuntimeText(assistantRuntimeBudget),
    setRealtimeHighAccuracyMode,
    syncLastError: assistantOutboxStatus.lastError,
    syncPendingCount: assistantOutboxStatus.pendingCount,
    userSpeech
  };
}
