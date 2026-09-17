import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion } from "ai";
import type { JevOptions, Questions } from "./jev.js";

/** Translate Gateway's evaluation contract; never send Jev to a chat endpoint. */
export async function evaluateGateway(options: JevOptions, state: unknown, questions: Questions, signal: AbortSignal, boundedFetch: typeof fetch): Promise<unknown> {
  const gateway = createGateway({ apiKey: options.apiKey, baseURL: options.endpoint, fetch: boundedFetch });
  const translated: Record<string, Experimental_EvaluationQuestion> = {};
  for (const [id, question] of Object.entries(questions)) {
    translated[id] = question.type === "noul" ? { ...question, type: "boolean" } : question;
  }
  const result = await evaluate({
    model: gateway.evaluationModel(options.model ?? "typesafe-ai/jev"),
    state: state as Parameters<typeof evaluate>[0]["state"],
    questions: translated,
    maxRetries: 0,
    abortSignal: signal,
    providerOptions: { gateway: { zeroDataRetention: true } },
  });
  const confidence = result.providerMetadata?.typesafe?.confidence as Record<string, unknown> | undefined;
  const answers = Object.fromEntries(Object.entries(result.answers).map(([id, answer]) => [id,
    answer.type === "boolean" ? { type: "noul", noul: answer.probability }
      : answer.type === "choice" ? { ...answer, confidence: confidence?.[id] }
        : answer,
  ]));
  return { model: result.response.modelId, answers, rounding: result.rounding, usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens } };
}
