import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  ready: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  error: string;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let initialized = false;
let unsubscribe: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  loading: false,
  user: null,
  session: null,
  error: "",
  async initialize() {
    if (initialized) {
      set({ ready: true });
      return;
    }

    const {
      data: { session },
      error
    } = await supabase.auth.getSession();

    if (error) {
      set({ ready: true, error: error.message, session: null, user: null });
    } else {
      set({ ready: true, session, user: session?.user ?? null, error: "" });
    }

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      set({ session: nextSession, user: nextSession?.user ?? null, ready: true });
    });

    unsubscribe = () => data.subscription.unsubscribe();
    initialized = true;
  },
  async signIn(email, password) {
    set({ loading: true, error: "" });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: false, error: "" });
  },
  async signUp(email, password) {
    set({ loading: true, error: "" });
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      throw error;
    }
    set({ loading: false, error: "" });
  },
  async signOut() {
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
