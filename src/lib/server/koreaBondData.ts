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

/**
 * 금융위원회_채권기본정보(data.go.kr, 한국예탁결제원 원천 데이터) 서비스로
 * 발행회사명(부분일치)으로 국내 채권을 검색한다. 서비스키는
 * DATA_GO_KR_BOND_SERVICE_KEY 환경변수로 관리한다.
 * 라이선스: 공공누리 제2유형(출처표시, 상업적 이용금지) — 상업적 활용 시
 * 한국예탁결제원과 별도 정보이용계약이 필요하다(portal@ksd.or.kr).
 */
export async function searchKoreaBonds(issuerName: string): Promise<KoreaBondItem[]> {
  const serviceKey = process.env.DATA_GO_KR_BOND_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_BOND_SERVICE_KEY 환경변수가 설정되어 있지 않습니다.");
  }

  const url =
    `${BASE_URL}?serviceKey=${serviceKey}` +
    `&numOfRows=50&pageNo=1&resultType=json` +
    `&bondIsurNm=${encodeURIComponent(issuerName)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`data.go.kr 요청 실패 (${res.status})`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: RawBondRow[] } };
    };
  };

  const resultCode = json.response?.header?.resultCode;
  if (resultCode && resultCode !== "00") {
    throw new Error(json.response?.header?.resultMsg ?? "조회 실패");
  }

  const rows = json.response?.body?.items?.item ?? [];
  return rows.map((r) => ({
    isin: r.isinCd,
    name: r.isinCdNm,
    issuer: r.bondIsurNm,
    issueDate: toIso(r.bondIssuDt),
    maturityDate: toIso(r.bondExprDt),
    couponRate: r.bondSrfcInrt ? parseFloat(r.bondSrfcInrt) : null,
    currency: r.bondIssuCurCdNm || null,
    paymentCycle: r.intPayCyclCtt || null,
  }));
}
