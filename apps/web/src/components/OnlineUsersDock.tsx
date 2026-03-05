import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuthStore } from "../auth/authStore";
import { supabase } from "../lib/supabase";
import { ONLINE_USERS_CHANNEL, resolveUserName } from "../lib/collab";

interface PresencePayload {
  userId?: string;
  userName?: string;
}

export function OnlineUsersDock() {
  const { user } = useAuthStore();
  const [onlineUsers, setOnlineUsers] = useState<Record<string, string>>({});
  const [retrySeed, setRetrySeed] = useState(0);

  const currentUserId = user?.id ?? "";
  const currentUserName = useMemo(
    () =>
      resolveUserName({
        email: user?.email ?? null,
        userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
      }),
    [user?.email, user?.user_metadata]
  );

  useEffect(() => {
    if (!currentUserId) {
      setOnlineUsers({});
      return;
    }

    const channel: RealtimeChannel = supabase.channel(ONLINE_USERS_CHANNEL, {
      config: { presence: { key: currentUserId } }
    });
    let retryTimer: number | null = null;
    let disposed = false;

    const scheduleRetry = () => {
      if (disposed || retryTimer !== null) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (!disposed) {
          setRetrySeed((prev) => prev + 1);
        }
      }, 300);
    };

    const updatePresenceNames = () => {
      const state = channel.presenceState<PresencePayload>();
      const nextUsers: Record<string, string> = {};
      Object.values(state).forEach((sessions) => {
        sessions.forEach((session) => {
          const userName =
            session.userId === currentUserId ? currentUserName : (session.userName ?? "").trim();
          const userKey = (session.userId ?? "").trim();
          if (userName && userKey) {
            nextUsers[userKey] = userName;
          }
        });
      });
      if (!nextUsers[currentUserId]) {
        nextUsers[currentUserId] = currentUserName;
      }
      setOnlineUsers(nextUsers);
    };

    channel
      .on("presence", { event: "sync" }, updatePresenceNames)
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const joinedName =
          newPresences?.[0]?.userId === currentUserId
            ? currentUserName
            : (newPresences?.[0]?.userName ?? "").trim();
        const joinedId = (newPresences?.[0]?.userId ?? key ?? "").trim();
        if (joinedId && joinedName) {
          setOnlineUsers((prev) => ({ ...prev, [joinedId]: joinedName }));
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
        setOnlineUsers((prev) => {
          const next = { ...prev };
          delete next[leftId];
          if (!next[currentUserId]) {
            next[currentUserId] = currentUserName;
          }
          return next;
        });
      })
      .subscribe(async (status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: currentUserId, userName: currentUserName });
          setOnlineUsers((prev) => ({ ...prev, [currentUserId]: currentUserName }));
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          scheduleRetry();
        }
      });

    return () => {
      disposed = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      setOnlineUsers({});
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, currentUserName, retrySeed]);

  const onlineNames = useMemo(
    () => Object.values(onlineUsers).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
    [onlineUsers]
  );

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        zIndex: 1500,
        minWidth: 180,
        maxWidth: 280,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.58)",
        background: "linear-gradient(170deg, rgba(255,255,255,0.58), rgba(255,255,255,0.34))",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 18px rgba(15,23,42,0.14)",
        padding: "8px 10px"
      }}
    >
      <div style={{ fontSize: 12, color: "#334155", marginBottom: 4 }}>在线用户</div>
      {onlineNames.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {onlineNames.map((name) => (
            <span
              key={name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                padding: "2px 8px",
                fontSize: 12,
                color: "#0f172a",
                border: "1px solid rgba(148,163,184,0.38)",
                background: "rgba(255,255,255,0.5)"
              }}
            >
              {name}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#64748b" }}>暂无其他在线用户</div>
      )}
    </div>
  );
}
