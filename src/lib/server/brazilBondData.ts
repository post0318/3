import { Redis } from "@upstash/redis";
import { after } from "next/server";

const CSV_URL =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
/** 이 시간 안이면 캐시를 그대로 쓴다. 지나면 "일단 옛 값을 보여주고 뒤에서 갱신"한다(아래 참고) */
const FRESH_TTL_MS = 6 * 60 * 60 * 1000;
/** Redis에 값을 얼마나 오래 들고 있을지. FRESH_TTL_MS보다 훨씬 길게 잡아, 접속이
 *  뜸해도(예: 며칠간 요청 없음) 값 자체는 남아있어 최초 요청도 느려지지 않게 한다. */
const REDIS_TTL_SECONDS = 3 * 24 * 60 * 60;
const REDIS_KEY = "br-ntnf-v1";

/** CSV의 "Tipo Titulo" 값. NTN-F(고정금리 반기이표채)의 현재 소매판매명이 이것이다 */
const NTNF_TYPE_PREFIX = "Tesouro Prefixado com Juros Semestrais;";

export interface BrazilBondItem {
  maturityDate: string; // ISO (YYYY-MM-DD)
  buyRate: number | null; // Taxa Compra Manha (%)
  sellRate: number | null; // Taxa Venda Manha (%)
  buyPrice: number | null; // PU Compra Manha
  sellPrice: number | null; // PU Venda Manha
}

type Payload = { asOfDate: string; items: BrazilBondItem[] };
type CachedPayload = Payload & { fetchedAt: number };

let memoryCache: CachedPayload | null = null;
let refreshing = false;

function getRedis(): Redis | null {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

function parseBrDate(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseBrNumber(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

async function fetchAndParse(): Promise<Payload> {
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`tesourotransparente.gov.br 요청 실패 (${res.status})`);
  }
  const text = await res.text();

  const rows: {
    maturityDate: string;
    dataBase: string;
    buyRate: number | null;
    sellRate: number | null;
    buyPrice: number | null;
    sellPrice: number | null;
  }[] = [];

  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.startsWith(NTNF_TYPE_PREFIX)) continue;
    const cols = line.split(";");
    if (cols.length < 7) continue;
    const maturityDate = parseBrDate(cols[1]);
    const dataBase = parseBrDate(cols[2]);
    if (!maturityDate || !dataBase) continue;
    rows.push({
      maturityDate,
      dataBase,
      buyRate: parseBrNumber(cols[3]),
      sellRate: parseBrNumber(cols[4]),
      buyPrice: parseBrNumber(cols[5]),
      sellPrice: parseBrNumber(cols[6]),
    });
  }

  if (rows.length === 0) {
    throw new Error("NTN-F 데이터를 찾을 수 없습니다.");
  }

  let asOfDate = rows[0].dataBase;
  for (const r of rows) {
    if (r.dataBase > asOfDate) asOfDate = r.dataBase;
  }

  const items: BrazilBondItem[] = rows
    .filter((r) => r.dataBase === asOfDate)
    .map(({ maturityDate, buyRate, sellRate, buyPrice, sellPrice }) => ({
      maturityDate,
      buyRate,
      sellRate,
      buyPrice,
      sellPrice,
    }))
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

  return { asOfDate, items };
}

/** 백그라운드에서 최신 데이터를 받아 메모리/Redis 캐시를 모두 새로 채운다(응답을 막지 않음) */
async function refreshInBackground(redis: Redis | null) {
  if (refreshing) return;
  refreshing = true;
  try {
    const payload = await fetchAndParse();
    const cached: CachedPayload = { ...payload, fetchedAt: Date.now() };
    memoryCache = cached;
    if (redis) {
      await redis.set(REDIS_KEY, cached, { ex: REDIS_TTL_SECONDS }).catch(() => {});
    }
  } catch {
    // 갱신 실패는 무시한다. 기존 캐시(오래됐어도)는 그대로 남아 다음 요청에도
    // 계속 쓰이고, 다음 요청에서 다시 갱신을 시도한다.
  } finally {
    refreshing = false;
  }
}

/**
 * 브라질 재무부(Tesouro Nacional) 공식 오픈데이터 포털 tesourotransparente.gov.br의
 * CSV(매일 갱신, 2006년부터의 전체 이력, 인증 불필요)에서 NTN-F(소매판매명
 * "Tesouro Prefixado com Juros Semestrais")의 최신 기준일자(Data Base) 시세만
 * 골라 반환한다. 옛 JSON API(treasurybondsinfo.json)는 2025-08부터 죽었고,
 * B3 공식 API는 B2B 전용이라 개인/자동화 접근이 불가해 이 경로를 쓴다.
 *
 * 파일이 14MB대라 받는 데만 20초 안팎이 걸린다. Upstash Redis(Marketplace
 * 연동, KV_REST_API_*)에 파싱 결과(작은 JSON, 콜드스타트와 무관하게 공유됨)를
 * 캐시해두지만, 캐시가 FRESH_TTL_MS(6시간)를 넘으면 "그 요청까지" 20초가
 * 걸리는 문제가 있었다(브라질채권검색 목록이 뜨는 순간이 느려짐). 이제는
 * stale-while-revalidate로 처리한다: 오래된 캐시라도 일단 그대로 즉시
 * 반환하고, 갱신은 응답을 보낸 뒤 백그라운드(after())에서 조용히 진행해
 * 다음 요청부터 최신값을 받는다. 사용자 입장에서 느려지는 경우는 캐시가
 * 아예 없는 최초 1회(또는 Redis가 완전히 비어있는 상태)뿐이다.
 */
export async function fetchLatestNtnF(): Promise<Payload> {
  const now = Date.now();

  if (memoryCache) {
    if (now - memoryCache.fetchedAt < FRESH_TTL_MS) {
      return memoryCache;
    }
    after(() => refreshInBackground(getRedis()));
    return memoryCache;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get<CachedPayload>(REDIS_KEY);
      if (cached) {
        memoryCache = cached;
        if (now - cached.fetchedAt >= FRESH_TTL_MS) {
          after(() => refreshInBackground(redis));
        }
        return cached;
      }
    } catch {
      // Redis 조회 실패는 무시하고 원본 소스로 폴백한다.
    }
  }

  // 캐시가 전혀 없는 상태(최초 요청 또는 Redis 미설정/완전 비어있음)라
  // 어쩔 수 없이 여기서만 동기적으로 원본을 받는다.
  const payload = await fetchAndParse();
  const cached: CachedPayload = { ...payload, fetchedAt: now };
  memoryCache = cached;

  if (redis) {
    redis.set(REDIS_KEY, cached, { ex: REDIS_TTL_SECONDS }).catch(() => {});
  }

  return cached;
}
