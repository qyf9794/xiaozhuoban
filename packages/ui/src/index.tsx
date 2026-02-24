import type { PropsWithChildren } from "react";

export function Card({
  children,
  title,
  tone = "default"
}: PropsWithChildren<{ title?: string; tone?: "default" | "sticky" | "todo" | "recorder" }>) {
  const isSticky = tone === "sticky";
  const isTodo = tone === "todo";
  const isRecorder = tone === "recorder";
  return (
    <section
      style={{
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        border: isSticky
          ? "1px solid rgba(255, 210, 77, 0.62)"
          : isTodo
            ? "1px solid rgba(74, 222, 128, 0.55)"
            : isRecorder
              ? "1px solid rgba(255, 255, 255, 0.58)"
              : "1px solid rgba(255, 255, 255, 0.58)",
        borderRadius: 18,
        background: isSticky
          ? "linear-gradient(165deg, rgba(255, 240, 168, 0.52), rgba(255, 226, 102, 0.34))"
          : isTodo
            ? "linear-gradient(165deg, rgba(187, 247, 208, 0.48), rgba(74, 222, 128, 0.24))"
            : isRecorder
              ? "linear-gradient(165deg, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0.1))"
              : "linear-gradient(165deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.14))",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        backdropFilter: "blur(20px) saturate(140%)",
        padding: 12,
        boxShadow: isSticky
          ? "0 12px 24px rgba(176, 132, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
          : isTodo
            ? "0 12px 24px rgba(22, 163, 74, 0.2), inset 0 1px 0 rgba(220, 252, 231, 0.52)"
            : isRecorder
              ? "0 12px 24px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
              : "0 12px 30px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
      }}
    >
      {title ? (
        <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#0f172a" }}>{title}</h3>
      ) : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button"
}: PropsWithChildren<{
  onClick?: () => void;
  variant?: "primary" | "ghost";
  type?: "button" | "submit";
}>) {
  return (
    <button
      onClick={onClick}
      type={type}
      style={{
        border: variant === "ghost" ? "1px solid rgba(148, 163, 184, 0.42)" : "1px solid rgba(96, 165, 250, 0.6)",
        borderRadius: 12,
        padding: "7px 12px",
        cursor: "pointer",
        color: variant === "ghost" ? "#0f172a" : "#eff6ff",
        background:
          variant === "ghost"
            ? "linear-gradient(160deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.34))"
            : "linear-gradient(155deg, rgba(37, 99, 235, 0.78), rgba(56, 189, 248, 0.7))",
        backdropFilter: "blur(16px) saturate(135%)",
        boxShadow:
          variant === "ghost"
            ? "0 8px 18px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
            : "0 10px 20px rgba(30, 64, 175, 0.28), inset 0 1px 0 rgba(191, 219, 254, 0.55)"
      }}
    >
      {children}
    </button>
  );
}
