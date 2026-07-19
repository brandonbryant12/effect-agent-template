// Deliberate entry point for the OpenAI Responses adapter. The adapter's
// implementation stays under internal/; consumers opt in via
// `@repo/ai/openai` instead of receiving provider exports from the barrel.
export {
  makeOpenAiResponses,
  type OpenAiResponsesOptions,
} from "./internal/openai/client.js";
