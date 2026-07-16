import type { AiInput } from "../../model.js";

export const responseRequest = (input: AiInput, model: string) => ({
  model,
  input: input.prompt,
  ...(input.instructions === undefined
    ? {}
    : { instructions: input.instructions }),
  ...(input.tools === undefined
    ? {}
    : {
        tools: input.tools.map((tool) => ({
          type: "function" as const,
          name: tool.name,
          description: tool.description,
          strict: true,
          parameters: {
            ...tool.parameters,
            additionalProperties: false,
          },
        })),
      }),
});
