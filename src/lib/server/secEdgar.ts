import { getRedis } from "@/lib/server/redis";
import { COUNTRY_ISSUER_SEC_CIK } from "@/lib/countryIssuerAliases";

const USER_AGENT = "ChaeGwonSesangBondApp research-contact@chaegwonsesang.example";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_TTL_MS = 24 * 60 * 60 * 1000;
const REDIS_KEY = "us-companies-v1";
const REDIS_TTL_SECONDS = 24 * 60 * 60;

export interface CompanyInfo {
  cik: string;
  ticker: string;
  name: string;
}

// 메모리 캐시만 쓰면 Vercel 콜드스타트마다(=흔함) 약 1MB짜리 회사 목록을
// 매번 새로 받아야 했다(실제 겪음: 회사검색/상세조회 전체가 체감상 느려짐).
// Redis에도 캐시해 콜드스타트와 무관하게 공유되도록 한다.
let cachedCompanies: { list: CompanyInfo[]; fetchedAt: number } | null = null;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`SEC 요청 실패 (${res.status})`);
  return res.text();
}

/** SEC가 매일 갱신하는 전체 상장/등록 회사 티커·CIK 목록 (약 1MB) */
export async function getCompanies(): Promise<CompanyInfo[]> {
  if (cachedCompanies && Date.now() - cachedCompanies.fetchedAt < COMPANY_TTL_MS) {
    return cachedCompanies.list;
  }

  const redis = getRedis();
  if (redis) {
    try {
      const fromRedis = await redis.get<CompanyInfo[]>(REDIS_KEY);
      if (fromRedis) {
        cachedCompanies = { list: fromRedis, fetchedAt: Date.now() };
        return fromRedis;
      }
    } catch {
      // Redis 조회 실패는 무시하고 원본 소스로 폴백한다.
    }
  }

  const text = await fetchText(TICKERS_URL);
  const data = JSON.parse(text) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  const list = Object.values(data).map((v) => ({
    cik: String(v.cik_str).padStart(10, "0"),
    ticker: v.ticker,
    name: v.title,
  }));
  cachedCompanies = { list, fetchedAt: Date.now() };
  if (redis) {
    redis.set(REDIS_KEY, list, { ex: REDIS_TTL_SECONDS }).catch(() => {});
  }
  return list;
}

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * 종목검색(boerse-frankfurt)의 발행자명("Meta Platforms Inc.")과 SEC의
 * 공식 회사명("Meta Platforms, Inc.")은 구두점/대소문자만 다른 경우가
 * 많다(실제 확인: Apple/Meta/Microsoft/Alphabet). 구두점을 제거하고 정확히
 * 일치할 때만 매칭해, 서로 다른 회사가 우연히 이어붙는 오매칭을 막는다.
 */
export async function findCompanyByName(name: string): Promise<CompanyInfo | null> {
  const target = normalizeCompanyName(name);
  if (!target) return null;
  const companies = await getCompanies();
  return companies.find((c) => normalizeCompanyName(c.name) === target) ?? null;
}

/**
 * 회사(findCompanyByName)뿐 아니라 국채(주권) 발행자도 SEC에 CIK가 있는
 * 경우(COUNTRY_ISSUER_SEC_CIK) CIK를 반환한다. 국가 발행자는
 * company_tickers.json에 없어 findCompanyByName만으로는 못 찾는다.
 */
export async function findCikByName(name: string): Promise<string | null> {
  const sovereignCik = COUNTRY_ISSUER_SEC_CIK[name];
  if (sovereignCik) return sovereignCik;
  const company = await findCompanyByName(name);
  return company?.cik ?? null;
}

export interface FilingSummary {
  accessionNumber: string;
  filedDate: string;
  indexUrl: string;
}

async function getFilings(
  cik: string,
  type: string,
  count = 20
): Promise<FilingSummary[]> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${type}&dateb=&owner=include&count=${count}&output=atom`;
  const xml = await fetchText(url);
  const entries: FilingSummary[] = [];
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const acc = block.match(/<accession-number>([^<]+)<\/accession-number>/);
    const href = block.match(/<filing-href>([^<]+)<\/filing-href>/);
    const filed = block.match(/Filed:(?:&lt;\/b&gt;|<\/b>)?\s*([\d-]+)/);
    if (acc && href) {
      entries.push({
        accessionNumber: acc[1],
        filedDate: filed ? filed[1] : "",
        indexUrl: href[1],
      });
    }
  }
  return entries;
}

/** 최근 채권 발행 시 제출되는 가격결정 조건표(FWP) 목록 */
export async function getFwpFilings(cik: string): Promise<FilingSummary[]> {
  return getFilings(cik, "FWP", 30);
}

async function getPrimaryDocUrl(indexUrl: string): Promise<string | null> {
  const html = await fetchText(indexUrl);
  const matches = [...html.matchAll(/href="([^"]+\.htm)"/g)].map((mm) => mm[1]);
  const candidate = matches.find(
    (href) =>
      href.includes("/Archives/edgar/data/") &&
      !href.startsWith("/ix?doc=") &&
      !href.endsWith("-index.htm")
  );
  if (!candidate) return null;
  return candidate.startsWith("http") ? candidate : `https://www.sec.gov${candidate}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|br|li|td)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&#8216;|&#145;|&#146;/g, "'")
    .replace(/&#8220;|&#8221;|&#147;|&#148;/g, '"')
    .replace(/&#8211;|&#8212;|&#150;|&#151;/g, "-")
    .replace(/&#128;|&#8364;/g, "€")
    .replace(/&yen;|&#165;/gi, "¥")
    .replace(/&pound;|&#163;/gi, "£")
    .replace(/&#160;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function parseUsDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
}

function section(text: string, label: string, nextLabels: string[]): string | null {
  const startIdx = text.indexOf(label);
  if (startIdx === -1) return null;
  const rest = text.slice(startIdx + label.length);
  let endIdx = rest.length;
  for (const next of nextLabels) {
    const idx = rest.indexOf(next);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return rest.slice(0, endIdx).trim();
}

/**
 * "Settlement Date (T+5):"처럼 결제일수(T+n)가 발행마다 다른 라벨을 정확한
 * 문자열 대신 정규식으로 찾는다(실제 확인: Meta는 T+2, Microsoft는 T+5).
 */
function sectionByPattern(text: string, startPattern: RegExp, nextLabels: string[]): string | null {
  const m = text.match(startPattern);
  if (!m || m.index === undefined) return null;
  const rest = text.slice(m.index + m[0].length);
  let endIdx = rest.length;
  for (const next of nextLabels) {
    const idx = rest.indexOf(next);
    if (idx !== -1 && idx < endIdx) endIdx = idx;
  }
  return rest.slice(0, endIdx).trim();
}

const KNOWN_LABELS = [
  "Format:",
  "Issue:",
  "Title of Securities:",
  "Title:",
  "Trade Date:",
  "Settlement Date",
  "Denominations:",
  "Ratings:",
  "Ratings*:",
  "Long-Term Debt Ratings*:",
  "Long-Term Debt Ratings:",
  "Maturity Date:",
  "Maturity:",
  "Principal Amount:",
  "Public Offering Price:",
  "Price to Public:",
  "Coupon (Interest Rate):",
  "Coupon:",
  "Day Count Convention:",
  "Day Count Fraction:",
  "Yield to Maturity:",
  "Yield:",
  "Spread to Benchmark Treasury:",
  "Benchmark Treasury:",
  "Benchmark Treasury Price/Yield:",
  "Interest Payment Dates:",
  "Interest Payment Record Dates:",
  "Optional Redemption:",
  "Redemption:",
  "Net Proceeds:",
  "Joint Book-Running Managers:",
  "Passive Bookrunners:",
  "Co-Managers:",
  "Underwriters:",
  "CUSIP / Common Code / ISIN:",
  "CUSIP / ISIN:",
  "CUSIP/ISIN:",
  "CUSIP:",
  "ISIN:",
  "Use of Proceeds:",
  "Issuer:",
];

/** 문서마다 필드 순서가 달라, 배열 순서가 아니라 실제 텍스트에서 다음으로
 * 등장하는 라벨까지를 경계로 잡는다 */
function otherLabels(label: string): string[] {
  return KNOWN_LABELS.filter((l) => l !== label);
}

export interface BondTranche {
  label: string;
  maturityDate: string | null;
  couponRate: number | null;
  isin: string | null;
  rating: string | null;
  couponFrequencyMonths: number | null;
  settlementDate: string | null;
  calcBasis: string | null;
}

export interface FwpParseResult {
  tranches: BondTranche[];
  currency: string;
  issuer: string | null;
}

/** 트랜치(만기별) 라벨을 "2031 Notes" 같은 패턴으로 찾는다. 단일 발행이면 빈 배열. */
function findTrancheLabels(text: string): string[] {
  const matches = text.match(/\b(19|20)\d{2}\s+Notes\b/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

function extractRating(text: string): string | null {
  // 발행사마다 "Ratings:"(예: Meta) 또는 "Long-Term Debt Ratings*:"/
  // "Long-Term Debt Ratings:"(예: Microsoft, 각주 별표가 붙기도 함)로
  // 라벨이 다르다(실제 원문으로 확인).
  const ratingsRaw =
    section(text, "Long-Term Debt Ratings*:", otherLabels("Long-Term Debt Ratings*:")) ??
    section(text, "Long-Term Debt Ratings:", otherLabels("Long-Term Debt Ratings:")) ??
    section(text, "Ratings*:", otherLabels("Ratings*:")) ??
    section(text, "Ratings:", otherLabels("Ratings:"));
  if (!ratingsRaw) return null;

  const classify = (agencyText: string) =>
    /Moody/i.test(agencyText)
      ? "무디스"
      : /Poor|S&P/i.test(agencyText)
        ? "S&P"
        : /Fitch/i.test(agencyText)
          ? "Fitch"
          : null;

  const results: string[] = [];

  // "Aa3 (Moody's Investors Service, Inc.)" 형태
  for (const m of ratingsRaw.matchAll(
    /([A-Za-z0-9+\-]{2,5})\s*\(([^)]*(?:Moody|Poor|Fitch)[^)]*)\)/gi
  )) {
    const agency = classify(m[2]);
    if (agency) results.push(`${agency}: ${m[1]}`);
  }

  // "Aaa (stable) by Moody's Investors Service, Inc." 형태
  for (const m of ratingsRaw.matchAll(
    /([A-Za-z0-9+\-]{2,5})\s*\([^)]{0,20}\)\s*by\s+([^.]{3,60})/gi
  )) {
    const agency = classify(m[2]);
    if (agency && !results.some((r) => r.startsWith(`${agency}:`))) {
      results.push(`${agency}: ${m[1]}`);
    }
  }

  // "Moody's, Aaa (negative outlook); S&P, AAA (stable outlook)" 형태
  // (기관명이 등급보다 먼저 나옴 — 실제 확인: Microsoft)
  for (const m of ratingsRaw.matchAll(
    /(Moody|S&P|Poor|Fitch)[^,;():]*,\s*([A-Za-z0-9+\-]{2,5})\s*\(/gi
  )) {
    const agency = classify(m[1]);
    if (agency && !results.some((r) => r.startsWith(`${agency}:`))) {
      results.push(`${agency}: ${m[2]}`);
    }
  }

  // "Moody's: Aa2 (Stable); S&P: AA+ (Stable)" 형태
  // (기관명과 등급 사이가 쉼표가 아니라 콜론 — 실제 확인: Alphabet/Google)
  for (const m of ratingsRaw.matchAll(
    /(Moody|S&P|Poor|Fitch)[^,;():]*:\s*([A-Za-z0-9+\-]{2,5})\s*\(/gi
  )) {
    const agency = classify(m[1]);
    if (agency && !results.some((r) => r.startsWith(`${agency}:`))) {
      results.push(`${agency}: ${m[2]}`);
    }
  }

  return results.length > 0 ? results.join(" / ") : null;
}

/**
 * 변동금리채(FRN)는 "Coupon: SOFR (...), plus 1.210% per annum (the
 * "Margin")"처럼 표면이율 자리에 마진(스프레드)만 적혀 있다(실제 확인:
 * HSBC Holdings). 정규식은 그 숫자를 그대로 뽑아버려 마치 1.21%가 실제
 * 표면이율인 것처럼 잘못 반영될 수 있다. 이 앱은 고정쿠폰 전제라 애초에
 * 변동금리채를 표현할 수 없으므로, 벤치마크 금리 키워드가 보이면 표면이율을
 * 추출하지 않는다(다른 필드가 이 값을 보고 채권을 걸러낼 수 있도록).
 */
function isFloatingRateCoupon(couponRaw: string): boolean {
  return /\bSOFR\b|\bLIBOR\b|\bEURIBOR\b|\bSONIA\b|\bFloating Rate\b/i.test(couponRaw);
}

function extractDayCountBasis(text: string): string | null {
  const explicit =
    section(text, "Day Count Convention:", otherLabels("Day Count Convention:")) ??
    section(text, "Day Count Fraction:", otherLabels("Day Count Fraction:"));
  const source = explicit ?? text;

  if (/30E\/360|European 30\/360/i.test(source)) return "유럽 30/360";
  if (/30\/360/i.test(explicit ?? "")) return "미국 30/360";
  if (/actual\/actual|act\/act/i.test(source)) return "ACT/ACT";
  if (/actual\/365|act\/365/i.test(source)) return "ACT/365";
  if (/actual\/360|act\/360/i.test(source)) return "ACT/360";
  if (/360-day year (of|consisting of) twelve 30-day months/i.test(source)) return "미국 30/360";
  return null;
}

/**
 * 여러 트랜치를 한 번에 묶어 발행하는 경우, "Interest Payment Dates:"
 * 하나에 트랜치별로 다른 지급일이 "For the 2024 Notes, ... For the 2023
 * Notes, 2028 Notes and 2031 Notes, ..."처럼 절 단위로 나뉘어 들어있다
 * (실제 확인: NVIDIA 2021년 발행 — 2024 Notes는 6/14·12/14, 나머지는
 * 6/15·12/15). trancheLabel을 안 넘기고 전체 텍스트에서 날짜를 세면 서로
 * 다른 트랜치의 지급일이 합쳐져 실제보다 더 자주 지급하는 것처럼(예:
 * 6개월인데 3개월로) 잘못 계산된다. trancheLabel이 언급된 절만 골라 그
 * 안에서만 센다.
 */
function extractCouponFrequencyMonths(text: string, trancheLabel?: string): number | null {
  const raw = section(text, "Interest Payment Dates:", otherLabels("Interest Payment Dates:")) ?? "";
  let scoped = raw;
  if (trancheLabel) {
    const clauses = raw.split(/(?=\bFor the\b)/i);
    const matched = clauses.find((c) => c.includes(trancheLabel));
    if (matched) scoped = matched;
  }
  const monthDayCount = new Set([...scoped.matchAll(/[A-Za-z]+ \d{1,2}\b/g)].map((m) => m[0])).size;
  if (monthDayCount === 1) return 12;
  if (monthDayCount === 2) return 6;
  if (monthDayCount === 4) return 3;
  return null;
}

function extractIssuer(text: string): string | null {
  const raw = section(text, "Issuer:", otherLabels("Issuer:"));
  if (!raw) return null;
  // "NVIDIA Corporation (the "Company")"처럼 뒤에 문서 내 지칭용 정의어구가
  // 붙는 경우가 많다(실제 확인: NVIDIA/Alphabet, Microsoft는 없음). 종목명에
  // 불필요하므로 제거한다.
  const trimmed = raw
    .replace(/\s*\(the\s+"[^"]*"\)\s*$/i, "")
    .trim();
  return trimmed.length > 0 && trimmed.length < 100 ? trimmed : null;
}

function extractSettlementDate(text: string): string | null {
  // 결제일수(T+n)가 발행마다 다르다(예: Meta T+2, Microsoft T+5). "(T+숫자)"
  // 부분을 정규식으로 흡수해 어떤 n이든 찾는다.
  const raw =
    sectionByPattern(text, /Settlement Date\s*\(T\+\d+\):\*?/, otherLabels("Settlement Date")) ??
    section(text, "Settlement Date:", otherLabels("Settlement Date"));
  return raw ? parseUsDate(raw) : null;
}

/** 트랜치 하나가 완결된 블록(Issuer:부터 다음 Issuer: 전까지)을 통째로 파싱한다 */
function parseTrancheBlock(block: string): Omit<BondTranche, "label"> {
  // 발행사마다 "Maturity:"(예: Meta) 또는 "Maturity Date:"(예: Microsoft,
  // Google)로 라벨이 다르다(실제 두 문서 원문으로 확인). 후자를 못 찾으면
  // 표면이율 말고는 아무것도 못 채우는 문제가 있었다.
  const maturityRaw =
    section(block, "Maturity Date:", otherLabels("Maturity Date:")) ??
    section(block, "Maturity:", otherLabels("Maturity:")) ??
    "";
  const couponRaw =
    section(block, "Coupon (Interest Rate):", otherLabels("Coupon (Interest Rate):")) ??
    section(block, "Coupon:", otherLabels("Coupon:")) ??
    "";
  const isinRaw =
    section(block, "CUSIP / Common Code / ISIN:", otherLabels("CUSIP / Common Code / ISIN:")) ??
    section(block, "CUSIP / ISIN:", otherLabels("CUSIP / ISIN:")) ??
    section(block, "CUSIP/ISIN:", otherLabels("CUSIP/ISIN:")) ??
    section(block, "ISIN:", otherLabels("ISIN:")) ??
    "";

  const maturityDate = parseUsDate(maturityRaw);
  const couponMatch = isFloatingRateCoupon(couponRaw) ? null : couponRaw.match(/\d+\.\d+%/);
  const isinMatch = isinRaw.match(/\b[A-Z]{2}[0-9A-Z]{9}\d\b/);

  return {
    maturityDate,
    couponRate: couponMatch ? parseFloat(couponMatch[0]) : null,
    isin: isinMatch ? isinMatch[0] : null,
    rating: extractRating(block),
    couponFrequencyMonths: extractCouponFrequencyMonths(block),
    settlementDate: extractSettlementDate(block),
    calcBasis: extractDayCountBasis(block),
  };
}

/**
 * boerse-frankfurt와 달리 발행사·주간사마다 문서 서식이 달라 완벽하지 않은
 * best-effort 파서. 두 가지 실제 서식을 지원한다:
 * 1) 여러 트랜치가 각자 완결된 블록(Issuer:...Ratings:...CUSIP/ISIN:)으로 반복되는 서식
 * 2) 한 번의 공통 섹션(Ratings/Trade Date 등)에 트랜치별 값만 나열식으로 이어지는 서식
 */
export function parseFwp(html: string): FwpParseResult {
  const text = htmlToText(html).replace(/\s+/g, " ");
  // "$"/"USD"는 문서 어딘가(법률 상투구 등)에 우연히 섞여 나올 수 있어
  // 배제 조건으로 못 쓴다. 대신 실제 통화기호(¥/€/£)나 명칭이 하나라도
  // 있으면 그 통화로, 없으면 USD로 판정한다(실제 확인: Alphabet의 EUR/JPY
  // 유로본드 문서에는 $/USD가 아예 등장하지 않는다).
  const currency = /¥|JPY\b/.test(text)
    ? "JPY"
    : /€|EUR\b/.test(text)
      ? "EUR"
      : /£|GBP\b/.test(text)
        ? "GBP"
        : "USD";

  // "Net Proceeds to Issuer:"/"Gross Proceeds to Issuer:"처럼 실제 트랜치
  // 구분용 라벨이 아닌데 "Issuer:"로 끝나는 문구가 있다(실제 확인: HSBC
  // Holdings — 이 문구 하나 때문에 단일 트랜치 문서가 2개짜리 다중트랜치로
  // 잘못 인식돼 뒷부분(ISIN 포함)이 엉뚱하게 잘려나갔다). "to Issuer:"로
  // 끝나는 매치는 제외한다.
  const issuerIdxs = [...text.matchAll(/(?<!to )Issuer:/g)].map((m) => m.index);

  if (issuerIdxs.length >= 2) {
    const blocks = issuerIdxs.map((start, i) =>
      text.slice(start, issuerIdxs[i + 1] ?? text.length)
    );
    const trancheLabelMatches = text.match(/[\d.]+%[^.]{0,25}?Notes\s+due\s+(19|20)\d{2}/gi) ?? [];
    const tranches = blocks.map((block, i) => ({
      label: trancheLabelMatches[i] ?? "",
      ...parseTrancheBlock(block),
    }));
    return { tranches, currency, issuer: extractIssuer(blocks[0]) };
  }

  const maturityRaw =
    section(text, "Maturity Date:", otherLabels("Maturity Date:")) ??
    section(text, "Maturity:", otherLabels("Maturity:")) ??
    "";
  const trancheLabels = findTrancheLabels(maturityRaw);
  const couponRaw =
    section(text, "Coupon (Interest Rate):", otherLabels("Coupon (Interest Rate):")) ??
    section(text, "Coupon:", otherLabels("Coupon:")) ??
    "";
  const isinRaw =
    section(text, "CUSIP / Common Code / ISIN:", otherLabels("CUSIP / Common Code / ISIN:")) ??
    section(text, "CUSIP / ISIN:", otherLabels("CUSIP / ISIN:")) ??
    section(text, "CUSIP/ISIN:", otherLabels("CUSIP/ISIN:")) ??
    section(text, "ISIN:", otherLabels("ISIN:")) ??
    "";

  const maturityDates = [...maturityRaw.matchAll(/[A-Za-z]+ \d{1,2},\s*\d{4}/g)].map((m) => parseUsDate(m[0]));
  const coupons = isFloatingRateCoupon(couponRaw)
    ? []
    : [...couponRaw.matchAll(/\d+\.\d+%/g)].map((m) => parseFloat(m[0]));
  const isins = [...isinRaw.matchAll(/\b[A-Z]{2}[0-9A-Z]{9}\d\b/g)].map((m) => m[0]);

  // 국채(주권) 발행자 FWP 일부는 라벨 뒤에 콜론이 아예 없다(실제 확인:
  // 대한민국 정부 — "Maturity Date September 16, 2030", "Interest Rate
  // 1.000% per annum", "ISIN US50064FAS39"). 콜론 기반 추출이 실패하면
  // 라벨 바로 뒤 값을 정규식으로 직접 찾는다.
  if (maturityDates.length === 0) {
    const m = text.match(/Maturity Date\s+([A-Za-z]+ \d{1,2},\s*\d{4})/);
    if (m) maturityDates.push(parseUsDate(m[1]));
  }
  if (coupons.length === 0 && !isFloatingRateCoupon(text)) {
    const m = text.match(/Interest Rate\s+(\d+\.\d+)%/);
    if (m) coupons.push(parseFloat(m[1]));
  }
  if (isins.length === 0) {
    const m = text.match(/ISIN\s+([A-Z]{2}[0-9A-Z]{9}\d)\b/);
    if (m) isins.push(m[1]);
  }

  const shared = {
    rating: extractRating(text),
    settlementDate: extractSettlementDate(text),
    calcBasis: extractDayCountBasis(text),
  };

  const tranches: BondTranche[] =
    trancheLabels.length > 0
      ? trancheLabels.map((label, i) => ({
          label,
          maturityDate: maturityDates[i] ?? null,
          couponRate: coupons[i] ?? null,
          isin: isins[i] ?? null,
          couponFrequencyMonths: extractCouponFrequencyMonths(text, label),
          ...shared,
        }))
      : [
          {
            label: "",
            maturityDate: maturityDates[0] ?? null,
            couponRate: coupons[0] ?? null,
            isin: isins[0] ?? null,
            couponFrequencyMonths: extractCouponFrequencyMonths(text),
            ...shared,
          },
        ];

  return { tranches, currency, issuer: extractIssuer(text) };
}

/**
 * 종목검색(boerse-frankfurt)은 신용등급을 제공하지 않아, 같은 회사가 SEC에
 * 낸 가장 최근 FWP에서 등급만 뽑아 대신 채운다. 등급은 발행마다가 아니라
 * 회사 단위로 큰 변화가 없어(무디스/S&P 장기신용등급) 최근 발행분 값을
 * 그대로 써도 무방하다. 최근 파일 하나가 라벨 형식 문제 등으로 실패할 수
 * 있어 최근 3건까지 순서대로 시도한다.
 */
export async function getLatestRating(cik: string): Promise<string | null> {
  const filings = await getFwpFilings(cik);
  for (const filing of filings.slice(0, 3)) {
    try {
      const docUrl = await getPrimaryDocUrl(filing.indexUrl);
      if (!docUrl) continue;
      const html = await fetchText(docUrl);
      const { tranches } = parseFwp(html);
      const rated = tranches.find((t) => t.rating);
      if (rated?.rating) return rated.rating;
    } catch {
      // 이 파일링은 건너뛰고 다음으로 시도한다.
    }
  }
  return null;
}

export async function fetchFwpDetail(
  indexUrl: string,
  cik: string,
  filedDate: string
): Promise<FwpParseResult> {
  const docUrl = await getPrimaryDocUrl(indexUrl);
  if (!docUrl) throw new Error("FWP 문서를 찾을 수 없습니다.");
  const html = await fetchText(docUrl);
  const result = parseFwp(html);

  if (result.tranches.some((t) => !t.calcBasis)) {
    const fallback = await findDayCountBasis(cik, filedDate).catch(() => null);
    if (fallback) {
      for (const t of result.tranches) {
        if (!t.calcBasis) t.calcBasis = fallback;
      }
    }
  }

  return result;
}

export interface BondListItem {
  label: string;
  isin: string | null;
  maturityDate: string | null;
  couponRate: number | null;
  indexUrl: string;
  filedDate: string;
}

/**
 * 종목검색(boerse-frankfurt)처럼 회사 선택 즉시 검색 가능한 평면 목록을 만들기
 * 위해, 최근 N건의 FWP를 미리 받아 트랜치를 하나로 합친다. 목록 단계에서는
 * day-count 424B 폴백 조회 없이 가볍게 처리하고(느려지는 것 방지), 신용등급/
 * 지급주기/날짜계산기준 등 나머지 값은 사용자가 실제 선택했을 때 개별 상세조회로
 * 채운다.
 */
export async function getRecentBondList(
  cik: string,
  maxOfferings = 15,
  // 미국채권검색 목록 용도(기본값)에서는 USD 채권만 남긴다. 종목검색의
  // ISIN 매칭(findBondByIsin)은 boerse-frankfurt가 이미 다른 통화(EUR 등)
  // 채권도 보여주고 있어 통화와 무관하게 전부 찾아야 하므로 false로 끈다.
  usdOnly = true
): Promise<BondListItem[]> {
  const offerings = (await getFwpFilings(cik)).slice(0, maxOfferings);
  const results = await Promise.all(
    offerings.map(async (offering) => {
      try {
        const docUrl = await getPrimaryDocUrl(offering.indexUrl);
        if (!docUrl) return [];
        const html = await fetchText(docUrl);
        const { tranches, currency } = parseFwp(html);
        // 미국채권검색은 USD 채권 전용이다. 같은 회사라도 해외법인 명의로
        // EUR/JPY 등 다른 통화로 발행하는 경우가 있어(실제 확인: Alphabet
        // 의 €9B 유로본드) 이 회사채 오퍼링 전체를 걸러낸다.
        if (usdOnly && currency !== "USD") return [];
        // FWP는 채권 가격결정조건표 말고도 증자 등 다른 공시에도 쓰인다
        // (실제 확인: Alphabet의 $84.75B 자기자본 조달 보도자료가 FWP로
        // 올라온 사례 — 만기/쿠폰/ISIN이 전혀 없어 "만기 -"로만 뜨는 빈
        // 항목이었다). 만기일이 없으면 채권이 아닌 것으로 보고 걸러낸다.
        // 표면이율이 없으면(JPMorgan 등이 다수 발행하는 "구조화 상품"
        // Structured Note — 특정 주가에 연동된 조건부수익 노트로 고정쿠폰
        // 자체가 없음, 실제 확인: "7.5m NEM Digital Barrier Notes",
        // "No interest payments" 명시) 이 앱의 고정쿠폰 현금흐름 모델로는
        // 표현할 수 없으므로 함께 걸러낸다.
        return tranches
          .filter((t) => t.maturityDate !== null && t.couponRate !== null)
          .map((t) => ({
            label: t.label,
            isin: t.isin,
            maturityDate: t.maturityDate,
            couponRate: t.couponRate,
            indexUrl: offering.indexUrl,
            filedDate: offering.filedDate,
          }));
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}

/**
 * 종목검색(boerse-frankfurt)은 이자지급주기/날짜계산기준을 전혀 제공하지
 * 않아 앱 기본값(6개월·미국 30/360)을 채워 넣는데, 실제로는 다른 경우가
 * 있다(실제 확인: Alphabet EUR채 XS3363386460은 연 1회 지급인데 기본값
 * 6개월이 잘못 적용됨). 같은 회사가 SEC에도 등록돼 있고 이 ISIN으로 실제
 * 발행한 적이 있으면, 그 트랜치의 진짜 값(등급/지급주기/날짜계산기준)을
 * 대신 쓴다.
 */
export async function findBondByIsin(cik: string, isin: string): Promise<BondTranche | null> {
  const list = await getRecentBondList(cik, 15, false);
  const match = list.find((item) => item.isin === isin);
  if (!match) return null;
  const detail = await fetchFwpDetail(match.indexUrl, cik, match.filedDate);
  return detail.tranches.find((t) => t.isin === isin) ?? null;
}

/** 같은 회사가 FWP와 비슷한 시점에 낸 424B(본 증권신고서)에서 day-count 관용구를 찾는다 */
export async function findDayCountBasis(
  cik: string,
  fwpFiledDate: string
): Promise<string | null> {
  const filings = await getFilings(cik, "424B", 10);
  const target = filings.find((f) => {
    if (!fwpFiledDate || !f.filedDate) return false;
    const d1 = new Date(fwpFiledDate).getTime();
    const d2 = new Date(f.filedDate).getTime();
    return Math.abs(d1 - d2) <= 3 * 24 * 60 * 60 * 1000;
  });
  if (!target) return null;

  const docUrl = await getPrimaryDocUrl(target.indexUrl);
  if (!docUrl) return null;
  const html = await fetchText(docUrl);
  const text = htmlToText(html).replace(/\s+/g, " ");

  if (/360-day year (of|consisting of) twelve 30-day months/i.test(text)) return "미국 30/360";
  if (/actual\/360|actual number of days.{0,20}360-day/i.test(text)) return "ACT/360";
  if (/actual\/365/i.test(text)) return "ACT/365";
  if (/actual\/actual/i.test(text)) return "ACT/ACT";
  return null;
}
