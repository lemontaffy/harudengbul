// M1: Cloudflare Tunnel → HTTPS 도달 확인용 임시 페이지.
// M2(로그인)부터 이 라우트는 채팅 홈으로 교체되고 미들웨어 가드가 붙는다.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-2xl font-semibold text-accent">하루등불</h1>
      <p className="text-sm opacity-70">
        M1 OK — 터널 → HTTPS 도달 확인용 페이지
      </p>
    </main>
  );
}
