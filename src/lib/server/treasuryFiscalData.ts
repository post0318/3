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
  dated_date: string;
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
    sort: "-dated_date",
    "page[size]": "1000",
    fields: "cusip,security_type,security_term,dated_date,maturity_date,int_rate,int_payment_frequency",
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
      // "발행일"은 각 경매(최초 발행/재발행)의 결제일(issue_date)이 아니라
      // dated_date를 쓴다. 재발행된 채권(예: 912810SP4)은 재발행 회차마다
      // issue_date가 다르지만 dated_date는 전부 동일(2020-08-15)하고, 이자
      // 지급주기(예: 2/15·8/15)와도 일치한다 — 실제 조회로 확인. 종목검색
      // (boerse-frankfurt)이 보여주는 발행일과도 이 값이 일치한다.
      issueDate: r.dated_date,
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
  // 재발행(reopening)된 채권은 같은 CUSIP으로 행이 여러 개 나오지만, 이제
  // issueDate가 dated_date라 재발행 회차와 무관하게 전부 동일한 값이다.
  // 아무 행이나 먼저 나온 것을 쓰면 된다.
  const byCusip = new Map<string, TreasuryBondItem>();
  for (const item of [...notes, ...bonds]) {
    if (!byCusip.has(item.cusip)) byCusip.set(item.cusip, item);
  }
  const list = [...byCusip.values()].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1));

  cached = { list, fetchedAt: Date.now() };
  return list;
}
