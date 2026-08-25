import crypto from "crypto";

const HOME_URL = "https://www.boerse-frankfurt.de/";
const DATA_BASE = "https://api.boerse-frankfurt.de/v1/data/";
const SEARCH_BASE = "https://api.boerse-frankfurt.de/v1/search/";
const SALT_TTL_MS = 15 * 60 * 1000;

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

async function getSalt(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedSalt && Date.now() - cachedSalt.fetchedAt < SALT_TTL_MS) {
    return cachedSalt.value;
  }
  const value = await fetchSalt();
  cachedSalt = { value, fetchedAt: Date.now() };
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

/** 특정 발행자의 채권 목록 (라벨/쿠폰/통화/슬러그) */
export async function searchBondsByIssuer(issuer: string): Promise<BondSearchItem[]> {
  const data = await searchRequest("bond_search", {
    issuers: [issuer],
    lang: "de",
    offset: 0,
    limit: 200,
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
}

/** ISIN으로 발행일/만기일/표면이율/거래통화(+상세페이지 slug)를 조회한다 */
export async function getBondDetail(isin: string): Promise<BondDetail> {
  const info = await dataRequest("instrument_information", { isin });
  const mics = info?.mics;
  const mic =
    (typeof info?.defaultMic === "string" ? info.defaultMic : undefined) ??
    (Array.isArray(mics) && typeof mics[0] === "string" ? mics[0] : undefined);
  if (!mic) throw new Error("거래소(MIC) 정보를 찾을 수 없습니다.");

  const master = await dataRequest("master_data_bond", { isin, mic });

  return {
    isin,
    issueDate: typeof master?.issueDate === "string" ? master.issueDate : null,
    maturityDate: typeof master?.maturity === "string" ? master.maturity : null,
    couponRate: typeof master?.cupon === "number" ? master.cupon : null,
    currency: typeof master?.issueCurrency === "string" ? master.issueCurrency : null,
    slug: typeof info?.slug === "string" ? info.slug : null,
  };
}
