import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../client";
import { settings, weatherCache } from "../schema";
import type { WeatherPayload } from "../../lib/weather";

/** weatherJob 용 — 사용자들이 쓰는 distinct 격자 + 대표 위/경도(격자 단위 dedup, DELTA §4). */
export async function distinctGrids() {
  return db
    .select({
      nx: settings.kmaNx,
      ny: settings.kmaNy,
      lat: sql<string | null>`min(${settings.locationLat})`,
      lon: sql<string | null>`min(${settings.locationLon})`,
    })
    .from(settings)
    .where(isNotNull(settings.kmaNx))
    .groupBy(settings.kmaNx, settings.kmaNy);
}

export async function upsert(
  nx: number,
  ny: number,
  payload: WeatherPayload,
  hasRain: boolean,
  hasSnow: boolean,
  fetchedAt: Date,
) {
  await db
    .insert(weatherCache)
    .values({ kmaNx: nx, kmaNy: ny, payload, hasRain, hasSnow, fetchedAt })
    .onConflictDoUpdate({
      target: [weatherCache.kmaNx, weatherCache.kmaNy],
      set: { payload, hasRain, hasSnow, fetchedAt },
    });
}

export async function getByGrid(nx: number, ny: number) {
  return db.query.weatherCache.findFirst({
    where: and(eq(weatherCache.kmaNx, nx), eq(weatherCache.kmaNy, ny)),
  });
}
