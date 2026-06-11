import Link from "next/link";
import { requireUser } from "@/lib/currentUser";
import { getLlmConfig, maskApiKey } from "@/lib/config";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import SettingsForm, { type SettingsInitial } from "@/components/SettingsForm";
import CharacterManager, {
  type Character,
  type TriggerAssignments,
} from "@/components/CharacterManager";
import ProfileSection, { type ProfileInitial } from "@/components/ProfileSection";
import LocationSetting, { type LocationInitial } from "@/components/LocationSetting";
import NotificationToggle from "@/components/NotificationToggle";
import PasswordChange from "@/components/PasswordChange";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [s, llm, personaRows] = await Promise.all([
    settingsRepo.getByUser(user.id),
    getLlmConfig(user.id),
    personasRepo.listActiveByUser(user.id),
  ]);

  const characters: Character[] = personaRows.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role as Role,
    avatarPath: p.avatarPath,
    traits: p.traits,
  }));

  const profile: ProfileInitial = {
    nickname: s?.nickname ?? "",
    about: s?.about ?? "",
    userAvatarPath: s?.userAvatarPath ?? null,
  };

  const location: LocationInitial = {
    locationLat: s?.locationLat != null ? Number(s.locationLat) : null,
    locationLon: s?.locationLon != null ? Number(s.locationLon) : null,
    hasLocation: s?.kmaNx != null && s?.kmaNy != null,
  };

  const triggers: TriggerAssignments = {
    activePersonaId: s?.activePersonaId ?? null,
    diaryReplyPersonaId: s?.diaryReplyPersonaId ?? null,
    morningPersonaId: s?.morningPersonaId ?? null,
    eveningPersonaId: s?.eveningPersonaId ?? null,
  };

  const initial: SettingsInitial = {
    proactiveEnabled: s?.proactiveEnabled ?? false,
    handoffEnabled: s?.handoffEnabled ?? true,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
    llmBaseUrl: llm.baseUrl,
    llmModel: llm.model,
    hasLlmKey: !!llm.apiKey,
    llmKeyMasked: maskApiKey(llm.apiKey),
    llmConfigured: llm.configured,
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

      {user.mustChangePassword && (
        <div className="mb-5">
          <PasswordChange forced />
        </div>
      )}

      <div className="flex flex-col gap-6">
        <SettingsForm initial={initial} />
        <ProfileSection initial={profile} />
        <LocationSetting initial={location} />
        <NotificationToggle />
        <CharacterManager
          initialCharacters={characters}
          initialTriggers={triggers}
        />
      </div>

      {!user.mustChangePassword && (
        <div className="mt-6">
          <PasswordChange forced={false} />
        </div>
      )}
    </main>
  );
}
