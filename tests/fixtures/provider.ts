import type { ModelProvider } from "../../src/server/answers.ts";

/** External-service simulation for local/test use. Never imported by production. */
export const controlledProvider: ModelProvider = {
  kind: "free",
  mode: "simulated",
  indexKey: "controlled-v1",
  async embed(texts) {
    return texts.map(() => [1, 0]);
  },
  async answer(question, evidence) {
    if (question.includes("[slow fixture]"))
      await new Promise((resolve) => setTimeout(resolve, 3000));
    const source = evidence.find(
      (item) => item.text === "Shop drawings are due within 14 calendar days.",
    );
    if (!/shop drawings|drawings due/i.test(question) || !source)
      return { status: "not_found", claims: [] };
    return {
      status: "answered",
      claims: [
        {
          text: "Shop drawings are due within 14 calendar days.",
          citations: [{ id: source.id, quote: source.text }],
        },
      ],
    };
  },
};
