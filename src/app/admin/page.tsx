import Link from "next/link";
import { requireAdmin } from "@/lib/currentUser";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold">어드민</h1>
        <Link href="/" className="text-sm text-accent">
          ← 홈
        </Link>
      </div>
      <AdminPanel />
    </main>
  );
}
