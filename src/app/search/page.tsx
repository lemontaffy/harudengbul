import { requireUser } from "@/lib/currentUser";
import * as personasRepo from "@/db/repo/personas";
import SearchView, { type PersonaOpt } from "@/components/SearchView";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await requireUser();
  const personas: PersonaOpt[] = (await personasRepo.listByUser(user.id)).map((p) => ({
    id: p.id,
    name: p.name?.trim() || "이름 없는 캐릭터",
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="mb-4 font-display text-lg font-semibold">통합 검색</h1>
      <SearchView personas={personas} />
    </main>
  );
}
