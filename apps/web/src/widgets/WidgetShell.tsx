import { Card } from "@xiaozhuoban/ui";
import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";
import type { ReactNode } from "react";

export function WidgetShell({
  instance,
  definition,
  children
}: {
  instance: WidgetInstance;
  definition: WidgetDefinition;
  children: ReactNode;
}) {
  const tone =
    definition.type === "note"
      ? "sticky"
      : definition.type === "todo"
        ? "todo"
        : definition.type === "recorder"
          ? "recorder"
          : "default";
  return (
    <Card title={definition.name} tone={tone}>
      <div style={{ fontSize: 12, color: "#334155", marginBottom: 8 }}>
        {definition.description ?? definition.type}
      </div>
      {children}
    </Card>
  );
}
