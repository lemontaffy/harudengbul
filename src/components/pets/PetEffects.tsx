"use client";

export type EffectType = "hearts" | "sparkle" | "notes" | "zzz";
export interface ActiveEffect {
  id: number;
  type: EffectType;
  xPct: number;
  yPct: number;
}

const EMOJI: Record<EffectType, string> = {
  hearts: "❤️",
  sparkle: "✨",
  notes: "♪",
  zzz: "💤",
};

// CSS만(transform/opacity). 동시 개수 제한·reduced-motion 게이트는 호출부(RoomView)가 담당.
export default function PetEffects({ effects }: { effects: ActiveEffect[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
        @keyframes petFloat {
          0% { transform: translateY(0) scale(.7); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(-46px) scale(1.05); opacity: 0; }
        }
        @keyframes petPop {
          0% { transform: scale(.3); opacity: 0; }
          45% { transform: scale(1.25); opacity: 1; }
          100% { transform: scale(.6); opacity: 0; }
        }
      `}</style>
      {effects.map((e) => (
        <div key={e.id} className="absolute" style={{ left: `${e.xPct}%`, top: `${e.yPct}%` }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute text-lg"
              style={{
                left: `${(i - 1) * 13}px`,
                animation: `${e.type === "sparkle" ? "petPop" : "petFloat"} 1.25s ease-out forwards`,
                animationDelay: `${i * 0.12}s`,
              }}
            >
              {EMOJI[e.type]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
