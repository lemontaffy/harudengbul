import Link from "next/link";
import { requireAdmin } from "@/lib/currentUser";
import { getOpenRouterConfig, maskApiKey } from "@/lib/config";
import AdminPanel, { type OpenRouterInitial } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const cfg = await getOpenRouterConfig();

  const orInitial: OpenRouterInitial = {
    model: cfg.modelSource === "db" ? cfg.model : "",
    modelSource: cfg.modelSource,
    baseUrl: cfg.baseUrl,
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← 홈
        </Link>
        <h1 className="text-lg font-semibold">어드민</h1>
        <span className="w-8" />
      </div>
      <AdminPanel orInitial={orInitial} />
    </main>
  );
}
