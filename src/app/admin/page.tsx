import { requireAdmin } from "@/lib/currentUser";
import AdminPanel from "@/components/AdminPanel";
import NavMenu from "@/components/NavMenu";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin();

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">어드민</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </div>
      <AdminPanel />
    </main>
  );
}
