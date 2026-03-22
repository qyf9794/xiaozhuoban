import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { ONLINE_USERS_CHANNEL } from "./collab";

interface PresencePayload {
  userId?: string;
  userName?: string;
}

export interface OnlineUserEntry {
  userId: string;
  userName: string;
}

let sharedChannel: RealtimeChannel | null = null;
let sharedRetryTimer: number | null = null;
let sharedCurrentUserId = "";
let sharedCurrentUserName = "";
let sharedOnlineUsers: Record<string, string> = {};
let subscriberCount = 0;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setOnlineUsers(nextUsers: Record<string, string>) {
  sharedOnlineUsers = nextUsers;
  emitChange();
}

function cleanupChannel() {
  if (sharedRetryTimer !== null) {
    window.clearTimeout(sharedRetryTimer);
    sharedRetryTimer = null;
  }
  if (sharedChannel) {
    void sharedChannel.untrack();
    void supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedOnlineUsers = {};
  sharedCurrentUserId = "";
  sharedCurrentUserName = "";
  emitChange();
}

function ensureChannel(currentUserId: string, currentUserName: string) {
  if (!currentUserId) {
    cleanupChannel();
    return;
  }
  if (sharedChannel && sharedCurrentUserId === currentUserId && sharedCurrentUserName === currentUserName) {
    return;
  }

  cleanupChannel();
  sharedCurrentUserId = currentUserId;
  sharedCurrentUserName = currentUserName;

  const channel: RealtimeChannel = supabase.channel(ONLINE_USERS_CHANNEL, {
    config: { presence: { key: currentUserId } }
  });

  const updatePresenceNames = () => {
    const state = channel.presenceState<PresencePayload>();
    const nextUsers: Record<string, string> = {};
    Object.values(state).forEach((sessions) => {
      sessions.forEach((session) => {
        const userKey = (session.userId ?? "").trim();
        const userName = session.userId === currentUserId ? currentUserName : (session.userName ?? "").trim();
        if (userKey && userName) {
          nextUsers[userKey] = userName;
        }
      });
    });
    if (!nextUsers[currentUserId]) {
      nextUsers[currentUserId] = currentUserName;
    }
    setOnlineUsers(nextUsers);
  };

  const scheduleRetry = () => {
    if (sharedRetryTimer !== null) return;
    sharedRetryTimer = window.setTimeout(() => {
      sharedRetryTimer = null;
      ensureChannel(sharedCurrentUserId, sharedCurrentUserName);
    }, 300);
  };

  sharedChannel = channel;
  channel
    .on("presence", { event: "sync" }, updatePresenceNames)
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      const joinedName =
        newPresences?.[0]?.userId === currentUserId ? currentUserName : (newPresences?.[0]?.userName ?? "").trim();
      const joinedId = (newPresences?.[0]?.userId ?? key ?? "").trim();
      if (joinedId && joinedName) {
        setOnlineUsers({ ...sharedOnlineUsers, [joinedId]: joinedName });
      } else {
        updatePresenceNames();
      }
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      const leftId = (leftPresences?.[0]?.userId ?? key ?? "").trim();
      if (!leftId) {
        updatePresenceNames();
        return;
      }
      const nextUsers = { ...sharedOnlineUsers };
      delete nextUsers[leftId];
      if (!nextUsers[currentUserId]) {
        nextUsers[currentUserId] = currentUserName;
      }
      setOnlineUsers(nextUsers);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ userId: currentUserId, userName: currentUserName });
        setOnlineUsers({ ...sharedOnlineUsers, [currentUserId]: currentUserName });
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        scheduleRetry();
      }
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return sharedOnlineUsers;
}

export function useOnlineUsers(currentUserId: string, currentUserName: string) {
  const onlineUsers = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    subscriberCount += 1;
    ensureChannel(currentUserId, currentUserName);
    return () => {
      subscriberCount -= 1;
      if (subscriberCount <= 0) {
        cleanupChannel();
        subscriberCount = 0;
      }
    };
  }, [currentUserId, currentUserName]);

  const onlineEntries = useMemo(
    () =>
      Object.entries(onlineUsers)
        .map(([userId, userName]) => ({ userId, userName }))
        .sort((a, b) => a.userName.localeCompare(b.userName, "zh-Hans-CN")),
    [onlineUsers]
  );

  return {
    onlineUsers,
    onlineEntries,
    otherUsers: onlineEntries.filter((item) => item.userId !== currentUserId)
  };
}
