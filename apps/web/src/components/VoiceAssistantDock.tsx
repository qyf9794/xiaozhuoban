import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AssistantHarness } from "../assistant/AssistantHarness";
import type { RealtimeConnectionStatus } from "../assistant/openaiRealtimeAdapter";

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
  if (status === "connected") return "listening";
  if (status === "failed" || status === "microphone_denied") return "error";
  return "disconnected";
}

export function getVoiceAssistantConnectionMessage(status: RealtimeConnectionStatus): string {
  if (status === "connecting") return "正在连接 gpt-realtime-2。";
  if (status === "connected") return "语音已连接，可以直接说话。";
  if (status === "microphone_denied") return MICROPHONE_PERMISSION_MESSAGE;
  if (status === "failed") return "语音连接失败，请稍后重试。";
  return "语音未连接，文字指令可用。";
}

export function getVoiceAssistantErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "OPENAI_API_KEY_MISSING") return "后端缺少 OPENAI_API_KEY，配置后再连接。";
  if (message === "MICROPHONE_DENIED") return MICROPHONE_PERMISSION_MESSAGE;
  if (message === "REALTIME_CLIENT_SECRET_MISSING") return "Realtime 临时密钥缺失。";
  if (message === "REALTIME_SDP_FAILED") return "Realtime 语音通道连接失败。";
  if (message === "REALTIME_SESSION_FAILED") return "Realtime 会话创建失败。";
  return message || "语音连接失败";
}

export interface VoiceAssistantHistoryItem {
  id: string;
  text: string;
  result: string;
  route: string;
}

export function prependVoiceAssistantHistory(
  history: VoiceAssistantHistoryItem[],
  item: VoiceAssistantHistoryItem,
  maxItems = 4
): VoiceAssistantHistoryItem[] {
  return [item, ...history].slice(0, Math.max(1, maxItems));
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
  onDisconnectVoice,
  isMobileMode = false,
  mobileVisible = true,
  desktopBottomInset = 14
}: {
  harness: AssistantHarness;
  voiceStatus?: RealtimeConnectionStatus;
  onConnectVoice?: () => Promise<void>;
  onDisconnectVoice?: () => void;
  isMobileMode?: boolean;
  mobileVisible?: boolean;
  desktopBottomInset?: number;
}) {
  const [state, setState] = useState<VoiceAssistantDockState>("disconnected");
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState("");
  const [lastMessage, setLastMessage] = useState("好了，我在。");
  const [history, setHistory] = useState<VoiceAssistantHistoryItem[]>([]);
  const initializedRef = useRef(false);
  const voiceEnabled = Boolean(onConnectVoice);

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

  const pending = harness.getPendingConfirmation();
  const visualState = muted ? "muted" : pending ? "waiting_confirmation" : state;

  const runCommand = async (command: string) => {
    const input = command.trim();
    if (!input || muted) return;
    setState("thinking");
    try {
      const response = await harness.handleUserInput(input);
      setState(response.result.status === "needs_confirmation" ? "waiting_confirmation" : "executing");
      const resultText = getResultText(response.result.status, response.result.message);
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
      setLastMessage(error instanceof Error ? error.message : "助手执行失败");
      setState("error");
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const input = text;
    setText("");
    void runCommand(input);
  };

  const confirm = () => {
    void runCommand("确认");
  };

  const cancel = () => {
    void runCommand("取消");
  };

  const connectVoice = async () => {
    if (!onConnectVoice || muted) return;
    setState("connecting");
    setLastMessage(getVoiceAssistantConnectionMessage("connecting"));
    try {
      await onConnectVoice();
    } catch (error) {
      setLastMessage(getVoiceAssistantErrorMessage(error));
      setState("error");
    }
  };

  const disconnectVoice = () => {
    onDisconnectVoice?.();
    setState("disconnected");
    setLastMessage(getVoiceAssistantConnectionMessage("disconnected"));
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

      {voiceEnabled ? (
        <div className="voice-assistant-dock__voice">
          {voiceStatus === "connected" ? (
            <button type="button" onClick={disconnectVoice} disabled={muted} aria-label="断开语音">
              断开语音
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void connectVoice()}
              disabled={muted || voiceStatus === "connecting"}
              aria-label="连接语音"
            >
              连接语音
            </button>
          )}
        </div>
      ) : null}

      <form className="voice-assistant-dock__form" onSubmit={onSubmit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="说一句指令"
          disabled={muted}
          aria-label="助手指令"
        />
        <button type="submit" disabled={muted || !text.trim()} aria-label="发送指令">
          ↵
        </button>
      </form>

      {pending ? (
        <div className="voice-assistant-dock__confirm">
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
