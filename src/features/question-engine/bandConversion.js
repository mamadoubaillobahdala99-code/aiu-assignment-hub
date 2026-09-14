
// Approximate IELTS raw-score-to-band conversion tables (out of 40),
// standard published estimates — Cambridge doesn't release one single
// official table, and real test versions vary by about ±1 mark. Good
// enough for practice-test feedback, not a substitute for an official
// Test Report Form.
//
// Listening is identical for Academic and General Training. Reading
// differs: General Training texts are easier, so it takes more correct
// answers to reach the same band.

const LISTENING_TABLE = [
  { min: 39, band: 9.0 },
  { min: 37, band: 8.5 },
  { min: 35, band: 8.0 },
  { min: 32, band: 7.5 },
  { min: 30, band: 7.0 },
  { min: 26, band: 6.5 },
  { min: 23, band: 6.0 },
  { min: 18, band: 5.5 },
  { min: 16, band: 5.0 },
  { min: 13, band: 4.5 },
  { min: 11, band: 4.0 },
  { min: 8, band: 3.5 },
  { min: 6, band: 3.0 },
];

const READING_ACADEMIC_TABLE = [
  { min: 39, band: 9.0 },
  { min: 37, band: 8.5 },
  { min: 35, band: 8.0 },
  { min: 33, band: 7.5 },
  { min: 30, band: 7.0 },
  { min: 27, band: 6.5 },
  { min: 23, band: 6.0 },
  { min: 19, band: 5.5 },
  { min: 15, band: 5.0 },
  { min: 13, band: 4.5 },
  { min: 10, band: 4.0 },
  { min: 8, band: 3.5 },
  { min: 6, band: 3.0 },
];

const READING_GENERAL_TABLE = [
  { min: 40, band: 9.0 },
  { min: 39, band: 8.5 },
  { min: 38, band: 8.0 },
  { min: 36, band: 7.5 },
  { min: 34, band: 7.0 },
  { min: 32, band: 6.5 },
  { min: 30, band: 6.0 },
  { min: 27, band: 5.5 },
  { min: 23, band: 5.0 },
  { min: 19, band: 4.5 },
  { min: 15, band: 4.0 },
  { min: 12, band: 3.5 },
  { min: 9, band: 3.0 },
];

function lookupBand(scoreOutOf40, table) {
  for (const row of table) {
    if (scoreOutOf40 >= row.min) return row.band;
  }
  return scoreOutOf40 > 0 ? 2.5 : 1.0;
}

// score/total: the student's earned points and the total points
// possible for this assignment (whatever they actually are — 6, 18,
// 40...). skill: "reading" | "listening". testType only matters for
// reading: "academic" | "general".
//
// Scaled proportionally to /40 first (Option B, as agreed), then
// looked up — an approximation for anything that isn't already a
// full 40-question test, stated as such wherever this is displayed.
export function computeIeltsBand(score, total, skill, testType) {
  if (!total || total <= 0) return null;
  const scaled = (score / total) * 40;
  const rounded = Math.round(scaled);
  const table = skill === "reading" ? (testType === "general" ? READING_GENERAL_TABLE : READING_ACADEMIC_TABLE) : LISTENING_TABLE;
  return lookupBand(rounded, table);
}
