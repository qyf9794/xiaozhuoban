export type AssistantRuntimeMode =
  | "local_standby"
  | "local_wake_detected"
  | "realtime_connecting"
  | "realtime_command_window"
  | "realtime_dialogue_window"
  | "realtime_cooldown"
  | "saving_mode"
  | "hard_limited";

export interface RealtimeBudgetConfig {
  dailyBudgetUsd: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  commandWindowIdleMs: number;
  dialogueIdleMs: number;
  cooldownMs?: number;
  maxSingleCommandSessionMs: number;
  maxDialogueSessionMs: number;
  assistantAudioDailyLimitSeconds: number;
}

export interface RealtimeBudgetMetrics {
  realtimeActiveMs: number;
  estimatedUserAudioSeconds: number;
  estimatedAssistantAudioSeconds: number;
  textInputTokens: number;
  textOutputTokens: number;
  estimatedCostUsd: number;
  realtimeSessionCount: number;
  fallbackCount: number;
  localHitCount: number;
}

export const DEFAULT_REALTIME_BUDGET_CONFIG: RealtimeBudgetConfig = {
  dailyBudgetUsd: 1,
  softLimitUsd: 0.8,
  hardLimitUsd: 1,
  commandWindowIdleMs: 12_000,
  dialogueIdleMs: 45_000,
  cooldownMs: 8_000,
  maxSingleCommandSessionMs: 5 * 60_000,
  maxDialogueSessionMs: 15 * 60_000,
  assistantAudioDailyLimitSeconds: 8 * 60
};

export function createEmptyRealtimeBudgetMetrics(): RealtimeBudgetMetrics {
  return {
    realtimeActiveMs: 0,
    estimatedUserAudioSeconds: 0,
    estimatedAssistantAudioSeconds: 0,
    textInputTokens: 0,
    textOutputTokens: 0,
    estimatedCostUsd: 0,
    realtimeSessionCount: 0,
    fallbackCount: 0,
    localHitCount: 0
  };
}

export function estimateRealtimeCostUsd(metrics: Pick<RealtimeBudgetMetrics, "estimatedUserAudioSeconds" | "estimatedAssistantAudioSeconds">): number {
  const userAudioTokens = metrics.estimatedUserAudioSeconds * 10;
  const assistantAudioTokens = metrics.estimatedAssistantAudioSeconds * 20;
  return (userAudioTokens / 1_000_000) * 32 + (assistantAudioTokens / 1_000_000) * 64;
}

export class RealtimeRuntimeController {
  private modeValue: AssistantRuntimeMode = "local_standby";
  private metricsValue: RealtimeBudgetMetrics = createEmptyRealtimeBudgetMetrics();

  constructor(private readonly config: RealtimeBudgetConfig = DEFAULT_REALTIME_BUDGET_CONFIG) {}

  get mode(): AssistantRuntimeMode {
    return this.modeValue;
  }

  get metrics(): RealtimeBudgetMetrics {
    return { ...this.metricsValue };
  }

  recordLocalHit(): void {
    this.metricsValue.localHitCount += 1;
  }

  recordFallback(): void {
    this.metricsValue.fallbackCount += 1;
  }

  detectLocalWake(): AssistantRuntimeMode {
    this.refreshBudgetMode();
    if (this.modeValue === "local_standby") {
      this.modeValue = "local_wake_detected";
    }
    return this.modeValue;
  }

  standbyElapsed(_standbyMs: number): AssistantRuntimeMode {
    this.refreshBudgetMode();
    return this.modeValue;
  }

  requestRealtime(reason: "wake" | "manual" | "fallback"): { allowed: boolean; mode: AssistantRuntimeMode; reason: string } {
    this.refreshBudgetMode();
    if (this.modeValue === "hard_limited" && reason !== "manual") {
      return { allowed: false, mode: this.modeValue, reason: "daily_hard_limit_reached" };
    }
    if (this.modeValue === "saving_mode" && reason === "wake") {
      return { allowed: false, mode: this.modeValue, reason: "daily_soft_limit_reached" };
    }
    if (reason === "fallback") {
      this.recordFallback();
    }
    this.metricsValue.realtimeSessionCount += 1;
    this.modeValue = reason === "manual" ? "realtime_dialogue_window" : "realtime_command_window";
    return { allowed: true, mode: this.modeValue, reason: reason === "manual" ? "manual_override_allowed" : "allowed" };
  }

  recordRealtimeUsage(input: { activeMs?: number; userAudioSeconds?: number; assistantAudioSeconds?: number }): AssistantRuntimeMode {
    this.metricsValue.realtimeActiveMs += input.activeMs ?? 0;
    this.metricsValue.estimatedUserAudioSeconds += input.userAudioSeconds ?? 0;
    this.metricsValue.estimatedAssistantAudioSeconds += input.assistantAudioSeconds ?? 0;
    this.metricsValue.estimatedCostUsd = estimateRealtimeCostUsd(this.metricsValue);
    return this.refreshBudgetMode();
  }

  idleElapsed(idleMs: number): AssistantRuntimeMode {
    const currentMode = this.modeValue;
    if (currentMode === "realtime_command_window" && idleMs >= this.config.commandWindowIdleMs) {
      this.modeValue = "local_standby";
    }
    if (currentMode === "realtime_dialogue_window" && idleMs >= this.config.dialogueIdleMs) {
      this.modeValue = "realtime_cooldown";
    }
    if (currentMode === "realtime_cooldown" && idleMs >= (this.config.cooldownMs ?? DEFAULT_REALTIME_BUDGET_CONFIG.cooldownMs ?? 0)) {
      this.modeValue = "local_standby";
    }
    return this.modeValue;
  }

  private refreshBudgetMode(): AssistantRuntimeMode {
    if (this.metricsValue.estimatedCostUsd >= this.config.hardLimitUsd) {
      this.modeValue = "hard_limited";
    } else if (this.metricsValue.estimatedCostUsd >= this.config.softLimitUsd) {
      this.modeValue = "saving_mode";
    }
    return this.modeValue;
  }
}
