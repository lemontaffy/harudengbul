export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

// 지출 카테고리 도넛(SVG, stroke-dasharray 세그먼트). 가운데 합계.
export default function DonutChart({
  segments,
  centerLabel,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments.map((s, i) => {
            const len = (s.value / total) * C;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return seg;
          })}
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-white text-sm font-semibold"
      >
        {centerLabel ?? ""}
      </text>
    </svg>
  );
}

// 카테고리 색 팔레트
export const DONUT_COLORS = [
  "#E8A86B",
  "#6BA8E8",
  "#8BD08B",
  "#D08BC0",
  "#E8D06B",
  "#9B8BE8",
  "#888EA0",
];
