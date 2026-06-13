import path from "node:path";

// 쓰기 권한 안내 — 업로드 라이브러리들과 기동 점검이 공유(순환 import 방지용 leaf 모듈).

/** 컨테이너 프로세스의 uid/gid(POSIX). Windows 등은 null. */
export function currentIds(): { uid: number | null; gid: number | null } {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const gid = typeof process.getgid === "function" ? process.getgid() : null;
  return { uid, gid };
}

/** 권한 문제 안내 — 정확한 uid:gid + 호스트 경로(docker 볼륨은 ./data/<name> 으로 매핑). */
export function permGuidance(dir: string): string {
  const { uid, gid } = currentIds();
  const owner = uid != null ? `${uid}:${gid ?? uid}` : "<uid>:<gid>";
  const host = `./data/${path.basename(dir)}`;
  return `권한 문제: sudo chown -R ${owner} ${host} (컨테이너 경로 ${dir}) 후 컨테이너 재시작`;
}

export function isPermError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EACCES" || code === "EPERM" || code === "EROFS";
}
