// 자체 등급 메달(외부 에셋 없이 SVG) — 구글 플레이 메달 컨셉, 저작권 무관.
// 등급은 '몇 번째 업적인가'(누적 마일스톤)로. 작은 업적도 모두 메달이고, 모을수록 빛난다.

export type MedalTier = "bronze" | "silver" | "gold" | "platinum";

const TIERS: Record<MedalTier, { ring: string; face: string; label: string }> = {
  bronze: { ring: "#b5743a", face: "#e3a878", label: "브론즈" },
  silver: { ring: "#8e98a3", face: "#dfe5ec", label: "실버" },
  gold: { ring: "#c8a01e", face: "#ffdf7a", label: "골드" },
  platinum: { ring: "#3bb8a6", face: "#cdf3ee", label: "플래티넘" },
};

/** 누적 순번(1-based, 오래된 게 1) → 등급. 모을수록 상위 등급. */
export function tierForRank(rank: number): MedalTier {
  if (rank >= 10) return "platinum";
  if (rank >= 6) return "gold";
  if (rank >= 3) return "silver";
  return "bronze";
}

export function tierLabel(tier: MedalTier): string {
  return TIERS[tier].label;
}

export default function Medal({ tier, size = 48 }: { tier: MedalTier; size?: number }) {
  const t = TIERS[tier];
  return (
    <svg width={size} height={size} viewBox="0 0 48 56" aria-hidden role="img">
      {/* 리본 */}
      <polygon points="15,3 24,15 15,21" fill={t.ring} opacity="0.85" />
      <polygon points="33,3 24,15 33,21" fill={t.ring} opacity="0.6" />
      {/* 메달 본체 */}
      <circle cx="24" cy="35" r="16" fill={t.face} stroke={t.ring} strokeWidth="3" />
      <circle cx="24" cy="35" r="11" fill="none" stroke={t.ring} strokeWidth="1.5" opacity="0.4" />
      <text x="24" y="41" textAnchor="middle" fontSize="16" fontWeight="bold" fill={t.ring}>
        ★
      </text>
    </svg>
  );
}
