"use client";

import { useEffect, useState } from "react";

// 날짜 + 실시간 시:분. 하이드레이션 불일치를 피하려 마운트 후에만 렌더.
export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  if (!now) {
    return <div className="h-10" aria-hidden />;
  }
  const date = now.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const time = now.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div>
      <div className="text-2xl font-semibold">{time}</div>
      <div className="text-xs opacity-60">{date}</div>
    </div>
  );
}
