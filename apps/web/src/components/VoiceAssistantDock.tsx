import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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

export function shouldUseRealtimeTextCommand(
  voiceStatus: RealtimeConnectionStatus,
  hasRealtimeTextSender: boolean,
  hasPendingConfirmation: boolean
): boolean {
  return voiceStatus === "connected" && hasRealtimeTextSender && !hasPendingConfirmation;
}

export function getVisibleVoiceAssistantOperation(
  internalOperation: VoiceAssistantOperationStatus,
  externalOperation?: VoiceAssistantOperationStatus | null
): VoiceAssistantOperationStatus {
  return externalOperation ?? internalOperation;
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
  onConnectVoice,
  onConnectTextOnly,
  onDisconnectVoice,
  isMobileMode = false,
  mobileVisible = true,
  desktopBottomInset = 14,
  operationStatus,
  runtimeStatus,
  syncPendingCount = 0,
  syncLastError,
  onRetrySync,
  onCommandRoute,
  onSendRealtimeTextCommand,
  onDiagnostic
}: {
  harness: AssistantHarness;
  voiceStatus?: RealtimeConnectionStatus;
  onConnectVoice?: () => Promise<void>;
  onConnectTextOnly?: () => Promise<void>;
  onDisconnectVoice?: () => void;
  isMobileMode?: boolean;
  mobileVisible?: boolean;
  desktopBottomInset?: number;
  operationStatus?: VoiceAssistantOperationStatus | null;
  runtimeStatus?: string | null;
  syncPendingCount?: number;
  syncLastError?: string;
  onRetrySync?: () => Promise<void> | void;
  onCommandRoute?: (route: AssistantRoute) => void;
  onSendRealtimeTextCommand?: (input: string, options?: { commandTraceId?: string }) => Promise<void>;
  onDiagnostic?: (event: AssistantDiagnosticEvent) => void;
}) {
  const [state, setState] = useState<VoiceAssistantDockState>("disconnected");
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState("");
  const [lastMessage, setLastMessage] = useState("好了，我在。");
  const [history, setHistory] = useState<VoiceAssistantHistoryItem[]>([]);
  const [operation, setOperation] = useState<VoiceAssistantOperationStatus>({ phase: "idle" });
  const [connectionMode, setConnectionMode] = useState<"audio" | "text" | null>(null);
  const initializedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const voiceEnabled = Boolean(onConnectVoice || onConnectTextOnly);

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
    if (voiceStatus === "disconnected" || voiceStatus === "failed" || voiceStatus === "session_failed") {
      setConnectionMode(null);
    }
    setState(getVoiceAssistantDockStateForRealtimeStatus(voiceStatus));
    setLastMessage(getVoiceAssistantConnectionMessage(voiceStatus));
  }, [voiceEnabled, voiceStatus]);

  const pending = harness.getPendingConfirmation();
  const visualState = muted ? "muted" : pending ? "waiting_confirmation" : state;
  const visibleOperation = getVisibleVoiceAssistantOperation(operation, operationStatus);
  const useRealtimeText = shouldUseRealtimeTextCommand(voiceStatus, Boolean(onSendRealtimeTextCommand), Boolean(pending));

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
    if (useRealtimeText) {
      void sendRealtimeCommand(input);
    } else {
      void runCommand(input);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitCurrentCommand();
  };

  const onCommandKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
      setConnectionMode("audio");
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
      setConnectionMode("text");
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
    setConnectionMode(null);
    setState("disconnected");
    setLastMessage(getVoiceAssistantConnectionMessage("disconnected"));
    setOperation({ phase: "idle" });
  };

  return (
    <aside
      className={`voice-assistant-dock liquid-glass-preserve${isMobileMode ? " voice-assistant-dock-mobile" : ""}`}
      aria-label="语音助手"
      style={{
        bottom: isMobileMode ? "calc(env(safe-area-inset-bottom) + 12px)" : desktopBottomInset + 36,
        opacity: isMobileMode ? (mobileVisible ? 1 : 0) : 1,
        pointerEvents: isMobileMode && !mobileVisible ? "none" : "auto",
        transform: isMobileMode
          ? `translateX(-50%) translateY(${mobileVisible ? "0" : "calc(100% + 18px)"})`
          : undefined
      }}
      data-testid="voice-assistant-dock"
    >
      <div className="voice-assistant-dock__top">
        <button
          type="button"
          className={`voice-assistant-dock__orb is-${visualState}`}
          aria-label={muted ? "取消静音" : "静音助手"}
          onClick={() => setMuted((prev) => !prev)}
        >
          {muted ? "×" : "●"}
        </button>
        <div className="voice-assistant-dock__copy">
          <strong>{getVoiceAssistantDockStatusText(visualState)}</strong>
          <span>{lastMessage}</span>
        </div>
      </div>

      <div
        className={`voice-assistant-dock__operation is-${visibleOperation.phase}`}
        aria-live="polite"
        data-testid="voice-assistant-operation"
      >
        <span>{getVoiceAssistantOperationText(visibleOperation)}</span>
      </div>

      {runtimeStatus ? (
        <div className="voice-assistant-dock__runtime" data-testid="voice-assistant-runtime">
          <span>{getVoiceAssistantRuntimeText(runtimeStatus, syncPendingCount, syncLastError)}</span>
          {syncPendingCount > 0 && onRetrySync ? (
            <button type="button" onClick={() => void onRetrySync()}>
              重试
            </button>
          ) : null}
        </div>
      ) : null}

      {voiceEnabled ? (
        <div className="voice-assistant-dock__voice">
          {voiceStatus === "connected" || voiceStatus === "configuring" ? (
            <button type="button" onClick={disconnectVoice} disabled={muted} aria-label="断开 Realtime">
              {connectionMode === "text" ? "断开文字" : "断开语音"}
            </button>
          ) : (
            <>
              {onConnectVoice ? (
                <button
                  type="button"
                  onClick={() => void connectVoice()}
                  disabled={muted || voiceStatus === "connecting"}
                  aria-label="连接语音"
                >
                  连接语音
                </button>
              ) : null}
              {onConnectTextOnly ? (
                <button
                  type="button"
                  onClick={() => void connectTextOnly()}
                  disabled={muted || voiceStatus === "connecting"}
                  aria-label="连接文字 Realtime"
                >
                  文字 Realtime
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <form className="voice-assistant-dock__form" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onInput={(event) => setText(event.currentTarget.value)}
          onKeyDown={onCommandKeyDown}
          placeholder="说一句指令"
          disabled={muted}
          aria-label="助手指令"
          data-testid="voice-assistant-command-input"
        />
        <button type="submit" disabled={shouldDisableVoiceAssistantSend(muted)} aria-label="发送指令" data-testid="voice-assistant-send">
          ↵
        </button>
      </form>

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

      {history.length > 0 ? (
        <div className="voice-assistant-dock__history" aria-label="助手命令记录">
          {history.map((item) => (
            <div key={item.id} className="voice-assistant-dock__history-row">
              <span>{item.text}</span>
              <small>{item.result}</small>
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
