import type { AssistantAction, WidgetAssistantModule } from "@xiaozhuoban/assistant-core";
import type { WidgetDefinition } from "@xiaozhuoban/domain";
import { createDailyWidgetAssistantModuleByType } from "../dailyWidgetAssistantModules";

export function createCalculatorAssistantModule(definitions: WidgetDefinition[], actions: AssistantAction[]): WidgetAssistantModule {
  return createDailyWidgetAssistantModuleByType("calculator", definitions, actions);
}
