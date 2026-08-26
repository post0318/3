const CSV_URL =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** CSV의 "Tipo Titulo" 값. NTN-F(고정금리 반기이표채)의 현재 소매판매명이 이것이다 */
const NTNF_TYPE_PREFIX = "Tesouro Prefixado com Juros Semestrais;";

export interface BrazilBondItem {
  maturityDate: string; // ISO (YYYY-MM-DD)
  buyRate: number | null; // Taxa Compra Manha (%)
  sellRate: number | null; // Taxa Venda Manha (%)
  buyPrice: number | null; // PU Compra Manha
  sellPrice: number | null; // PU Venda Manha
}

let cache: { at: number; asOfDate: string; items: BrazilBondItem[] } | null = null;

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

/**
 * 브라질 재무부(Tesouro Nacional) 공식 오픈데이터 포털 tesourotransparente.gov.br의
 * CSV(매일 갱신, 2006년부터의 전체 이력, 인증 불필요)에서 NTN-F(소매판매명
 * "Tesouro Prefixado com Juros Semestrais")의 최신 기준일자(Data Base) 시세만
 * 골라 반환한다. 옛 JSON API(treasurybondsinfo.json)는 2025-08부터 죽었고,
 * B3 공식 API는 B2B 전용이라 개인/자동화 접근이 불가해 이 경로를 쓴다. 파일이
 * 14MB대라 6시간 캐시한다.
 */
export async function fetchLatestNtnF(): Promise<{
  asOfDate: string;
  items: BrazilBondItem[];
}> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { asOfDate: cache.asOfDate, items: cache.items };
  }

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

  cache = { at: Date.now(), asOfDate, items };
  return { asOfDate, items };
}
