// 빈 상태 CTA용 — 비서 역할 페르소나(첫 번째)를 찾는다. 이름 하드코딩 금지.
export interface SecretaryRef {
  exists: boolean;
  name: string; // 실제 페르소나 이름(없으면 "")
  href: string; // 있으면 그 대화방, 없으면 /characters
}

export function findSecretary(
  personas: { id: number; name: string | null; roles: string[] }[],
): SecretaryRef {
  const s = personas.find((p) => p.roles.includes("secretary"));
  if (s) return { exists: true, name: s.name?.trim() || "비서", href: `/chat/${s.id}` };
  return { exists: false, name: "", href: "/characters" };
}
