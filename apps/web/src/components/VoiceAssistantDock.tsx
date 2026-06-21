import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { AssistantHarness, AssistantRoute } from "../assistant/AssistantHarness";
import { publishAssistantHarnessDiagnostics, type AssistantDiagnosticEvent } from "../assistant/assistantDiagnostics";
import type { RealtimeConnectionStatus } from "../assistant/openaiRealtimeAdapter";
import type { ConfirmationRequest } from "@xiaozhuoban/assistant-core";

export type VoiceAssistantDockState =
  | "disconnected"
  | "connecting"
  | "listening"
  | "thinking"
  | "executing"
  | "waiting_confirmation"
  | "error"
  | "muted";

const MICROPHONE_PERMISSION_MESSAGE = "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。";
const MICROPHONE_UNAVAILABLE_MESSAGE = "没有检测到可用麦克风，或当前浏览器不支持录音。";
export function getVoiceAssistantDockStatusText(state: VoiceAssistantDockState): string {
  if (state === "connecting") return "连接中";
  if (state === "listening") return "聆听中";
  if (state === "thinking") return "理解中";
  if (state === "executing") return "执行中";
  if (state === "waiting_confirmation") return "待确认";
  if (state === "error") return "有错误";
  if (state === "muted") return "已静音";
  return "未连接";
}

export function getVoiceAssistantDockStateForRealtimeStatus(status: RealtimeConnectionStatus): VoiceAssistantDockState {
  if (status === "connecting") return "connecting";
  if (status === "configuring") return "connecting";
  if (status === "connected") return "listening";
  if (status === "failed" || status === "session_failed" || status === "microphone_denied" || status === "microphone_unavailable") {
    return "error";
  }
  return "disconnected";
}

export function getVoiceAssistantConnectionMessage(status: RealtimeConnectionStatus): string {
  if (status === "connecting") return "正在连接 gpt-realtime-2。";
  if (status === "configuring") return "正在应用语音会话配置。";
  if (status === "connected") return "语音已连接，可以直接说话。";
  if (status === "microphone_denied") return MICROPHONE_PERMISSION_MESSAGE;
  if (status === "microphone_unavailable") return MICROPHONE_UNAVAILABLE_MESSAGE;
  if (status === "session_failed") return "Realtime 会话配置未生效，请重试。";
  if (status === "failed") return "语音连接失败，请稍后重试。";
  return "语音未连接，文字指令可用。";
}

export function getVoiceAssistantErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENAI_API_KEY_MISSING") return "后端缺少 OPENAI_API_KEY，配置后再连接。";
  if (message.startsWith("OPENAI_REALTIME_SESSION_CREATE_FAILED")) {
    return `Realtime 会话创建失败：${message}`;
  }
  if (message === "MICROPHONE_DENIED") return MICROPHONE_PERMISSION_MESSAGE;
  if (message === "MICROPHONE_UNAVAILABLE") return MICROPHONE_UNAVAILABLE_MESSAGE;
  if (message === "REALTIME_CLIENT_SECRET_MISSING") return "Realtime 临时密钥缺失。";
  if (message === "REALTIME_SDP_FAILED") return "Realtime 语音通道连接失败。";
  if (message === "REALTIME_SESSION_FAILED") return "Realtime 会话创建失败。";
  if (message.startsWith("REALTIME_SESSION_UPDATE_FAILED")) return `Realtime 会话配置失败：${message}`;
  if (message === "REALTIME_SESSION_UPDATE_TIMEOUT") return "Realtime 会话配置未生效。";
  if (message === "REALTIME_TEXT_CHANNEL_NOT_READY") return "Realtime 文字通道还没准备好，请稍后重试。";
  if (message === "REALTIME_TEXT_COMMAND_EMPTY") return "请输入要交给 Realtime 的指令。";
  if (message === "REALTIME_TEXT_COMMAND_UNAVAILABLE") return "当前 Realtime 文字通道不可用。";
  if (message === "REALTIME_TEXT_ONLY_UNAVAILABLE") return "当前环境不支持文字 Realtime 连接。";
  return message || "语音连接失败";
}

export interface VoiceAssistantHistoryItem {
  id: string;
  text: string;
  result: string;
  route: string;
}

export type VoiceAssistantOperationPhase = "idle" | "thinking" | "executing" | "waiting_confirmation" | "success" | "error";

export interface VoiceAssistantOperationStatus {
  phase: VoiceAssistantOperationPhase;
  command?: string;
  message?: string;
}

export const VOICE_ASSISTANT_MOBILE_TEXT_PANEL_IDLE_MS = 5000;
export const VOICE_ASSISTANT_ORB_LONG_PRESS_MS = 520;

export function prependVoiceAssistantHistory(
  history: VoiceAssistantHistoryItem[],
  item: VoiceAssistantHistoryItem,
  maxItems = 4
): VoiceAssistantHistoryItem[] {
  return [item, ...history].slice(0, Math.max(1, maxItems));
}

export function getVoiceAssistantOperationText(operation: VoiceAssistantOperationStatus): string {
  if (operation.phase === "idle") return "待命";
  const command = operation.command ? `：${operation.command}` : "";
  if (operation.phase === "thinking") return `理解中${command}`;
  if (operation.phase === "executing") return `执行中${command}`;
  if (operation.phase === "waiting_confirmation") return `待确认${command}`;
  if (operation.phase === "success") return operation.message ? `完成：${operation.message}` : `已完成${command}`;
  return operation.message ? `失败：${operation.message}` : `失败${command}`;
}

export function getVoiceAssistantPanelAnswerText(
  assistantSpeechText: string | undefined,
  pendingMessage: string | undefined
): string {
  const speech = assistantSpeechText?.trim();
  if (speech) return speech;
  const pending = pendingMessage?.trim();
  if (pending) return pending;
  return "";
}

export function resolveVoiceAssistantSubmitText(stateText: string, inputValue: string | undefined): string {
  const stateValue = stateText.trim();
  if (stateValue) return stateValue;
  return inputValue?.trim() ?? "";
}

export function shouldSubmitVoiceAssistantOnKeyDown(event: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
}): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing
  );
}

export function shouldDisableVoiceAssistantSend(muted: boolean): boolean {
  return muted;
}

function clampVoiceAssistantAudioLevel(level: number | undefined): number {
  if (typeof level !== "number" || !Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(1, level));
}

export function getVoiceAssistantOrbScale(voiceStatus: RealtimeConnectionStatus, audioLevel: number | undefined): number {
  if (voiceStatus !== "connected") return 1;
  return 1 - clampVoiceAssistantAudioLevel(audioLevel) * 0.045;
}

export function getVoiceAssistantOrbColorMode(voiceStatus: RealtimeConnectionStatus): "mono" | "color" {
  return voiceStatus === "connected" ? "color" : "mono";
}

export function getVoiceAssistantDockTransform(
  isMobileMode: boolean,
  dragOffset: { x: number; y: number }
): string {
  return [
    isMobileMode ? "translateX(-50%)" : "",
    `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
  ]
    .filter(Boolean)
    .join(" ");
}

export function shouldShowVoiceAssistantTextPanel(
  isMobileMode: boolean,
  mobileTextPanelOpen: boolean,
  hasPendingConfirmation: boolean
): boolean {
  return !isMobileMode || mobileTextPanelOpen || hasPendingConfirmation;
}

export function shouldSuppressVoiceAssistantOrbClickAfterPress(longPressTriggered: boolean, moved: boolean): boolean {
  return longPressTriggered || moved;
}

export function shouldUseRealtimeTextCommand(
  voiceStatus: RealtimeConnectionStatus,
  hasRealtimeTextSender: boolean,
  hasPendingConfirmation: boolean,
  input?: string
): boolean {
  if (voiceStatus !== "connected" || !hasRealtimeTextSender) return false;
  if (!hasPendingConfirmation) return true;
  const normalized = input?.trim();
  if (!normalized) return false;
  return !/^(确认|确定|可以|同意|执行|取消|不用|不要|拒绝|算了)$/.test(normalized);
}

export function shouldUseRealtimeHarnessCommand(input: string): boolean {
  const normalized = input.trim();
  if (!normalized) return false;
  if (/^(在吗|你好|您好|hello|hi|嗨|你在吗)[？?。!！\s]*$/i.test(normalized)) return false;
  return /(播放|来个|来一首|想听|搜索|搜|查.*天气|天气|关闭|关掉|收起|打开|唤出|调出|整理|排列|对齐|全屏|侧栏|侧边栏|设置|命令面板|AI 生成|新闻|头条|行情|指数|翻译|换算|倒计时|计时|留言板|音乐|歌曲|时钟|表盘)/.test(
    normalized
  );
}

export function getVisibleVoiceAssistantOperation(
  internalOperation: VoiceAssistantOperationStatus,
  externalOperation?: VoiceAssistantOperationStatus | null
): VoiceAssistantOperationStatus {
  return externalOperation ?? internalOperation;
}

export function getVoiceAssistantOrbVisualMode(
  visualState: VoiceAssistantDockState,
  visibleOperation: VoiceAssistantOperationStatus,
  textPanelVisible: boolean
): "idle" | "listening" | "thinking" {
  const backgroundProcessing =
    !textPanelVisible &&
    (visualState === "thinking" ||
      visualState === "executing" ||
      visibleOperation.phase === "thinking" ||
      visibleOperation.phase === "executing");
  if (backgroundProcessing) return "thinking";
  if (visualState === "listening") return "listening";
  return "idle";
}

export function publishVoiceAssistantDiagnostics(snapshot: unknown): void {
  publishAssistantHarnessDiagnostics(snapshot);
}

export function getVoiceAssistantRuntimeText(runtimeStatus: string, syncPendingCount: number, syncLastError?: string): string {
  if (syncPendingCount <= 0) return runtimeStatus;
  return syncLastError
    ? `${runtimeStatus} · 待同步 ${syncPendingCount} · 最近失败：${syncLastError}`
    : `${runtimeStatus} · 待同步 ${syncPendingCount}`;
}

function createCommandTraceId(prefix = "cmd") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isPreviewRecord(value: unknown): value is {
  commands?: Array<{ module?: string; tool?: string; impact?: string; reversible?: boolean }>;
  recovery?: string;
} {
  return Boolean(value) && typeof value === "object";
}

export function getVoiceAssistantPreviewLines(pending?: ConfirmationRequest | null): string[] {
  if (!pending || !isPreviewRecord(pending.preview)) return [];
  const commandLines = (pending.preview.commands ?? []).slice(0, 4).map((command) => {
    const name = [command.module, command.tool].filter(Boolean).join(" / ");
    const reversible = command.reversible === false ? "不可撤销" : "可恢复";
    return [name, command.impact, reversible].filter(Boolean).join(" · ");
  });
  return [...commandLines, pending.preview.recovery ? `恢复策略：${pending.preview.recovery}` : ""].filter(Boolean);
}

function getResultText(status: string, message: string) {
  if (status === "success") return message || "好了";
  if (status === "needs_confirmation") return message || "请确认";
  if (status === "needs_clarification") return message || "再说短一点";
  if (status === "cancelled") return message || "已取消";
  if (status === "timed_out") return "执行超时";
  return message || "暂时做不了";
}

export function VoiceAssistantDock({
  harness,
  voiceStatus = "disconnected",
  voiceAudioLevel = 0,
  onConnectVoice,
  onConnectTextOnly,
  onDisconnectVoice,
  isMobileMode = false,
  desktopBottomInset = 14,
  operationStatus,
  runtimeStatus,
  syncPendingCount = 0,
  syncLastError,
  onRetrySync,
  onCommandRoute,
  onSendRealtimeTextCommand,
  assistantSpeech,
  onDiagnostic
}: {
  harness: AssistantHarness;
  voiceStatus?: RealtimeConnectionStatus;
  voiceAudioLevel?: number;
  onConnectVoice?: () => Promise<void>;
  onConnectTextOnly?: () => Promise<void>;
  onDisconnectVoice?: () => void;
  isMobileMode?: boolean;
  desktopBottomInset?: number;
  operationStatus?: VoiceAssistantOperationStatus | null;
  runtimeStatus?: string | null;
  syncPendingCount?: number;
  syncLastError?: string;
  onRetrySync?: () => Promise<void> | void;
  onCommandRoute?: (route: AssistantRoute) => void;
  onSendRealtimeTextCommand?: (input: string, options?: { commandTraceId?: string }) => Promise<void>;
  assistantSpeech?: { id: number; text: string } | null;
  onDiagnostic?: (event: AssistantDiagnosticEvent) => void;
}) {
  const [state, setState] = useState<VoiceAssistantDockState>("disconnected");
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState("");
  const [lastMessage, setLastMessage] = useState("好了，我在。");
  const [history, setHistory] = useState<VoiceAssistantHistoryItem[]>([]);
  const [operation, setOperation] = useState<VoiceAssistantOperationStatus>({ phase: "idle" });
  const initializedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const orbFrameRef = useRef<HTMLIFrameElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const mobileTextPanelCollapseTimerRef = useRef<number | null>(null);
  const orbLongPressTimerRef = useRef<number | null>(null);
  const assistantSpeechPulseFrameRef = useRef<number | null>(null);
  const orbLongPressTriggeredRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    baseLeft: number;
    baseRight: number;
    baseTop: number;
    baseBottom: number;
    moved: boolean;
  } | null>(null);
  const suppressOrbClickRef = useRef(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mobileTextPanelOpen, setMobileTextPanelOpen] = useState(false);
  const [assistantSpeechLevel, setAssistantSpeechLevel] = useState(0);
  const textRef = useRef("");
  const voiceEnabled = Boolean(onConnectVoice || onConnectTextOnly);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  const clearMobileTextPanelCollapseTimer = () => {
    if (mobileTextPanelCollapseTimerRef.current !== null) {
      window.clearTimeout(mobileTextPanelCollapseTimerRef.current);
      mobileTextPanelCollapseTimerRef.current = null;
    }
  };

  const scheduleMobileTextPanelCollapse = () => {
    if (!isMobileMode) return;
    clearMobileTextPanelCollapseTimer();
    mobileTextPanelCollapseTimerRef.current = window.setTimeout(() => {
      if (!harness.getPendingConfirmation() && !textRef.current.trim()) {
        setMobileTextPanelOpen(false);
      }
      mobileTextPanelCollapseTimerRef.current = null;
    }, VOICE_ASSISTANT_MOBILE_TEXT_PANEL_IDLE_MS);
  };

  const openMobileTextPanel = ({ focusInput = true }: { focusInput?: boolean } = {}) => {
    if (!isMobileMode) return;
    setMobileTextPanelOpen(true);
    scheduleMobileTextPanelCollapse();
    if (focusInput) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const keepMobileTextPanelOpen = () => {
    if (!isMobileMode) return;
    setMobileTextPanelOpen(true);
    scheduleMobileTextPanelCollapse();
  };

  const clearOrbLongPressTimer = () => {
    if (orbLongPressTimerRef.current !== null) {
      window.clearTimeout(orbLongPressTimerRef.current);
      orbLongPressTimerRef.current = null;
    }
  };

  const clearAssistantSpeechPulse = () => {
    if (assistantSpeechPulseFrameRef.current !== null) {
      window.cancelAnimationFrame(assistantSpeechPulseFrameRef.current);
      assistantSpeechPulseFrameRef.current = null;
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void harness
      .initialize()
      .then(() => {
        if (!voiceEnabled) {
          setState("listening");
        }
      })
      .catch((error) => {
        setLastMessage(error instanceof Error ? error.message : "助手连接失败");
        setState("error");
      });
  }, [harness, voiceEnabled]);

  useEffect(() => {
    if (!voiceEnabled) return;
    setState(getVoiceAssistantDockStateForRealtimeStatus(voiceStatus));
    setLastMessage(getVoiceAssistantConnectionMessage(voiceStatus));
  }, [voiceEnabled, voiceStatus]);

  useEffect(() => {
    if (isMobileMode) {
      setMobileTextPanelOpen(false);
      return;
    }
    clearMobileTextPanelCollapseTimer();
  }, [isMobileMode]);

  useEffect(() => {
    const speechText = assistantSpeech?.text.trim();
    if (!speechText) return;
    setLastMessage(speechText);
    clearAssistantSpeechPulse();
    const startedAt = performance.now();
    const duration = Math.min(1500, 560 + speechText.length * 18);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setAssistantSpeechLevel(0.62 * (1 - progress));
      if (progress < 1) {
        assistantSpeechPulseFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        assistantSpeechPulseFrameRef.current = null;
        setAssistantSpeechLevel(0);
      }
    };
    setAssistantSpeechLevel(0.62);
    assistantSpeechPulseFrameRef.current = window.requestAnimationFrame(tick);
    if (isMobileMode) {
      openMobileTextPanel({ focusInput: false });
    }
  }, [assistantSpeech?.id, assistantSpeech?.text, isMobileMode]);

  useEffect(() => {
    return () => {
      clearMobileTextPanelCollapseTimer();
      clearOrbLongPressTimer();
      clearAssistantSpeechPulse();
    };
  }, []);

  const pending = harness.getPendingConfirmation();
  const textPanelVisible = shouldShowVoiceAssistantTextPanel(isMobileMode, mobileTextPanelOpen, Boolean(pending));
  const visualState = muted ? "muted" : pending ? "waiting_confirmation" : state;
  const visibleOperation = getVisibleVoiceAssistantOperation(operation, operationStatus);
  const panelAnswerText = getVoiceAssistantPanelAnswerText(assistantSpeech?.text, pending?.message);
  const orbVisualMode = getVoiceAssistantOrbVisualMode(visualState, visibleOperation, textPanelVisible);
  const orbAudioLevel = clampVoiceAssistantAudioLevel(Math.max(voiceAudioLevel, assistantSpeechLevel));
  const orbColorMode = getVoiceAssistantOrbColorMode(voiceStatus);
  const orbScale = getVoiceAssistantOrbScale(voiceStatus, orbAudioLevel);

  useEffect(() => {
    orbFrameRef.current?.contentWindow?.postMessage(
      { type: "z1han-siri-orb-state", mode: orbVisualMode, audioLevel: orbAudioLevel, colorMode: orbColorMode },
      window.location.origin
    );
  }, [orbVisualMode, orbAudioLevel, orbColorMode]);

  const runCommand = async (command: string) => {
    const input = command.trim();
    if (!input || muted) return;
    const commandTraceId = createCommandTraceId();
    onDiagnostic?.({ type: "voice.text_command.submit", commandTraceId, status: "started", data: { input } });
    setState("thinking");
    setOperation({ phase: "thinking", command: input });
    try {
      const response = await harness.handleUserInput(input, { commandTraceId });
      publishVoiceAssistantDiagnostics(harness.getLastDiagnostics());
      onCommandRoute?.(response.route);
      const nextPhase = response.result.status === "needs_confirmation" ? "waiting_confirmation" : "executing";
      setState(nextPhase);
      const resultText = getResultText(response.result.status, response.result.message);
      setOperation({
        phase: response.result.status === "needs_confirmation" ? "waiting_confirmation" : "success",
        command: input,
        message: resultText
      });
      onDiagnostic?.({
        type: "voice.text_command.result",
        commandTraceId,
        status: response.result.status,
        route: response.route,
        toolName: response.call?.name,
        operationId: response.call?.id,
        message: response.result.message,
        errorCode: response.result.errorCode,
        data: { input }
      });
      setLastMessage(resultText);
      setHistory((prev) =>
        prependVoiceAssistantHistory(prev, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: input,
          result: resultText,
          route: response.route
        })
      );
      window.setTimeout(() => {
        if (!harness.getPendingConfirmation()) {
          setState("listening");
        }
      }, 320);
    } catch (error) {
      publishVoiceAssistantDiagnostics(harness.getLastDiagnostics());
      const message = error instanceof Error ? error.message : "助手执行失败";
      onDiagnostic?.({ type: "voice.text_command.error", commandTraceId, status: "failed", message, data: { input } });
      setLastMessage(message);
      setOperation({ phase: "error", command: input, message });
      setState("error");
    }
  };

  const sendRealtimeCommand = async (command: string) => {
    const input = command.trim();
    if (!input || muted || !onSendRealtimeTextCommand) return;
    const commandTraceId = createCommandTraceId("text_realtime");
    onDiagnostic?.({ type: "voice.realtime_text_command.submit", commandTraceId, status: "started", data: { input } });
    setState("thinking");
    setOperation({ phase: "thinking", command: input });
    try {
      if (shouldUseRealtimeHarnessCommand(input)) {
        const response = await harness.handleRealtimeUserInput(input, { commandTraceId });
        publishVoiceAssistantDiagnostics(harness.getLastDiagnostics());
        onCommandRoute?.(response.route);
        const resultText = getResultText(response.result.status, response.result.message);
        setLastMessage(resultText);
        setOperation({
          phase: response.result.status === "needs_confirmation" ? "waiting_confirmation" : response.result.status === "success" ? "success" : "error",
          command: input,
          message: resultText
        });
        setState(response.result.status === "needs_confirmation" ? "waiting_confirmation" : response.result.status === "success" ? "executing" : "error");
        setHistory((prev) =>
          prependVoiceAssistantHistory(prev, {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text: input,
            result: resultText,
            route: response.route
          })
        );
        onDiagnostic?.({
          type: "voice.realtime_text_command.result",
          commandTraceId,
          status: response.result.status,
          route: response.route,
          toolName: response.call?.name,
          operationId: response.call?.id,
          message: response.result.message,
          errorCode: response.result.errorCode,
          data: { input, execution: "harness" }
        });
        window.setTimeout(() => {
          if (!harness.getPendingConfirmation()) {
            setState("listening");
          }
        }, 320);
        return;
      }
      await onSendRealtimeTextCommand(input, { commandTraceId });
      const resultText = "已交给 Realtime 解析";
      setLastMessage(resultText);
      setOperation({ phase: "idle" });
      setHistory((prev) =>
        prependVoiceAssistantHistory(prev, {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: input,
          result: resultText,
          route: "realtime"
        })
      );
      onDiagnostic?.({ type: "voice.realtime_text_command.result", commandTraceId, status: "sent", data: { input } });
    } catch (error) {
      const message = getVoiceAssistantErrorMessage(error);
      onDiagnostic?.({ type: "voice.realtime_text_command.result", commandTraceId, status: "failed", message, data: { input } });
      setLastMessage(message);
      setOperation({ phase: "error", command: input, message });
      setState("error");
    }
  };

  const submitCurrentCommand = () => {
    const input = resolveVoiceAssistantSubmitText(text, inputRef.current?.value);
    setText("");
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (shouldUseRealtimeTextCommand(voiceStatus, Boolean(onSendRealtimeTextCommand), Boolean(pending), input)) {
      void sendRealtimeCommand(input);
    } else {
      void runCommand(input);
    }
    scheduleMobileTextPanelCollapse();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitCurrentCommand();
  };

  const onCommandKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    keepMobileTextPanelOpen();
    if (!shouldSubmitVoiceAssistantOnKeyDown(event)) return;
    event.preventDefault();
    submitCurrentCommand();
  };

  const confirm = () => {
    void runCommand("确认");
  };

  const cancel = () => {
    void runCommand("取消");
  };

  const connectVoice = async () => {
    if (!onConnectVoice || muted) return;
    const commandTraceId = createCommandTraceId("voice_connect");
    onDiagnostic?.({ type: "voice.connect.click", commandTraceId, status: "started" });
    setState("connecting");
    setLastMessage(getVoiceAssistantConnectionMessage("connecting"));
    setOperation({ phase: "thinking", command: "连接语音" });
    try {
      await onConnectVoice();
      setOperation({ phase: "success", command: "连接语音", message: "语音已连接" });
      onDiagnostic?.({ type: "voice.connect.result", commandTraceId, status: "success" });
    } catch (error) {
      const message = getVoiceAssistantErrorMessage(error);
      onDiagnostic?.({ type: "voice.connect.result", commandTraceId, status: "failed", message });
      setLastMessage(message);
      setOperation({ phase: "error", command: "连接语音", message });
      setState("error");
    }
  };

  const connectTextOnly = async () => {
    if (!onConnectTextOnly || muted) return;
    const commandTraceId = createCommandTraceId("text_realtime_connect");
    onDiagnostic?.({ type: "voice.text_realtime.connect.click", commandTraceId, status: "started" });
    setState("connecting");
    setLastMessage("正在连接文字 Realtime。");
    setOperation({ phase: "thinking", command: "连接文字 Realtime" });
    try {
      await onConnectTextOnly();
      setLastMessage("文字 Realtime 已连接，可直接输入指令。");
      setOperation({ phase: "success", command: "连接文字 Realtime", message: "文字 Realtime 已连接" });
      onDiagnostic?.({ type: "voice.text_realtime.connect.result", commandTraceId, status: "success" });
    } catch (error) {
      const message = getVoiceAssistantErrorMessage(error);
      onDiagnostic?.({ type: "voice.text_realtime.connect.result", commandTraceId, status: "failed", message });
      setLastMessage(message);
      setOperation({ phase: "error", command: "连接文字 Realtime", message });
      setState("error");
    }
  };

  const disconnectVoice = () => {
    onDiagnostic?.({ type: "voice.disconnect.click", commandTraceId: createCommandTraceId("voice_disconnect"), status: "started" });
    onDisconnectVoice?.();
    setState("disconnected");
    setLastMessage(getVoiceAssistantConnectionMessage("disconnected"));
    setOperation({ phase: "idle" });
  };

  const onOrbPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    clearOrbLongPressTimer();
    orbLongPressTriggeredRef.current = false;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
      baseLeft: rect.left - dragOffset.x,
      baseRight: rect.right - dragOffset.x,
      baseTop: rect.top - dragOffset.y,
      baseBottom: rect.bottom - dragOffset.y,
      moved: false
    };
    if (isMobileMode) {
      orbLongPressTimerRef.current = window.setTimeout(() => {
        orbLongPressTimerRef.current = null;
        orbLongPressTriggeredRef.current = true;
        suppressOrbClickRef.current = true;
        openMobileTextPanel();
      }, VOICE_ASSISTANT_ORB_LONG_PRESS_MS);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onOrbPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (orbLongPressTriggeredRef.current) return;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    clearOrbLongPressTimer();
    suppressOrbClickRef.current = true;
    const margin = 10;
    const minX = margin - drag.baseLeft;
    const maxX = window.innerWidth - margin - drag.baseRight;
    const minY = margin - drag.baseTop;
    const maxY = window.innerHeight - margin - drag.baseBottom;
    setDragOffset({
      x: Math.min(maxX, Math.max(minX, drag.originX + dx)),
      y: Math.min(maxY, Math.max(minY, drag.originY + dy))
    });
  };

  const onOrbPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const shouldSuppressClick = shouldSuppressVoiceAssistantOrbClickAfterPress(orbLongPressTriggeredRef.current, drag.moved);
      clearOrbLongPressTimer();
      dragRef.current = null;
      window.setTimeout(() => {
        if (shouldSuppressClick) {
          orbLongPressTriggeredRef.current = false;
        }
        suppressOrbClickRef.current = false;
      }, shouldSuppressClick ? 250 : 0);
    }
  };

  const onOrbClick = () => {
    if (suppressOrbClickRef.current) return;
    if (voiceStatus === "connected" || voiceStatus === "configuring") {
      disconnectVoice();
      return;
    }
    if (onConnectVoice) {
      void connectVoice();
      return;
    }
    if (onConnectTextOnly) {
      void connectTextOnly();
      return;
    }
    setMuted((prev) => !prev);
  };

  const dockTransform = getVoiceAssistantDockTransform(isMobileMode, dragOffset);
  const operationText = getVoiceAssistantOperationText(visibleOperation);
  const runtimeText = runtimeStatus ? getVoiceAssistantRuntimeText(runtimeStatus, syncPendingCount, syncLastError) : "";
  const statusLines = [
    `${getVoiceAssistantDockStatusText(visualState)} · ${lastMessage}`,
    operationText,
    runtimeText,
    history[0] ? `${history[0].text} · ${history[0].result}` : ""
  ].filter(Boolean);

  return (
    <aside
      ref={dockRef}
      className={`voice-assistant-dock liquid-glass-preserve${isMobileMode ? " voice-assistant-dock-mobile" : ""}`}
      aria-label="语音助手"
      style={{
        bottom: isMobileMode ? "calc(env(safe-area-inset-bottom) + 12px)" : desktopBottomInset + 36,
        opacity: 1,
        pointerEvents: "auto",
        transform: dockTransform
      }}
      data-text-panel-open={textPanelVisible ? "true" : "false"}
      data-voice-state={visualState}
      data-testid="voice-assistant-dock"
    >
      <div className="voice-assistant-dock__glass" data-text-panel-open={textPanelVisible ? "true" : "false"}>
        <button
          type="button"
          className={`voice-assistant-dock__orb is-${visualState}`}
          style={{ "--voice-orb-scale": orbScale } as CSSProperties}
          aria-label={voiceStatus === "connected" || voiceStatus === "configuring" ? "断开 Realtime" : "连接语音"}
          onPointerDown={onOrbPointerDown}
          onPointerMove={onOrbPointerMove}
          onPointerUp={onOrbPointerUp}
          onPointerCancel={onOrbPointerUp}
          onClick={onOrbClick}
        >
          <iframe
            ref={orbFrameRef}
            className="voice-assistant-dock__orb-frame"
            title="Siri glass orb shader"
            src="/vendor/z1han-siriai/orb.html"
            onLoad={() => {
              orbFrameRef.current?.contentWindow?.postMessage(
                { type: "z1han-siri-orb-state", mode: orbVisualMode, audioLevel: orbAudioLevel, colorMode: orbColorMode },
                window.location.origin
              );
            }}
            aria-hidden="true"
            tabIndex={-1}
          />
        </button>

        {textPanelVisible ? (
        <div
          className="voice-assistant-dock__pill"
          onPointerDown={keepMobileTextPanelOpen}
          onPointerMove={keepMobileTextPanelOpen}
          onFocusCapture={keepMobileTextPanelOpen}
        >
          <div className="voice-assistant-dock__answer" aria-live="polite">
            {panelAnswerText ? <p className="voice-assistant-dock__answer-text">{panelAnswerText}</p> : null}
            {pending ? (
              <div className="voice-assistant-dock__confirm">
                {getVoiceAssistantPreviewLines(pending).length > 0 ? (
                  <div className="voice-assistant-dock__preview" data-testid="voice-assistant-preview">
                    {getVoiceAssistantPreviewLines(pending).map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                ) : null}
                <button type="button" onClick={confirm}>
                  确认
                </button>
                <button type="button" onClick={cancel}>
                  取消
                </button>
              </div>
            ) : null}
          </div>

          <form className="voice-assistant-dock__form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                keepMobileTextPanelOpen();
              }}
              onInput={(event) => {
                setText(event.currentTarget.value);
                keepMobileTextPanelOpen();
              }}
              onKeyDown={onCommandKeyDown}
              placeholder=""
              disabled={muted}
              aria-label="助手指令"
              data-testid="voice-assistant-command-input"
            />
          </form>
        </div>
        ) : null}
      </div>

      {textPanelVisible ? (
      <div className="voice-assistant-dock__status-stream" aria-live="polite">
        <div className="voice-assistant-dock__status-track">
          {statusLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {statusLines.length > 1
            ? statusLines.map((line) => (
                <span key={`${line}_repeat`} aria-hidden="true">
                  {line}
                </span>
              ))
            : null}
        </div>
      </div>
      ) : null}

      <div className={`voice-assistant-dock__operation is-${visibleOperation.phase}`} data-testid="voice-assistant-operation" hidden>
        <span>{operationText}</span>
      </div>
      {runtimeStatus ? (
        <div className="voice-assistant-dock__runtime" data-testid="voice-assistant-runtime" hidden>
          <span>{runtimeText}</span>
          {syncPendingCount > 0 && onRetrySync ? (
            <button type="button" onClick={() => void onRetrySync()}>
              重试
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
