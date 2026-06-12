import { requireUser } from "@/lib/currentUser";
import type { Role } from "@/lib/persona";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import SettingsForm, { type SettingsInitial } from "@/components/SettingsForm";
import ConnectionsManager from "@/components/ConnectionsManager";
import DiaryReminderSection, {
  type DiaryReminderInitial,
} from "@/components/DiaryReminderSection";
import NavMenu from "@/components/NavMenu";
import CharacterManager, {
  type Character,
  type TriggerAssignments,
} from "@/components/CharacterManager";
import ProfileSection, { type ProfileInitial } from "@/components/ProfileSection";
import LocationSetting, { type LocationInitial } from "@/components/LocationSetting";
import NotificationToggle from "@/components/NotificationToggle";
import GoogleCalendarSection, { type GoogleInitial } from "@/components/GoogleCalendarSection";
import PasswordChange from "@/components/PasswordChange";
import { googleConfigured } from "@/lib/google";
import * as googleRepo from "@/db/repo/google";

export const dynamic = "force-dynamic";

const GOOGLE_FLASH: Record<string, string> = {
  connected: "Google 캘린더 연결됨 ✓",
  error: "연결 중 문제가 생겼어요. 다시 시도해 주세요.",
  norefresh: "재동의가 필요해요(구글 계정 권한에서 앱 제거 후 다시 연결).",
  unconfigured: "서버에 Google 연동이 설정되지 않았어요.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [s, personaRows, googleAcct] = await Promise.all([
    settingsRepo.getByUser(user.id),
    personasRepo.listActiveByUser(user.id),
    googleRepo.getByUser(user.id),
  ]);

  const google: GoogleInitial = {
    configured: googleConfigured(),
    connected: !!googleAcct,
    email: googleAcct?.email ?? null,
    lastSyncAt: googleAcct?.lastSyncAt ? new Date(googleAcct.lastSyncAt).toISOString() : null,
    flash: sp.google ? (GOOGLE_FLASH[sp.google] ?? null) : null,
  };

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
  };

  const counselors = personaRows
    .filter((p) => p.role === "counselor")
    .map((p) => ({ id: p.id, name: p.name?.trim() || "상담가" }));
  const diaryReminder: DiaryReminderInitial = {
    enabled: s?.diaryReminderEnabled ?? false,
    time: s?.diaryReminderTime ?? "21:30",
    personaId: s?.diaryReminderPersonaId ?? null,
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-semibold">설정</h1>
        <NavMenu isAdmin={user.role === "admin"} username={user.username} />
      </div>

      {user.mustChangePassword && (
        <div className="mb-5">
          <PasswordChange forced />
        </div>
      )}

      <div className="flex flex-col gap-6">
        <ConnectionsManager />
        <SettingsForm initial={initial} />
        <DiaryReminderSection initial={diaryReminder} counselors={counselors} />
        <ProfileSection initial={profile} />
        <LocationSetting initial={location} />
        <GoogleCalendarSection initial={google} />
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
