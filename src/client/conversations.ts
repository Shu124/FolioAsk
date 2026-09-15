import type { AnswerRecord } from "../server/answers";

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}
export function conversations(answers: AnswerRecord[]): ConversationSummary[] {
  const groups = new Map<string, ConversationSummary>();
  for (const answer of answers) {
    const id = answer.threadId ?? answer.id;
    const previous = groups.get(id);
    if (previous)
      previous.updatedAt = Math.max(previous.updatedAt, answer.createdAt);
    else
      groups.set(id, {
        id,
        title: answer.question,
        updatedAt: answer.createdAt,
      });
  }
  return [...groups.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
