import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseConfigError } from "../lib/supabase";

interface AuthState {
  ready: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  error: string;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let initialized = false;
let unsubscribe: (() => void) | null = null;
let initializingPromise: Promise<void> | null = null;

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  loading: false,
  user: null,
  session: null,
  error: "",
  async initialize() {
    if (get().ready && initialized) {
      return;
    }

    if (initializingPromise) {
      await initializingPromise;
      return;
    }

    if (initialized) {
      set((state) => ({ ready: true, session: state.session, user: state.user }));
      return;
    }

    if (supabaseConfigError) {
      set({ ready: true, error: supabaseConfigError, session: null, user: null });
      return;
    }

    if (!unsubscribe) {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        set({
          session: nextSession,
          user: nextSession?.user ?? null,
          ready: true,
          loading: false
        });
      });

      unsubscribe = () => data.subscription.unsubscribe();
    }

    initializingPromise = (async () => {
      const sessionRequest = supabase.auth.getSession();
      const timeoutMs = 900;

      const initialResult = await new Promise<
        | { kind: "session"; session: Session | null; error: Error | null }
        | { kind: "timeout" }
      >((resolve) => {
        const timeoutId = window.setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);

        void sessionRequest
          .then(({ data: { session }, error }) => {
            window.clearTimeout(timeoutId);
            resolve({
              kind: "session",
              session,
              error: error ? new Error(error.message) : null
            });
          })
          .catch((error) => {
            window.clearTimeout(timeoutId);
            resolve({
              kind: "session",
              session: null,
              error: new Error(readErrorMessage(error, "登录态初始化失败"))
            });
          });
      });

      if (initialResult.kind === "timeout") {
        set((state) =>
          state.ready
            ? state
            : {
                ...state,
                ready: true,
                error: ""
              }
        );

        void sessionRequest
          .then(({ data: { session }, error }) => {
            if (error) {
              set({ ready: true, error: error.message, session: null, user: null, loading: false });
              return;
            }
            set({ ready: true, session, user: session?.user ?? null, error: "", loading: false });
            initialized = true;
          })
          .catch((error) => {
            set({
              ready: true,
              error: readErrorMessage(error, "登录态初始化失败"),
              session: null,
              user: null,
              loading: false
            });
          });
        return;
      }

      if (initialResult.error) {
        set({ ready: true, error: initialResult.error.message, session: null, user: null, loading: false });
        return;
      }

      set({
        ready: true,
        session: initialResult.session,
        user: initialResult.session?.user ?? null,
        error: "",
        loading: false
      });
      initialized = true;
    })();

    try {
      await initializingPromise;
    } finally {
      initializingPromise = null;
    }
  },
  async signIn(email, password) {
    if (supabaseConfigError) {
      const error = new Error(supabaseConfigError || "Supabase 未初始化");
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: true, error: "" });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: false, error: "" });
  },
  async signUp(email, password) {
    if (supabaseConfigError) {
      const error = new Error(supabaseConfigError || "Supabase 未初始化");
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: true, error: "" });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: false, error: "" });
  },
  async updateDisplayName(displayName) {
    const nextName = displayName.trim();
    if (!nextName) {
      throw new Error("用户名不能为空");
    }
    if (supabaseConfigError) {
      const error = new Error(supabaseConfigError || "Supabase 未初始化");
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: true, error: "" });
    const { data, error } = await supabase.auth.updateUser({
      data: { name: nextName }
    });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({
      loading: false,
      error: "",
      user: data.user ?? null
    });
  },
  async signOut() {
    if (supabaseConfigError) {
      const error = new Error(supabaseConfigError || "Supabase 未初始化");
      set({ loading: false, error: error.message, session: null, user: null });
      throw error;
    }
    set({ loading: true, error: "" });
    const { error } = await supabase.auth.signOut();
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: false, error: "", session: null, user: null });
  },
  clearError() {
    set({ error: "" });
  }
}));

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
      initialized = false;
    }
  });
}
