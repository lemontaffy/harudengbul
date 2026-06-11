import { getCurrentUser } from "@/lib/currentUser";
import * as settingsRepo from "@/db/repo/settings";
import * as weatherRepo from "@/db/repo/weather";
import { getWeather, weatherSourceConfigured, type WeatherPayload } from "@/lib/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FRESH_MS = 2 * 60 * 60 * 1000; // 2시간

// 대시보드 on-demand 날씨. 캐시 신선하면 그대로, 아니면 즉시 조회·upsert.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const s = await settingsRepo.getByUser(user.id);
  if (s?.kmaNx == null || s?.kmaNy == null) {
    return Response.json({ configured: false });
  }
  if (!weatherSourceConfigured()) {
    return Response.json({ configured: true, unavailable: true });
  }

  const nx = s.kmaNx;
  const ny = s.kmaNy;
  const lat = s.locationLat != null ? Number(s.locationLat) : null;
  const lon = s.locationLon != null ? Number(s.locationLon) : null;

  const cached = await weatherRepo.getByGrid(nx, ny);
  const fresh =
    cached?.fetchedAt &&
    Date.now() - new Date(cached.fetchedAt).getTime() < FRESH_MS &&
    cached.payload;

  let payload = fresh ? (cached!.payload as WeatherPayload) : null;
  if (!payload) {
    payload = await getWeather(nx, ny, lat, lon);
    if (payload) {
      await weatherRepo.upsert(
        nx,
        ny,
        payload,
        payload.hasRain,
        payload.hasSnow,
        new Date(payload.fetchedAt),
      );
    } else if (cached?.payload) {
      payload = cached.payload as WeatherPayload; // 조회 실패 시 옛 캐시라도
    }
  }

  if (!payload) return Response.json({ configured: true, unavailable: true });
  return Response.json({ configured: true, ...payload });
}
