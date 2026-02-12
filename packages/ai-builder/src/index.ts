import { z } from "zod";
import { createId, nowIso, type WidgetDefinition, type WidgetDefinitionDraft } from "@xiaozhuoban/domain";

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "number", "select", "date", "checkbox", "textarea"]),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  validation: z
    .object({
      required: z.boolean().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      regex: z.string().optional(),
      enum: z.array(z.string()).optional()
    })
    .optional()
});

const widgetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.object({
    fields: z.array(fieldSchema).min(1)
  }),
  outputSchema: z.object({
    fields: z.array(fieldSchema)
  }),
  uiSchema: z.object({
    layout: z.enum(["single-column", "two-column"]),
    emphasizedFields: z.array(z.string()).optional()
  }),
  logicSpec: z.object({
    derived: z
      .array(
        z.object({
          target: z.string(),
          expression: z.string()
        })
      )
      .optional(),
    onSubmit: z
      .object({
        message: z.string().optional(),
        clearAfterSubmit: z.boolean().optional()
      })
      .optional()
  }),
  storagePolicy: z.object({
    strategy: z.enum(["local", "ephemeral"]),
    retentionDays: z.number().optional()
  })
});

export interface AIBuilder {
  generate(prompt: string): WidgetDefinitionDraft;
  regenerate(draft: WidgetDefinitionDraft, instruction: string, scope?: "full" | "logic" | "style"): WidgetDefinitionDraft;
  validate(definition: unknown): string[];
}

function buildFallback(prompt: string): Omit<WidgetDefinition, "id" | "createdAt" | "updatedAt" | "version" | "kind" | "type"> {
  return {
    name: "AI 表单",
    description: `来自提示词：${prompt}`,
    inputSchema: {
      fields: [
        { key: "title", label: "标题", type: "text", validation: { required: true } },
        { key: "note", label: "内容", type: "textarea" }
      ]
    },
    outputSchema: {
      fields: []
    },
    uiSchema: {
      layout: "single-column"
    },
    logicSpec: {
      onSubmit: {
        message: "已保存",
        clearAfterSubmit: false
      }
    },
    storagePolicy: {
      strategy: "local"
    }
  };
}

export class LocalTemplateAIBuilder implements AIBuilder {
  generate(prompt: string): WidgetDefinitionDraft {
    const base = buildFallback(prompt);
    const now = nowIso();
    const definition: WidgetDefinition = {
      id: createId("wd"),
      kind: "ai",
      type: "form",
      version: 1,
      createdAt: now,
      updatedAt: now,
      ...base
    };

    return {
      id: createId("draft"),
      prompt,
      version: 1,
      definition,
      createdAt: now
    };
  }

  regenerate(
    draft: WidgetDefinitionDraft,
    instruction: string,
    scope: "full" | "logic" | "style" = "full"
  ): WidgetDefinitionDraft {
    const next = structuredClone(draft);
    next.version += 1;
    next.baseVersion = draft.version;
    next.definition.version = next.version;
    next.definition.updatedAt = nowIso();

    if (scope === "logic" || scope === "full") {
      next.definition.logicSpec.onSubmit = {
        ...(next.definition.logicSpec.onSubmit ?? {}),
        message: `已根据指令更新: ${instruction}`
      };
    }

    if (scope === "style" || scope === "full") {
      next.definition.uiSchema.layout = instruction.includes("两列") ? "two-column" : "single-column";
    }

    return next;
  }

  validate(definition: unknown): string[] {
    const parsed = widgetSchema.safeParse(definition);
    if (parsed.success) {
      return [];
    }
    return parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`);
  }
}
