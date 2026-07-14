import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBrowserSpeechWakeWordEngine,
  resolveLocalWakeWordAudioLevel,
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
  const [audioLevel, setAudioLevel] = useState(0);
  const onWakeRef = useRef(onWake);
  const onDiagnosticRef = useRef(onDiagnostic);
  const lastDiagnosticStatusRef = useRef<LocalWakeWordStatus | null>(null);
  const stopAudioMonitorRef = useRef<() => void>(() => undefined);

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
          stopAudioMonitorRef.current();
          void onWakeRef.current(detection);
        },
        onStatusChange: (nextStatus, detail) => {
          setStatus((currentStatus) => (currentStatus === nextStatus ? currentStatus : nextStatus));
          if (lastDiagnosticStatusRef.current === nextStatus) return;
          lastDiagnosticStatusRef.current = nextStatus;
          onDiagnosticRef.current?.({
            type: "local_wake_word.status",
            status: nextStatus,
            errorCode: detail?.error,
            data: detail?.error ? { error: detail.error } : undefined
          });
        }
      }),
    []
  );

  useEffect(() => {
    if (!enabled || realtimeConnected) {
      engine.stop();
      setAudioLevel(0);
      return;
    }
    engine.start();
    return () => engine.stop();
  }, [enabled, engine, realtimeConnected]);

  useEffect(() => {
    if (!enabled || realtimeConnected || !engine.isSupported()) {
      setAudioLevel(0);
      return;
    }
    let cancelled = false;
    let animationFrameId: number | null = null;
    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    const stopAudioMonitor = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      source?.disconnect();
      source = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      void audioContext?.close();
      audioContext = null;
      setAudioLevel(0);
    };
    stopAudioMonitorRef.current = stopAudioMonitor;

    const startAudioMonitor = async () => {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!navigator.mediaDevices?.getUserMedia || !AudioContextCtor) {
        onDiagnosticRef.current?.({
          type: "local_wake_word.audio_monitor",
          status: "failed",
          message: "LOCAL_WAKE_AUDIO_MONITOR_UNAVAILABLE"
        });
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        if (cancelled) {
          stopAudioMonitor();
          return;
        }
        audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(samples);
          setAudioLevel(resolveLocalWakeWordAudioLevel(samples));
          animationFrameId = window.requestAnimationFrame(tick);
        };
        tick();
      } catch (error) {
        if (!cancelled) {
          onDiagnosticRef.current?.({
            type: "local_wake_word.audio_monitor",
            status: "failed",
            message: error instanceof Error ? error.message : "LOCAL_WAKE_AUDIO_MONITOR_FAILED"
          });
        }
        stopAudioMonitor();
      }
    };

    void startAudioMonitor();
    return () => {
      cancelled = true;
      stopAudioMonitor();
      if (stopAudioMonitorRef.current === stopAudioMonitor) {
        stopAudioMonitorRef.current = () => undefined;
      }
    };
  }, [enabled, engine, realtimeConnected]);

  return {
    audioLevel,
    status: engine.isSupported() ? status : "unsupported",
    supported: engine.isSupported()
  };
}
