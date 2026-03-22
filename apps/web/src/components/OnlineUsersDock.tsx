import { useMemo } from "react";
import { useAuthStore } from "../auth/authStore";
import { resolveUserName } from "../lib/collab";
import { useOnlineUsers } from "../lib/useOnlineUsers";

export function OnlineUsersDock({ isMobileMode = false }: { isMobileMode?: boolean }) {
  const { user } = useAuthStore();
  const currentUserId = user?.id ?? "";
  const currentUserName = useMemo(
    () =>
      resolveUserName({
        email: user?.email ?? null,
        userMetadata: (user?.user_metadata as Record<string, unknown> | undefined) ?? null
      }),
    [user?.email, user?.user_metadata]
  );
  const { onlineEntries } = useOnlineUsers(currentUserId, currentUserName);
  const onlineNames = useMemo(() => onlineEntries.map((item) => item.userName), [onlineEntries]);

  if (isMobileMode) {
    return (
      <div
        className="online-users-dock liquid-glass-preserve"
        style={{
          position: "fixed",
          left: 10,
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          zIndex: 1600,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.58)",
          background: "linear-gradient(170deg, rgba(255,255,255,0.74), rgba(255,255,255,0.42))",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
          padding: "4px 10px",
          fontSize: 12,
          color: "#334155"
        }}
      >
        在线 {onlineNames.length}
      </div>
    );
  }

  return (
    <div
      className="online-users-dock liquid-glass-preserve"
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
              className="online-users-chip liquid-glass-preserve"
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
