#!/usr/bin/env node
/**
 * Enumerates hypothetical product scenarios, not people, reviews, or tests.
 * The weighting is deliberately balanced and is NOT market data. No network
 * requests, store submissions, app interactions or backend writes are made.
 */
const personas = [
  ["new visitor", "I want to understand the benefit before creating an account."],
  ["knowledge seeker", "I want a useful answer, its evidence, and its limitations."],
  ["contributor", "I want credit, control of my work, and clear sharing terms."],
  ["mobile user", "I want a fast, readable experience on an unreliable connection."],
  ["team researcher", "I need reliable provenance and permission-aware retrieval."],
];
const situations = [
  ["onboarding", "Can I find value quickly without pressure?"],
  ["trust", "Can I tell a structural score from factual verification?"],
  ["reliability", "Can I recover from a failed save and keep my work?"],
  ["data rights", "Can I understand and control how my content may be used?"],
];
const disciplines = ["frontend", "backend", "security", "data integrity", "accessibility", "performance", "privacy", "moderation", "analytics", "business model"];

const reviews = [];
for (const [persona, need] of personas) {
  for (const [situation, question] of situations) {
    for (let i = 0; i < 1000; i++) reviews.push({ persona, situation, need, question });
  }
}
const engineeringCases = [];
for (const discipline of disciplines) {
  for (let i = 0; i < 100; i++) engineeringCases.push({ discipline, id: `${discipline}-${i + 1}` });
}

console.log(JSON.stringify({
  disclaimer: "Synthetic scenario enumeration only. These are not real people, Play Store reviews, independent opinions, app tests, or demand/ratings estimates. Counts reflect author-selected equal weights, not market prevalence.",
  reviewScenarios: reviews.length,
  distinctReviewCombinations: personas.length * situations.length,
  engineeringScenarios: engineeringCases.length,
  distinctEngineeringDisciplines: disciplines.length,
  weighting: "5 personas x 4 situations x 1000 repeated records; 10 disciplines x 100 labels",
  reviewExamples: reviews.filter((_, i) => i % 1000 === 0),
  engineeringDisciplines: disciplines,
}, null, 2));
