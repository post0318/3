const BASE_URL =
  "https://apis.data.go.kr/1160100/GetBondIssuInfoService_V2/getBondBasiInfo_V2";

export interface KoreaBondItem {
  isin: string;
  name: string;
  issuer: string;
  issueDate: string | null;
  maturityDate: string | null;
  couponRate: number | null;
  currency: string | null;
  paymentCycle: string | null;
}

interface RawBondRow {
  isinCd: string;
  isinCdNm: string;
  bondIsurNm: string;
  bondIssuDt: string;
  bondExprDt: string;
  bondSrfcInrt: string;
  bondIssuCurCdNm: string;
  intPayCyclCtt: string;
}

function toIso(yyyymmdd: string | undefined): string | null {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function mapRow(r: RawBondRow): KoreaBondItem {
  return {
    isin: r.isinCd,
    name: r.isinCdNm,
    issuer: r.bondIsurNm,
    issueDate: toIso(r.bondIssuDt),
    maturityDate: toIso(r.bondExprDt),
    couponRate: r.bondSrfcInrt ? parseFloat(r.bondSrfcInrt) : null,
    currency: r.bondIssuCurCdNm || null,
    paymentCycle: r.intPayCyclCtt || null,
  };
}

async function fetchByParam(
  serviceKey: string,
  paramName: "bondIsurNm" | "scrsItmsKcdNm" | "isinCdNm",
  keyword: string
): Promise<KoreaBondItem[]> {
  const url =
    `${BASE_URL}?serviceKey=${serviceKey}` +
    `&numOfRows=999&pageNo=1&resultType=json` +
    `&${paramName}=${encodeURIComponent(keyword)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.go.kr 요청 실패 (${res.status})`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: RawBondRow[] } };
    };
  };

  const resultCode = json.response?.header?.resultCode;
  if (resultCode && resultCode !== "00" && resultCode !== "03") {
    throw new Error(json.response?.header?.resultMsg ?? "조회 실패");
  }

  const rows = json.response?.body?.items?.item ?? [];
  return rows.map(mapRow);
}

/**
 * 금융위원회_채권기본정보(data.go.kr, 한국예탁결제원 원천 데이터) 서비스로
 * 국내 채권을 검색한다. 발행회사명(bondIsurNm)·채권명(isinCdNm)·종목종류
 * (scrsItmsKcdNm, 예: 국채/지방채/특수채/금융채/일반회사채) 세 항목 부분일치를
 * 함께 조회해 합친다. 국고채권처럼 발행인명은 "대한민국"으로만 등록돼 있고
 * scrsItmsKcdNm도 "국채"로만 짧게 등록돼 있어 "국고채권"이라는 채권명 자체로는
 * 두 항목 다 걸리지 않는 경우가 있어(부분일치는 필드 값이 검색어를 포함해야
 * 하는데 필드 값이 검색어보다 짧으면 매칭되지 않음), 채권명(isinCdNm) 검색을
 * 추가해 이런 경우도 포괄한다. numOfRows는 999로 넉넉히 잡아(종목종류처럼
 * 건수가 많은 조건에서 기본 50건으로는 실제로 존재하는 채권이 잘려 누락되는
 * 문제가 있었다) 페이지네이션 없이 한 번에 받는다. 서비스키는
 * DATA_GO_KR_BOND_SERVICE_KEY 환경변수로 관리한다. 라이선스: 공공누리 제2유형
 * (출처표시, 상업적 이용금지) — 상업적 활용 시 한국예탁결제원과 별도
 * 정보이용계약이 필요하다(portal@ksd.or.kr).
 */
export async function searchKoreaBonds(keyword: string): Promise<KoreaBondItem[]> {
  const serviceKey = process.env.DATA_GO_KR_BOND_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_BOND_SERVICE_KEY 환경변수가 설정되어 있지 않습니다.");
  }

  const [byIssuer, byCategory, byName] = await Promise.all([
    fetchByParam(serviceKey, "bondIsurNm", keyword),
    fetchByParam(serviceKey, "scrsItmsKcdNm", keyword).catch(() => []),
    fetchByParam(serviceKey, "isinCdNm", keyword).catch(() => []),
  ]);

  const byIsin = new Map<string, KoreaBondItem>();
  for (const item of [...byIssuer, ...byCategory, ...byName]) {
    if (!byIsin.has(item.isin)) byIsin.set(item.isin, item);
  }
  return [...byIsin.values()];
}
