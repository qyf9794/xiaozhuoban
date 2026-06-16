import { describe, expect, it } from "vitest";
import {
  ActionRegistry,
  AssistantRegistryError,
  createPassthroughSchema,
  type AssistantParameterSchema
} from "./index";

interface AddArgs {
  a: number;
  b: number;
}

const addArgsSchema: AssistantParameterSchema<AddArgs> = {
  safeParse(value) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as Record<string, unknown>).a === "number" &&
      typeof (value as Record<string, unknown>).b === "number"
    ) {
      return { success: true, data: value as AddArgs };
    }
    return {
      success: false,
      error: {
        issues: [{ path: ["a"], message: "a 和 b 必须是数字" }]
      }
    };
  }
};

describe("ActionRegistry", () => {
  it("registers and executes an action", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "calculator.add",
        description: "Add two numbers",
        parameters: addArgsSchema,
        risk: "safe",
        scope: "widget-detail"
      },
      execute: (args) => ({
        status: "success",
        message: "已计算",
        data: { sum: args.a + args.b }
      })
    });

    const result = await registry.execute<{ sum: number }>({
      id: "call_1",
      name: "calculator.add",
      arguments: { a: 2, b: 3 },
      source: "test"
    });

    expect(result.status).toBe("success");
    expect(result.data?.sum).toBe(5);
    expect(registry.get("calculator.add")?.description).toBe("Add two numbers");
    expect(registry.list("widget-detail")).toHaveLength(1);
  });

  it("rejects duplicate action names", () => {
    const registry = new ActionRegistry();
    const action = {
      spec: {
        name: "desktop.focus",
        description: "Focus desktop",
        parameters: createPassthroughSchema<Record<string, never>>(),
        scope: "desktop" as const
      },
      execute: () => ({ status: "success" as const, message: "ok" })
    };

    registry.register(action);

    expect(() => registry.register(action)).toThrow(AssistantRegistryError);
  });

  it("returns an unknown tool failure", async () => {
    const registry = new ActionRegistry();

    const result = await registry.execute({
      id: "call_1",
      name: "missing.tool",
      arguments: {},
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "UNKNOWN_TOOL"
    });
  });

  it("returns schema validation failures", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "calculator.add",
        description: "Add two numbers",
        parameters: addArgsSchema
      },
      execute: () => ({ status: "success", message: "should not run" })
    });

    const result = await registry.execute({
      id: "call_1",
      name: "calculator.add",
      arguments: { a: "2", b: 3 },
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "INVALID_ARGUMENTS"
    });
    expect(result.message).toContain("a 和 b 必须是数字");
  });

  it("converts executor exceptions to failed results", async () => {
    const registry = new ActionRegistry();
    registry.register({
      spec: {
        name: "desktop.explode",
        description: "Throws",
        parameters: createPassthroughSchema<Record<string, never>>()
      },
      execute: () => {
        throw new Error("boom");
      }
    });

    const result = await registry.execute({
      id: "call_1",
      name: "desktop.explode",
      arguments: {},
      source: "test"
    });

    expect(result).toMatchObject({
      status: "failed",
      errorCode: "EXECUTION_FAILED",
      message: "boom"
    });
  });
});

describe("createPassthroughSchema", () => {
  it("can use a type guard", () => {
    const schema = createPassthroughSchema<{ ok: true }>(
      (value): value is { ok: true } =>
        Boolean(value) && typeof value === "object" && (value as Record<string, unknown>).ok === true
    );

    expect(schema.safeParse({ ok: true }).success).toBe(true);
    expect(schema.safeParse({ ok: false }).success).toBe(false);
  });
});
