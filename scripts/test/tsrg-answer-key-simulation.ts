/* Synthetic known-answer benchmark. No real users, data, network or live flags. */
import { pathToFileURL } from "node:url";
import { effectiveMass, SENTINEL_INVALID, wilsonLowerBound } from "../../lib/tsrg/index";
import { wilsonPriorCandidateV3 } from "../../lib/tsrg/wilson-prior-candidate";

type Scenario = Readonly<{ name: string; voters: number; expertAccuracy: number; otherAccuracy: number }>;
const scenarios: readonly Scenario[] = [
  { name: "majority_usually_correct", voters: 100, expertAccuracy: 0.99, otherAccuracy: 0.60 },
  { name: "one_expert_majority_fooled", voters: 100, expertAccuracy: 0.99, otherAccuracy: 0.10 },
  { name: "expert_usually_wrong", voters: 100, expertAccuracy: 0.01, otherAccuracy: 0.90 },
  { name: "cold_start_four_voters", voters: 4, expertAccuracy: 0.80, otherAccuracy: 0.60 },
];
const expertMass = effectiveMass("life", 0.8, 30, false, false);
const otherMass = effectiveMass("mouth", 0.2, 30, false, false);
type Metrics = { correct: number; incorrect: number; ties: number; invalid: number };
function record(metrics: Metrics, prediction: number, truth: number) {
  if (!Number.isFinite(prediction)) metrics.invalid++;
  else if (prediction === 0) metrics.ties++;
  else if (prediction === truth) metrics.correct++;
  else metrics.incorrect++;
}
function signed(a: number, b: number): number { return a > b ? 1 : a < b ? -1 : 0; }
function scoreDecision(fn: (up: bigint, down: bigint) => number, up: bigint, down: bigint): number {
  const a = fn(up, down), b = fn(down, up);
  return a === SENTINEL_INVALID || b === SENTINEL_INVALID ? NaN : signed(a, b);
}

/** Synthetic truth is used only to generate and assess responses, not by scorers. */
export function runAnswerKeySimulation(perScenario = 5000, initialSeed = 92131) {
  if (!Number.isSafeInteger(perScenario) || perScenario < 1 || perScenario > 100_000 || !Number.isInteger(initialSeed) || initialSeed < 0 || initialSeed > 0xffffffff) throw new RangeError("Invalid simulation configuration");
  let seed = initialSeed >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  return scenarios.map(scenario => {
    const binary: Metrics = { correct: 0, incorrect: 0, ties: 0, invalid: 0 };
    const legacy: Metrics = { correct: 0, incorrect: 0, ties: 0, invalid: 0 };
    const candidate: Metrics = { correct: 0, incorrect: 0, ties: 0, invalid: 0 };
    for (let question = 0; question < perScenario; question++) {
      const truth = question % 2 === 0 ? 1 : -1;
      let up = 0n, down = 0n, binaryBalance = 0;
      for (let i = 0; i < scenario.voters; i++) {
        const accuracy = i === 0 ? scenario.expertAccuracy : scenario.otherAccuracy;
        const answer = random() < accuracy ? truth : -truth;
        const mass = i === 0 ? expertMass : otherMass;
        binaryBalance += answer;
        if (answer === 1) up += mass; else down += mass;
      }
      record(binary, Math.sign(binaryBalance), truth);
      // Comparing each orientation is an evaluation rule, not the deployed feed.
      record(legacy, scoreDecision(wilsonLowerBound, up, down), truth);
      record(candidate, scoreDecision(wilsonPriorCandidateV3, up, down), truth);
    }
    return { scenario: scenario.name, questions: perScenario, voters: scenario.voters, binary, legacy, candidate };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(runAnswerKeySimulation(), null, 2));
