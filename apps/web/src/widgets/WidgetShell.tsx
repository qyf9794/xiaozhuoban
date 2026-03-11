import { Card } from "@xiaozhuoban/ui";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import type { CSSProperties, ReactNode } from "react";

export function WidgetShell({
  instance,
  definition,
  children,
  cardStyle
}: {
  instance: WidgetInstance;
  definition: WidgetDefinition;
  children: ReactNode;
  cardStyle?: CSSProperties;
}) {
  const randomTones = ["mint", "sky", "peach", "slate", "aqua", "rose"] as const;
  const hash = Array.from(instance.id).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const randomTone = randomTones[hash % randomTones.length];
  const tone = definition.type === "note" ? "sticky" : randomTone;
  return (
    <Card title={definition.name} tone={tone} style={cardStyle}>
      <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>
        {definition.description ?? definition.type}
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "column" }}>{children}</div>
    </Card>
  );
}
