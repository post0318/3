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
  const params = new URLSearchParams({
    filter: `security_type:eq:${type},int_rate:gt:0`,
    sort: "-issue_date",
    "page[size]": "150",
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
 * 이표부 국채(Note/Bond)의 최근 발행분을 CUSIP 기준 중복제거해 반환한다.
 * 날짜계산기준은 미국 국채 관례상 항상 ACT/ACT, 거래통화는 항상 USD다.
 */
export async function getTreasuryList(): Promise<TreasuryBondItem[]> {
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.list;

  const [notes, bonds] = await Promise.all([fetchByType("Note"), fetchByType("Bond")]);
  const byCusip = new Map<string, TreasuryBondItem>();
  for (const item of [...notes, ...bonds]) {
    if (!byCusip.has(item.cusip)) byCusip.set(item.cusip, item);
  }
  const list = [...byCusip.values()].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

  cached = { list, fetchedAt: Date.now() };
  return list;
}
