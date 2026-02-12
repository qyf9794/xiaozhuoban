import { describe, expect, it } from "vitest";
import { LocalTemplateAIBuilder } from "./index";

describe("LocalTemplateAIBuilder", () => {
  it("generates valid draft", () => {
    const builder = new LocalTemplateAIBuilder();
    const draft = builder.generate("给我一个反思工具");
    expect(draft.definition.kind).toBe("ai");
    expect(builder.validate(draft.definition)).toEqual([]);
  });

  it("regenerate updates version and logic", () => {
    const builder = new LocalTemplateAIBuilder();
    const draft = builder.generate("test");
    const regenerated = builder.regenerate(draft, "改成两列", "full");
    expect(regenerated.version).toBe(2);
    expect(regenerated.definition.uiSchema.layout).toBe("two-column");
  });
});
