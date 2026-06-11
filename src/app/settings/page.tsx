import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { getOpenRouterConfig, maskApiKey } from "@/lib/config";
import SettingsForm, { type SettingsInitial } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cfg = await getOpenRouterConfig();
  const row = await db.query.settings.findFirst({ where: eq(settings.id, 1) });

  const initial: SettingsInitial = {
    model: cfg.modelSource === "db" ? cfg.model : "",
    modelSource: cfg.modelSource,
    baseUrl: cfg.baseUrl,
    hasApiKey: !!cfg.apiKey,
    apiKeyMasked: maskApiKey(cfg.apiKey),
    apiKeySource: cfg.apiKeySource,
    activePersona: (row?.activePersona as "theo" | "nora") ?? "nora",
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm opacity-60 hover:opacity-100">
          ← 홈
        </Link>
        <h1 className="text-lg font-semibold">설정</h1>
        <span className="w-8" />
      </div>
      <SettingsForm initial={initial} />
    </main>
  );
}
