
import React from "react";

// A simple SVG progress ring. score/total drive the fill; band, if
// given, is shown as the small caption under the big number.
export function ScoreRing({ score, total, band, size = 140 }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="qe-score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="qe-score-ring-center">
        <div className="qe-score-ring-value">{score} / {total}</div>
        {band != null && <div className="qe-score-ring-band">Band {band}</div>}
      </div>
    </div>
  );
}
