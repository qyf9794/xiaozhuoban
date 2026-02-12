import type { WidgetDefinition, WidgetInstance } from "@xiaozhuoban/domain";

export interface WidgetRuntimePlugin {
  type: string;
  run(input: Record<string, unknown>, instance: WidgetInstance, definition: WidgetDefinition): Record<string, unknown>;
}

export class WidgetRuntime {
  private plugins = new Map<string, WidgetRuntimePlugin>();

  register(plugin: WidgetRuntimePlugin): void {
    this.plugins.set(plugin.type, plugin);
  }

  execute(instance: WidgetInstance, definition: WidgetDefinition): WidgetInstance {
    const plugin = this.plugins.get(definition.type);
    if (!plugin) {
      return instance;
    }

    const patch = plugin.run(instance.state, instance, definition);
    return {
      ...instance,
      state: {
        ...instance.state,
        ...patch
      }
    };
  }
}

export const formPlugin: WidgetRuntimePlugin = {
  type: "form",
  run(input, _instance, definition) {
    const output: Record<string, unknown> = { ...input };

    for (const derived of definition.logicSpec.derived ?? []) {
      if (derived.expression === "count_filled") {
        const filled = Object.values(input).filter((value) => value !== null && value !== "").length;
        output[derived.target] = filled;
      }
    }

    return output;
  }
};
