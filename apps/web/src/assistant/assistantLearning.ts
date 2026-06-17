import {
  LearnedCommandStore,
  type LearnedCommandStoreSnapshot,
  type LearnedCommandStorage
} from "@xiaozhuoban/assistant-core";

const LEARNED_COMMANDS_KEY = "xiaozhuoban.assistant.learned_commands.v1";

const emptySnapshot: LearnedCommandStoreSnapshot = {
  shortcuts: [],
  aliases: [],
  macros: [],
  defaults: [],
  negativeExamples: []
};

function normalizeSnapshot(value: unknown): LearnedCommandStoreSnapshot {
  if (!value || typeof value !== "object") return { ...emptySnapshot };
  const record = value as Partial<LearnedCommandStoreSnapshot>;
  return {
    shortcuts: Array.isArray(record.shortcuts) ? record.shortcuts : [],
    aliases: Array.isArray(record.aliases) ? record.aliases : [],
    macros: Array.isArray(record.macros) ? record.macros : [],
    defaults: Array.isArray(record.defaults) ? record.defaults : [],
    negativeExamples: Array.isArray(record.negativeExamples) ? record.negativeExamples : []
  };
}

export class LocalStorageLearnedCommandStorage implements LearnedCommandStorage {
  load(): LearnedCommandStoreSnapshot {
    if (typeof localStorage === "undefined") return { ...emptySnapshot };
    try {
      return normalizeSnapshot(JSON.parse(localStorage.getItem(LEARNED_COMMANDS_KEY) ?? "{}"));
    } catch {
      return { ...emptySnapshot };
    }
  }

  save(snapshot: LearnedCommandStoreSnapshot): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LEARNED_COMMANDS_KEY, JSON.stringify(snapshot));
  }
}

export const assistantLearnedCommandStore = new LearnedCommandStore(new LocalStorageLearnedCommandStorage());
