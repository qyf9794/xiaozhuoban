import type { PropsWithChildren } from "react";

export function Card({
  children,
  title,
  tone = "default"
}: PropsWithChildren<{
  title?: string;
  tone?: "default" | "sticky" | "mint" | "sky" | "peach" | "slate" | "aqua" | "rose";
}>) {
  const palette = {
    default: {
      border: "1px solid rgba(255, 255, 255, 0.58)",
      background: "linear-gradient(165deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.14))",
      boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
    },
    sticky: {
      border: "1px solid rgba(255, 210, 77, 0.62)",
      background: "linear-gradient(165deg, rgba(255, 240, 168, 0.52), rgba(255, 226, 102, 0.34))",
      boxShadow: "0 12px 24px rgba(176, 132, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.45)"
    },
    mint: {
      border: "1px solid rgba(110, 231, 183, 0.56)",
      background: "linear-gradient(165deg, rgba(209, 250, 229, 0.46), rgba(110, 231, 183, 0.24))",
      boxShadow: "0 12px 24px rgba(16, 185, 129, 0.18), inset 0 1px 0 rgba(236, 253, 245, 0.55)"
    },
    sky: {
      border: "1px solid rgba(125, 211, 252, 0.58)",
      background: "linear-gradient(165deg, rgba(224, 242, 254, 0.46), rgba(125, 211, 252, 0.24))",
      boxShadow: "0 12px 24px rgba(14, 165, 233, 0.18), inset 0 1px 0 rgba(240, 249, 255, 0.55)"
    },
    peach: {
      border: "1px solid rgba(253, 186, 116, 0.58)",
      background: "linear-gradient(165deg, rgba(255, 237, 213, 0.46), rgba(253, 186, 116, 0.25))",
      boxShadow: "0 12px 24px rgba(249, 115, 22, 0.18), inset 0 1px 0 rgba(255, 247, 237, 0.55)"
    },
    slate: {
      border: "1px solid rgba(148, 163, 184, 0.58)",
      background: "linear-gradient(165deg, rgba(226, 232, 240, 0.4), rgba(148, 163, 184, 0.22))",
      boxShadow: "0 12px 24px rgba(51, 65, 85, 0.16), inset 0 1px 0 rgba(241, 245, 249, 0.5)"
    },
    aqua: {
      border: "1px solid rgba(45, 212, 191, 0.56)",
      background: "linear-gradient(165deg, rgba(204, 251, 241, 0.44), rgba(45, 212, 191, 0.24))",
      boxShadow: "0 12px 24px rgba(20, 184, 166, 0.17), inset 0 1px 0 rgba(240, 253, 250, 0.55)"
    },
    rose: {
      border: "1px solid rgba(253, 164, 175, 0.58)",
      background: "linear-gradient(165deg, rgba(255, 228, 230, 0.46), rgba(253, 164, 175, 0.24))",
      boxShadow: "0 12px 24px rgba(244, 63, 94, 0.17), inset 0 1px 0 rgba(255, 241, 242, 0.55)"
    }
  } as const;
  const theme = palette[tone] ?? palette.default;
  return (
    <section
      style={{
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: theme.border,
        borderRadius: 18,
        background: theme.background,
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        backdropFilter: "blur(20px) saturate(140%)",
        padding: 12,
        boxShadow: theme.boxShadow
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
