import crypto from "crypto";
import { getRedis } from "@/lib/server/redis";

// boerse-frankfurt.de가 live.deutsche-boerse.com으로 리브랜딩/이전되면서 옛
// 도메인은 리다이렉트만 거쳐가는데(약 2~3초 추가 소요), 홈페이지+메인 JS
// 번들(2MB대)을 매번 새로 받다 보니 salt 하나 얻는 데만 8초 안팎이 걸려
// Vercel 함수 타임아웃을 넘기곤 했다. 새 도메인으로 바로 요청해 리다이렉트
// 구간을 줄이고, 아래 Redis 캐시로 콜드스타트마다 다시 받지 않게 한다.
const HOME_URL = "https://live.deutsche-boerse.com/";
const DATA_BASE = "https://api.boerse-frankfurt.de/v1/data/";
const SEARCH_BASE = "https://api.boerse-frankfurt.de/v1/search/";
const SALT_TTL_MS = 15 * 60 * 1000;
const REDIS_SALT_KEY = "bf-salt-v1";

let cachedSalt: { value: string; fetchedAt: number } | null = null;

async function fetchSalt(): Promise<string> {
  const homeRes = await fetch(HOME_URL, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!homeRes.ok) throw new Error("boerse-frankfurt 홈페이지에 접속할 수 없습니다.");
  const homeHtml = await homeRes.text();
  const fileMatch = homeHtml.match(/src="(main\.[\w-]*\.js)"/);
  if (!fileMatch) throw new Error("메인 스크립트 파일을 찾을 수 없습니다.");
  const jsRes = await fetch(HOME_URL + fileMatch[1], { headers: { "user-agent": "Mozilla/5.0" } });
  if (!jsRes.ok) throw new Error("메인 스크립트를 불러올 수 없습니다.");
  const jsText = await jsRes.text();
  const saltMatch = jsText.match(/salt:"(\w*)"/);
  if (!saltMatch) throw new Error("salt 값을 찾을 수 없습니다.");
  return saltMatch[1];
}

/**
 * salt는 메모리 캐시(같은 서버리스 인스턴스 안)뿐 아니라 Upstash Redis에도
 * 캐시해, 콜드스타트로 인스턴스가 새로 뜰 때마다(=대부분의 요청) 2MB대 JS
 * 번들을 다시 받는 8초짜리 지연이 반복되지 않게 한다(브라질채권검색 캐시와
 * 동일한 이유).
 */
async function getSalt(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedSalt && Date.now() - cachedSalt.fetchedAt < SALT_TTL_MS) {
    return cachedSalt.value;
  }

  const redis = getRedis();
  if (!forceRefresh && redis) {
    try {
      const cached = await redis.get<string>(REDIS_SALT_KEY);
      if (cached) {
        cachedSalt = { value: cached, fetchedAt: Date.now() };
        return cached;
      }
    } catch {
      // Redis 조회 실패는 무시하고 원본에서 새로 받는다.
    }
  }

  const value = await fetchSalt();
  cachedSalt = { value, fetchedAt: Date.now() };
  if (redis) {
    redis.set(REDIS_SALT_KEY, value, { ex: SALT_TTL_MS / 1000 }).catch(() => {});
  }
  return value;
}

function buildSecurityHeaders(url: string, salt: string): Record<string, string> {
  const now = new Date();
  const clientDate = now.toISOString();
  const traceId = crypto
    .createHash("md5")
    .update(clientDate + url + salt)
    .digest("hex");
  const pad = (n: number) => String(n).padStart(2, "0");
  const xSecurityBase = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  const xSecurity = crypto.createHash("md5").update(xSecurityBase).digest("hex");
  return {
    "client-date": clientDate,
    "x-client-traceid": traceId,
    "x-security": xSecurity,
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function withSaltRetry<T>(
  run: (salt: string) => Promise<{ res: Response; data: T }>
): Promise<T> {
  let salt = await getSalt();
  let { res, data } = await run(salt);
  if (res.status === 401 || res.status === 403) {
    salt = await getSalt(true);
    ({ res, data } = await run(salt));
  }
  if (!res.ok) {
    throw new Error(`boerse-frankfurt 요청 실패 (${res.status})`);
  }
  return data;
}

async function dataRequest(
  fn: string,
  params: Record<string, string>
): Promise<Record<string, unknown> | null> {
  return withSaltRetry(async (salt) => {
    const url = `${DATA_BASE}${fn}?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: {
        ...buildSecurityHeaders(url, salt),
        accept: "application/json, text/plain, */*",
      },
    });
    return { res, data: (await safeJson(res)) as Record<string, unknown> | null };
  });
}

async function searchRequest(
  fn: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  return withSaltRetry(async (salt) => {
    const url = `${SEARCH_BASE}${fn}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...buildSecurityHeaders(url, salt),
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(body),
    });
    return { res, data: (await safeJson(res)) as Record<string, unknown> | null };
  });
}

async function searchGetRequest(
  fn: string,
  params: Record<string, string>
): Promise<Record<string, unknown> | null> {
  return withSaltRetry(async (salt) => {
    const url = `${SEARCH_BASE}${fn}?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
      headers: {
        ...buildSecurityHeaders(url, salt),
        accept: "application/json, text/plain, */*",
      },
    });
    return { res, data: (await safeJson(res)) as Record<string, unknown> | null };
  });
}

/** bond_search_criteria_data의 발행자(issuer) 전체 목록 (약 4,600여개) */
export async function getIssuers(): Promise<string[]> {
  const data = await searchGetRequest("bond_search_criteria_data", { lang: "de" });
  const issuers = data?.issuers;
  return Array.isArray(issuers) ? (issuers as string[]) : [];
}

export interface BondSearchItem {
  isin: string;
  name: string;
  coupon: number | null;
  currency: string | null;
  slug: string | null;
}

/**
 * 특정 발행자의 채권 목록 (라벨/쿠폰/통화/슬러그). limit을 200에서 1000으로
 * 올렸다 — 발행 종목이 많은 발행자(예: 독일 국채 recordsTotal=225건)는
 * 200으로 잘려 일부가 누락됐음을 확인.
 */
export async function searchBondsByIssuer(issuer: string): Promise<BondSearchItem[]> {
  const data = await searchRequest("bond_search", {
    issuers: [issuer],
    lang: "de",
    offset: 0,
    limit: 1000,
    sorting: "NAME",
    sortOrder: "ASC",
  });
  const items = data?.data;
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const record = item as Record<string, unknown>;
    const name = record.name as { originalValue?: string } | undefined;
    const keyData = record.keyData as
      | { coupon?: number; currency?: { originalValue?: string } }
      | undefined;
    return {
      isin: String(record.isin ?? ""),
      name: name?.originalValue ?? String(record.isin ?? ""),
      coupon: typeof keyData?.coupon === "number" ? keyData.coupon : null,
      currency: keyData?.currency?.originalValue ?? null,
      slug: typeof record.slug === "string" ? record.slug : null,
    };
  });
}

export interface BondDetail {
  isin: string;
  issueDate: string | null;
  maturityDate: string | null;
  couponRate: number | null;
  currency: string | null;
  slug: string | null;
  bidYield: number | null;
  askYield: number | null;
  lastPriceYield: number | null;
}

/**
 * quote_box 응답에서 수익률로 보이는 숫자 필드를 후보 키 목록으로 찾는다.
 * 실제 필드명이 검증되지 않았으므로(사내망에서 api.boerse-frankfurt.de를
 * 직접 호출해 확인할 수 없었음) 알려진 후보를 순서대로 시도한다. 전부
 * 실패하면 quote_box 원본을 서버 로그에 남겨, 배포 환경에서 실제 키를
 * 확인한 뒤 아래 후보 배열에 추가할 수 있게 한다.
 */
function pickYield(
  data: Record<string, unknown> | null | undefined,
  candidates: string[]
): number | null {
  if (!data) return null;
  for (const key of candidates) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

const BID_YIELD_KEYS = ["bidYield", "yieldBid", "yieldOnBid", "bidSideYield"];
const ASK_YIELD_KEYS = ["askYield", "yieldAsk", "yieldOnAsk", "askSideYield"];
const LAST_YIELD_KEYS = [
  "lastPriceYield",
  "yield",
  "currentYield",
  "yieldLastPrice",
  "yieldOnLastPrice",
];

export interface BondQuote {
  bidYield: number | null;
  askYield: number | null;
  lastPriceYield: number | null;
}

/**
 * ISIN+MIC로 현재가/호가 정보(quote_box)를 조회해 매수(ask)/매도(bid)/최종가
 * 기준 수익률을 뽑아낸다. boerse-frankfurt.de가 사이트에서 "최종가와 매수호가
 * 기준 수익률을 함께 제공한다"고 밝힌 것에 맞춰 최소 이 두 값을 기대한다.
 * 후보 필드명이 전부 안 맞으면 null들을 반환하고 원본을 로그로 남긴다.
 */
export async function getBondQuote(isin: string, mic: string): Promise<BondQuote> {
  const quote = await dataRequest("quote_box", { isin, mic });

  const result: BondQuote = {
    bidYield: pickYield(quote, BID_YIELD_KEYS),
    askYield: pickYield(quote, ASK_YIELD_KEYS),
    lastPriceYield: pickYield(quote, LAST_YIELD_KEYS),
  };

  if (
    quote &&
    result.bidYield === null &&
    result.askYield === null &&
    result.lastPriceYield === null
  ) {
    console.warn(
      `[boerseFrankfurt] quote_box(${isin})에서 수익률 후보 필드를 찾지 못했습니다. 원본:`,
      JSON.stringify(quote)
    );
  }

  return result;
}

/** ISIN으로 발행일/만기일/표면이율/거래통화(+상세페이지 slug)와 매수/매도 수익률을 조회한다 */
export async function getBondDetail(isin: string): Promise<BondDetail> {
  const info = await dataRequest("instrument_information", { isin });
  const mics = info?.mics;
  const mic =
    (typeof info?.defaultMic === "string" ? info.defaultMic : undefined) ??
    (Array.isArray(mics) && typeof mics[0] === "string" ? mics[0] : undefined);
  if (!mic) throw new Error("거래소(MIC) 정보를 찾을 수 없습니다.");

  const master = await dataRequest("master_data_bond", { isin, mic });

  // 수익률 조회는 부가 정보라, 실패해도 나머지(발행일/만기일 등) 조회는 살린다.
  const quote = await getBondQuote(isin, mic).catch((err) => {
    console.warn(`[boerseFrankfurt] quote_box(${isin}) 조회 실패:`, err);
    return { bidYield: null, askYield: null, lastPriceYield: null } as BondQuote;
  });

  return {
    isin,
    issueDate: typeof master?.issueDate === "string" ? master.issueDate : null,
    maturityDate: typeof master?.maturity === "string" ? master.maturity : null,
    couponRate: typeof master?.cupon === "number" ? master.cupon : null,
    currency: typeof master?.issueCurrency === "string" ? master.issueCurrency : null,
    slug: typeof info?.slug === "string" ? info.slug : null,
    bidYield: quote.bidYield,
    askYield: quote.askYield,
    lastPriceYield: quote.lastPriceYield,
  };
}
