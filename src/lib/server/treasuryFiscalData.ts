const USER_AGENT = "ChaeGwonSesangBondApp research-contact@chaegwonsesang.example";
const BASE_URL =
  "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query";
const TTL_MS = 6 * 60 * 60 * 1000;

export interface TreasuryBondItem {
  cusip: string;
  securityType: "Note" | "Bond";
  term: string;
  issueDate: string;
  maturityDate: string;
  couponRate: number;
  frequency: string;
}

let cached: { list: TreasuryBondItem[]; fetchedAt: number } | null = null;

interface RawAuctionRow {
  cusip: string;
  security_type: string;
  security_term: string;
  issue_date: string;
  maturity_date: string;
  int_rate: string;
  int_payment_frequency: string;
}

async function fetchByType(type: "Note" | "Bond"): Promise<TreasuryBondItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    // 예전엔 발행일 최근순 상위 150건만 가져와서, 발행된 지 오래됐지만 아직
    // 만기 전인 채권(예: 2020년 발행 30년물, 2050년 만기)이 최근 재발행분에
    // 밀려 누락됐다. 만기일로 직접 필터링해 현재 유효한 채권 전체를 받는다
    // (Note/Bond 각 300건 안팎, page[size]=1000이면 한 번에 다 받아짐을 확인).
    filter: `security_type:eq:${type},int_rate:gt:0,maturity_date:gte:${today}`,
    sort: "-issue_date",
    "page[size]": "1000",
    fields: "cusip,security_type,security_term,issue_date,maturity_date,int_rate,int_payment_frequency",
    format: "json",
  });
  const res = await fetch(`${BASE_URL}?${params}`, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Treasury 요청 실패 (${res.status})`);
  const json = (await res.json()) as { data?: RawAuctionRow[] };
  const rows = json.data ?? [];
  return rows
    .filter((r) => r.cusip && r.int_rate && r.int_rate !== "null")
    .map((r) => ({
      cusip: r.cusip,
      securityType: type,
      term: r.security_term,
      issueDate: r.issue_date,
      maturityDate: r.maturity_date,
      couponRate: parseFloat(r.int_rate),
      frequency: r.int_payment_frequency,
    }));
}

/**
 * 미국 재무부(fiscaldata.treasury.gov, 공식·무료·키 불필요) 경매 데이터에서
 * 이표부 국채(Note/Bond) 중 만기가 지나지 않은 것 전체를 CUSIP 기준
 * 중복제거해 반환한다(예: 2020년 발행 30년물처럼 오래됐지만 만기가 먼
 * 채권도 포함). 날짜계산기준은 미국 국채 관례상 항상 ACT/ACT, 거래통화는
 * 항상 USD다.
 */
export async function getTreasuryList(): Promise<TreasuryBondItem[]> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.list;

  const [notes, bonds] = await Promise.all([fetchByType("Note"), fetchByType("Bond")]);
  // 재발행(reopening)된 채권은 같은 CUSIP으로 발행일이 다른 행이 여러 개
  // 나온다(예: 912810SP4 - 최초 2020-08-17, 재발행 2020-09-15/2020-10-15).
  // sort: "-issue_date"로 받아 첫 값을 그대로 쓰면 가장 나중 재발행일이
  // 잡히는데, 대부분의 외부 소스(구글 등)는 최초 발행일을 기준으로 하므로
  // CUSIP별 가장 이른 발행일을 남긴다(실제 확인: 912810SP4).
  const byCusip = new Map<string, TreasuryBondItem>();
  for (const item of [...notes, ...bonds]) {
    const existing = byCusip.get(item.cusip);
    if (!existing || item.issueDate < existing.issueDate) {
      byCusip.set(item.cusip, item);
    }
  }
  const list = [...byCusip.values()].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

  cached = { list, fetchedAt: Date.now() };
  return list;
}
