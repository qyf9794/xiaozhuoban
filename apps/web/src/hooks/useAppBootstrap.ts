import { useEffect, useRef } from "react";
import type { Board } from "@xiaozhuoban/domain";
import { InMemoryRepository, SupabaseRepository, type AppRepository } from "@xiaozhuoban/data";
import { supabase } from "../lib/supabase";
import { showDesktopWindowWhenReady } from "../lib/desktopWindow";

const repositoryByUserId = new Map<string, SupabaseRepository>();

function getRepositoryForUser(userId: string): SupabaseRepository {
  const cached = repositoryByUserId.get(userId);
  if (cached) {
    return cached;
  }
  const repository = new SupabaseRepository(supabase, userId);
  repositoryByUserId.set(userId, repository);
  return repository;
}

interface UseAppBootstrapOptions {
  activeBoard: Board | undefined;
  e2eAuthBypass: boolean;
  hasAuthenticatedUser: boolean;
  initialize: () => Promise<void>;
  ready: boolean;
  setRepository: (repository: AppRepository) => void;
  userId: string | undefined;
}

export function useAppBootstrap({
  activeBoard,
  e2eAuthBypass,
  hasAuthenticatedUser,
  initialize,
  ready,
  setRepository,
  userId
}: UseAppBootstrapOptions) {
  const e2eRepositoryRef = useRef<InMemoryRepository | null>(null);

  useEffect(() => {
    if (e2eAuthBypass && !hasAuthenticatedUser) {
      if (!e2eRepositoryRef.current) {
        e2eRepositoryRef.current = new InMemoryRepository();
      }
      setRepository(e2eRepositoryRef.current);
      void initialize();
      return;
    }
    if (!userId) return;
    const repository = getRepositoryForUser(userId);
    setRepository(repository);
    void initialize();
  }, [e2eAuthBypass, hasAuthenticatedUser, initialize, setRepository, userId]);

  useEffect(() => {
    if (!ready || !activeBoard) return;
    void showDesktopWindowWhenReady();
  }, [activeBoard, ready]);
}
