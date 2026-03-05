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
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
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
      setOnlineNames([]);
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
      }, 1000);
    };

    const updatePresenceNames = () => {
      const state = channel.presenceState<PresencePayload>();
      const names = new Set<string>();
      Object.values(state).forEach((sessions) => {
        sessions.forEach((session) => {
          const userName =
            session.userId === currentUserId ? currentUserName : (session.userName ?? "").trim();
          if (userName) {
            names.add(userName);
          }
        });
      });
      setOnlineNames([...names].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")));
    };

    channel
      .on("presence", { event: "sync" }, updatePresenceNames)
      .on("presence", { event: "join" }, updatePresenceNames)
      .on("presence", { event: "leave" }, updatePresenceNames)
      .subscribe(async (status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          await channel.track({ userId: currentUserId, userName: currentUserName });
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
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, currentUserName, retrySeed]);

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
