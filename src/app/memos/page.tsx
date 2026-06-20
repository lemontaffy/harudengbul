import { requireUser } from "@/lib/currentUser";
import * as memosRepo from "@/db/repo/memos";
import MemosView, { type Memo } from "@/components/MemosView";

export const dynamic = "force-dynamic";

export default async function MemosPage() {
  const user = await requireUser();
  const rows = await memosRepo.listOpen(user.id);
  const initialOpen: Memo[] = rows.map((m) => ({
    id: m.id,
    content: m.content,
    done: m.done,
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
    doneAt: m.doneAt ? new Date(m.doneAt).toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">주머니 메모</h1>
      </div>
      <MemosView initialOpen={initialOpen} />
    </main>
  );
}
