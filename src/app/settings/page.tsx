import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import SettingsForm, { type SettingsInitial } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await settingsRepo.getByUser(user.id);

  const initial: SettingsInitial = {
    activePersona: (s?.activePersona as "theo" | "nora") ?? "nora",
    proactiveEnabled: s?.proactiveEnabled ?? false,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
    timezone: s?.timezone ?? "Asia/Seoul",
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
