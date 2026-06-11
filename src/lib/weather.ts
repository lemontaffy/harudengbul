// 날씨 — 기상청 단기예보(KMA) 우선, 실패/미설정 시 OpenWeatherMap(OWM) 폴백.
// 키는 전부 env(KMA_API_KEY=data.go.kr Decoding 키, OWM_API_KEY). 코드 하드코딩 금지.

export interface WeatherPayload {
  source: "kma" | "owm";
  tempC: number | null;
  sky: "clear" | "partly" | "cloudy" | null; // 맑음/구름많음/흐림
  pty: number; // 현재 강수형태(KMA 코드, OWM은 0/1/3 근사)
  hasRain: boolean;
  hasSnow: boolean;
  summary: string;
  fetchedAt: string;
}

// ── 기상청 격자 변환 (DFS / LCC, 공식 상수) ──
export function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0, SLAT2 = 60.0; // 표준 위도
  const OLON = 126.0, OLAT = 38.0; // 기준점 경위도
  const XO = 43, YO = 136; // 기준점 격자
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}

// ── KMA 발표 base_date/base_time (KST, 02·05·…·23시 + 10분 후 제공) ──
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

function kstParts(now: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour"), mi: g("minute") };
}

export function kmaBaseDateTime(now = new Date()): { base_date: string; base_time: string } {
  const { y, mo, d, h, mi } = kstParts(now);
  let chosen = -1;
  for (const bh of BASE_HOURS) if (h > bh || (h === bh && mi >= 10)) chosen = bh;
  const date = new Date(Date.UTC(y, mo - 1, d)); // 날짜 산술은 UTC 기준으로
  if (chosen === -1) {
    chosen = 23;
    date.setUTCDate(date.getUTCDate() - 1);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return { base_date: `${yyyy}${mm}${dd}`, base_time: String(chosen).padStart(2, "0") + "00" };
}

async function getJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function skyLabel(sky: "clear" | "partly" | "cloudy" | null, hasRain: boolean, hasSnow: boolean): string {
  if (hasSnow) return "눈";
  if (hasRain) return "비";
  if (sky === "clear") return "맑음";
  if (sky === "partly") return "구름 많음";
  if (sky === "cloudy") return "흐림";
  return "—";
}

// ── KMA 단기예보 ──
export async function fetchKma(nx: number, ny: number): Promise<WeatherPayload | null> {
  const key = process.env.KMA_API_KEY?.trim();
  if (!key) return null;
  try {
    const { base_date, base_time } = kmaBaseDateTime();
    const qs = new URLSearchParams({
      serviceKey: key,
      pageNo: "1",
      numOfRows: "300",
      dataType: "JSON",
      base_date,
      base_time,
      nx: String(nx),
      ny: String(ny),
    });
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${qs}`;
    const json = (await getJson(url)) as {
      response?: { body?: { items?: { item?: KmaItem[] } } };
    };
    const items = json?.response?.body?.items?.item ?? [];
    if (items.length === 0) return null;

    const slots = [...new Set(items.map((i) => i.fcstDate + i.fcstTime))].sort();
    const first = slots[0];
    const near = slots.slice(0, 6); // 다음 ~6시간
    const val = (cat: string, slot: string) =>
      items.find((i) => i.category === cat && i.fcstDate + i.fcstTime === slot)?.fcstValue;

    const tmpRaw = val("TMP", first);
    const tempC = tmpRaw != null && tmpRaw !== "" ? Math.round(Number(tmpRaw)) : null;
    const skyRaw = val("SKY", first);
    const sky = skyRaw === "1" ? "clear" : skyRaw === "3" ? "partly" : skyRaw === "4" ? "cloudy" : null;

    let hasRain = false;
    let hasSnow = false;
    let pty = 0;
    for (const slot of near) {
      const p = Number(val("PTY", slot) ?? 0);
      if (slot === first) pty = p;
      if ([1, 2, 4, 5, 6].includes(p)) hasRain = true;
      if ([2, 3, 6, 7].includes(p)) hasSnow = true;
    }

    return {
      source: "kma",
      tempC,
      sky,
      pty,
      hasRain,
      hasSnow,
      summary: skyLabel(sky, hasRain, hasSnow),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[weather] KMA 실패:", (err as Error)?.message);
    return null;
  }
}

interface KmaItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

// ── OpenWeatherMap (폴백) ──
export async function fetchOwm(lat: number, lon: number): Promise<WeatherPayload | null> {
  const key = process.env.OWM_API_KEY?.trim();
  if (!key) return null;
  try {
    const qs = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      appid: key,
      units: "metric",
      lang: "kr",
    });
    const url = `https://api.openweathermap.org/data/2.5/weather?${qs}`;
    const json = (await getJson(url)) as {
      main?: { temp?: number };
      weather?: { id?: number; description?: string }[];
    };
    const id = json?.weather?.[0]?.id ?? 800;
    const hasRain = id >= 200 && id < 600;
    const hasSnow = id >= 600 && id < 700;
    const sky =
      id === 800 ? "clear" : id === 801 || id === 802 ? "partly" : "cloudy";
    const temp = json?.main?.temp;
    return {
      source: "owm",
      tempC: typeof temp === "number" ? Math.round(temp) : null,
      sky,
      pty: hasSnow ? 3 : hasRain ? 1 : 0,
      hasRain,
      hasSnow,
      summary: json?.weather?.[0]?.description || skyLabel(sky, hasRain, hasSnow),
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[weather] OWM 실패:", (err as Error)?.message);
    return null;
  }
}

/** KMA 우선 → 실패/미설정 시 OWM 폴백. 둘 다 안 되면 null. */
export async function getWeather(
  nx: number,
  ny: number,
  lat: number | null,
  lon: number | null,
): Promise<WeatherPayload | null> {
  const kma = await fetchKma(nx, ny);
  if (kma) return kma;
  if (lat != null && lon != null) return fetchOwm(lat, lon);
  return null;
}

export function weatherSourceConfigured(): boolean {
  return !!(process.env.KMA_API_KEY?.trim() || process.env.OWM_API_KEY?.trim());
}
