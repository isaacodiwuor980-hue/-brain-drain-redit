/**
 * Offline arithmetic experiment only. The caller must authenticate the account,
 * independently review answer keys, prevent repeated/leaked questions, ensure
 * this is one person's eligible work, and verify that questions match the topic.
 * This helper cannot validate any of those assertions. It stores nothing and is
 * not connected to user profiles, expertise labels, vote weights or ranking.
 *
 * A question's uniform-guess baseline is 1 / optionCount. Real guesses may be
 * biased and questions differ in difficulty; this is not a probability of
 * expertise, statistical calibration, an authority score or a decision gate.
 */
export type ReviewedAnswerV3 = Readonly<{
  questionId: string;
  topic: string;
  optionCount: number;
  selected: number;
  verifiedAnswer: number;
}>;
export type CalibrationSummaryV3 = Readonly<{
  reviewed: number;
  correct: number;
  fractionCorrect: number;
  uniformGuessBaseline: number;
}>;

export function summarizeCalibrationV3(topic: string, answers: readonly ReviewedAnswerV3[]): CalibrationSummaryV3 | null {
  if (typeof topic !== "string" || !topic.trim() || !Array.isArray(answers)) throw new RangeError("Invalid calibration inputs");
  const ids = new Set<string>();
  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== "string" || !answer.questionId.trim() || answer.topic !== topic || ids.has(answer.questionId) ||
        !Number.isInteger(answer.optionCount) || answer.optionCount < 2 || answer.optionCount > 8 ||
        !Number.isInteger(answer.selected) || answer.selected < 0 || answer.selected >= answer.optionCount ||
        !Number.isInteger(answer.verifiedAnswer) || answer.verifiedAnswer < 0 || answer.verifiedAnswer >= answer.optionCount) throw new RangeError("Invalid reviewed answer");
    ids.add(answer.questionId);
  }
  if (answers.length === 0) return null;
  // Canonical order prevents floating-point accumulation from changing on retry.
  const ordered = [...answers].sort((a, b) => a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0);
  let correct = 0, baseline = 0;
  for (const answer of ordered) {
    if (answer.selected === answer.verifiedAnswer) correct++;
    baseline += 1 / answer.optionCount;
  }
  return { reviewed: ordered.length, correct, fractionCorrect: correct / ordered.length, uniformGuessBaseline: baseline / ordered.length };
}
