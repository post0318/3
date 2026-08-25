const USER_AGENT = "ChaeGwonSesangBondApp research-contact@chaegwonsesang.example";
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_TTL_MS = 24 * 60 * 60 * 1000;

export interface CompanyInfo {
  cik: string;
  ticker: string;
  name: string;
}

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
  return list;
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
  return getFilings(cik, "FWP", 20);
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
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, "-")
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

const KNOWN_LABELS = [
  "Format:",
  "Issue:",
  "Trade Date:",
  "Settlement Date",
  "Denominations:",
  "Ratings:",
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
  "Optional Redemption:",
  "Redemption:",
  "Net Proceeds:",
  "Joint Book-Running Managers:",
  "Passive Bookrunners:",
  "Co-Managers:",
  "Underwriters:",
  "CUSIP / ISIN:",
  "CUSIP/ISIN:",
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
  const ratingsRaw = section(text, "Ratings:", otherLabels("Ratings:"));
  if (!ratingsRaw) return null;

  const classify = (agencyText: string) =>
    /Moody/i.test(agencyText)
      ? "무디스"
      : /Poor/i.test(agencyText)
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

  return results.length > 0 ? results.join(" / ") : null;
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

function extractCouponFrequencyMonths(text: string): number | null {
  const raw = section(text, "Interest Payment Dates:", otherLabels("Interest Payment Dates:")) ?? "";
  const monthDayCount = new Set([...raw.matchAll(/[A-Za-z]+ \d{1,2}\b/g)].map((m) => m[0])).size;
  if (monthDayCount === 1) return 12;
  if (monthDayCount === 2) return 6;
  if (monthDayCount === 4) return 3;
  return null;
}

function extractIssuer(text: string): string | null {
  const raw = section(text, "Issuer:", otherLabels("Issuer:"));
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length < 100 ? trimmed : null;
}

function extractSettlementDate(text: string): string | null {
  const raw =
    section(text, "Settlement Date (T+2):*", otherLabels("Settlement Date")) ??
    section(text, "Settlement Date (T+2):", otherLabels("Settlement Date")) ??
    section(text, "Settlement Date:", otherLabels("Settlement Date"));
  return raw ? parseUsDate(raw) : null;
}

/** 트랜치 하나가 완결된 블록(Issuer:부터 다음 Issuer: 전까지)을 통째로 파싱한다 */
function parseTrancheBlock(block: string): Omit<BondTranche, "label"> {
  const maturityRaw = section(block, "Maturity:", otherLabels("Maturity:")) ?? "";
  const couponRaw =
    section(block, "Coupon (Interest Rate):", otherLabels("Coupon (Interest Rate):")) ??
    section(block, "Coupon:", otherLabels("Coupon:")) ??
    "";
  const isinRaw =
    section(block, "CUSIP / ISIN:", otherLabels("CUSIP / ISIN:")) ??
    section(block, "CUSIP/ISIN:", otherLabels("CUSIP/ISIN:")) ??
    "";

  const maturityDate = parseUsDate(maturityRaw);
  const couponMatch = couponRaw.match(/\d+\.\d+%/);
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
  const currency = /€|EUR\b/.test(text) && !/\$|USD\b/.test(text) ? "EUR" : "USD";

  const issuerIdxs = [...text.matchAll(/Issuer:/g)].map((m) => m.index);

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

  const maturityRaw = section(text, "Maturity:", otherLabels("Maturity:")) ?? "";
  const trancheLabels = findTrancheLabels(maturityRaw);
  const couponRaw =
    section(text, "Coupon (Interest Rate):", otherLabels("Coupon (Interest Rate):")) ??
    section(text, "Coupon:", otherLabels("Coupon:")) ??
    "";
  const isinRaw =
    section(text, "CUSIP / ISIN:", otherLabels("CUSIP / ISIN:")) ??
    section(text, "CUSIP/ISIN:", otherLabels("CUSIP/ISIN:")) ??
    "";

  const maturityDates = [...maturityRaw.matchAll(/[A-Za-z]+ \d{1,2},\s*\d{4}/g)].map((m) => parseUsDate(m[0]));
  const coupons = [...couponRaw.matchAll(/\d+\.\d+%/g)].map((m) => parseFloat(m[0]));
  const isins = [...isinRaw.matchAll(/\b[A-Z]{2}[0-9A-Z]{9}\d\b/g)].map((m) => m[0]);

  const shared = {
    rating: extractRating(text),
    couponFrequencyMonths: extractCouponFrequencyMonths(text),
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
          ...shared,
        }))
      : [
          {
            label: "",
            maturityDate: maturityDates[0] ?? null,
            couponRate: coupons[0] ?? null,
            isin: isins[0] ?? null,
            ...shared,
          },
        ];

  return { tranches, currency, issuer: extractIssuer(text) };
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
