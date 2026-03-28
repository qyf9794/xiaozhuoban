import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../auth/authStore";
import { resolveUserName } from "../lib/collab";
import { useOnlineUsers } from "../lib/useOnlineUsers";

export function OnlineUsersDock({
  isMobileMode = false,
  mobileVisible = true,
  desktopBottomInset = 12
}: {
  isMobileMode?: boolean;
  mobileVisible?: boolean;
  desktopBottomInset?: number;
}) {
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
          color: "#334155",
          opacity: mobileVisible ? 1 : 0,
          transform: `translateY(${mobileVisible ? "0" : "18px"})`,
          pointerEvents: mobileVisible ? "auto" : "none",
          transition: "opacity 220ms ease, transform 220ms ease"
        }}
      >
        在线 {onlineNames.length}
      </div>
    );
  }

  return (
    <div
      className="online-users-dock"
      style={{
        position: "fixed",
        left: 12,
        bottom: desktopBottomInset,
        zIndex: 1500,
        maxWidth: 360,
        padding: 0,
        background: "transparent"
      }}
    >
      {onlineNames.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 14,
            fontWeight: 500,
            color: "#ffffff",
            textShadow: "0 1px 8px rgba(15,23,42,0.35)"
          }}
        >
          {onlineNames.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.82)",
            textShadow: "0 1px 8px rgba(15,23,42,0.35)"
          }}
        >
          暂无其他在线用户
        </div>
      )}
    </div>
  );
}
