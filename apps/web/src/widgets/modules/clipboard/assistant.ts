import type { AssistantAction, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createDailyWidgetAssistantModuleByType } from "../dailyWidgetAssistantModules";

export function createClipboardAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  return createDailyWidgetAssistantModuleByType("clipboard", definitions, actions);
}
