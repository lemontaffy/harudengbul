import { ChevronDown } from "lucide-react";
import { requireUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import * as personasRepo from "@/db/repo/personas";
import * as connectionsRepo from "@/db/repo/connections";
import * as cssThemesRepo from "@/db/repo/cssThemes";
import SettingsForm, { type SettingsInitial } from "@/components/SettingsForm";
import ConnectionsManager from "@/components/ConnectionsManager";
import DiaryReminderSection, {
  type DiaryReminderInitial,
} from "@/components/DiaryReminderSection";
import ProfileSection, { type ProfileInitial } from "@/components/ProfileSection";
import LocationSetting, { type LocationInitial } from "@/components/LocationSetting";
import NotificationToggle from "@/components/NotificationToggle";
import GoogleCalendarSection, { type GoogleInitial } from "@/components/GoogleCalendarSection";
import PasswordChange from "@/components/PasswordChange";
import LogoutButton from "@/components/LogoutButton";
import AppearanceSection from "@/components/AppearanceSection";
import { googleConfigured } from "@/lib/google";
import * as googleRepo from "@/db/repo/google";

export const dynamic = "force-dynamic";

const GOOGLE_FLASH: Record<string, string> = {
  connected: "Google 캘린더 연결됨 ✓",
  error: "연결 중 문제가 생겼어요. 다시 시도해 주세요.",
  norefresh: "재동의가 필요해요(구글 계정 권한에서 앱 제거 후 다시 연결).",
  unconfigured: "서버에 Google 연동이 설정되지 않았어요.",
};

// 접히는 섹션 — 헤더에 현재 상태 요약 한 줄. 기본 접힘(defaultOpen 으로 예외).
function Section({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  status?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-surface px-4 py-3 ring-1 ring-border [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-medium">{title}</span>
        {status && (
          <span className="ml-auto truncate pl-2 text-[11px] opacity-50">{status}</span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 opacity-40 transition group-open:rotate-180 ${status ? "" : "ml-auto"}`}
        />
      </summary>
      <div className="px-1 pt-2">{children}</div>
    </details>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const [s, personaRows, googleAcct, conns, cssThemes] = await Promise.all([
    settingsRepo.getByUser(user.id),
    personasRepo.listActiveByUser(user.id),
    googleRepo.getByUser(user.id),
    connectionsRepo.listByUser(user.id),
    cssThemesRepo.listForUser(user.id),
  ]);

  const google: GoogleInitial = {
    configured: googleConfigured(),
    connected: !!googleAcct,
    email: googleAcct?.email ?? null,
    lastSyncAt: googleAcct?.lastSyncAt ? new Date(googleAcct.lastSyncAt).toISOString() : null,
    flash: sp.google ? (GOOGLE_FLASH[sp.google] ?? null) : null,
  };

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
  const initial: SettingsInitial = {
    proactiveEnabled: s?.proactiveEnabled ?? false,
    handoffEnabled: s?.handoffEnabled ?? true,
    morningTime: s?.morningTime ?? "08:00",
    eveningTime: s?.eveningTime ?? "22:00",
  };
  const counselors = personaRows
    .filter((p) => p.roles.includes("counselor"))
    .map((p) => ({ id: p.id, name: p.name?.trim() || "상담가" }));
  const diaryReminder: DiaryReminderInitial = {
    enabled: s?.diaryReminderEnabled ?? false,
    time: s?.diaryReminderTime ?? "21:30",
    personaId: s?.diaryReminderPersonaId ?? null,
  };

  // 상태 요약 한 줄들
  const mainConn = conns.find((c) => c.id === s?.activeConnectionId) ?? conns[0];
  const THEME_LABEL: Record<string, string> = { lantern: "등불", dawn: "새벽", paper: "종이" };
  const sum = {
    theme: (THEME_LABEL[s?.theme ?? "lantern"] ?? "등불") + (s?.customCss ? " · 커스텀 CSS" : ""),
    profile: profile.nickname.trim() || "닉네임 미설정",
    noti: initial.proactiveEnabled ? "선제 톡 켜짐" : "선제 톡 꺼짐",
    reminder: diaryReminder.enabled ? `켜짐 · ${diaryReminder.time}` : "꺼짐",
    google: google.connected
      ? google.email ?? "연결됨"
      : google.configured
        ? "연결 안 됨"
        : "미설정",
    location: location.hasLocation ? "설정됨" : "미설정",
    conn:
      conns.length === 0
        ? "없음"
        : `${conns.length}개 · 메인 ${mainConn?.name ?? "미지정"}`,
  };

  return (
    <main className="mx-auto max-w-md p-5">
      <h1 className="font-display mb-5 text-lg font-semibold">설정</h1>

      {user.mustChangePassword && (
        <div className="mb-5">
          <PasswordChange forced />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Section title="화면" status={sum.theme}>
          <AppearanceSection
            initialTheme={s?.theme ?? "lantern"}
            initialCss={s?.customCss ?? ""}
            initialThemes={cssThemes}
          />
        </Section>
        <Section title="프로필" status={sum.profile}>
          <ProfileSection initial={profile} />
        </Section>
        <Section title="알림" status={sum.noti}>
          <div className="flex flex-col gap-3">
            <NotificationToggle />
            <SettingsForm initial={initial} />
          </div>
        </Section>
        <Section title="일기 리마인드" status={sum.reminder}>
          <DiaryReminderSection initial={diaryReminder} counselors={counselors} />
        </Section>
        <Section title="Google 캘린더" status={sum.google} defaultOpen={!!google.flash}>
          <GoogleCalendarSection initial={google} />
        </Section>
        <Section title="위치(날씨)" status={sum.location}>
          <LocationSetting initial={location} />
        </Section>
        <Section title="연결 관리" status={sum.conn}>
          <ConnectionsManager />
        </Section>
        {!user.mustChangePassword && (
          <Section title="비밀번호">
            <PasswordChange forced={false} />
          </Section>
        )}
        <Section title="로그아웃">
          <div className="px-3 py-2">
            <LogoutButton />
          </div>
        </Section>
      </div>
    </main>
  );
}
