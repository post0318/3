import * as XLSX from "xlsx";
import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  TaxStatus,
} from "@/types/bondLayout";

type UploadableField =
  | "name"
  | "issueDate"
  | "maturityDate"
  | "couponRate"
  | "couponFrequency"
  | "recentCouponDate"
  | "taxStatus"
  | "calcBasis"
  | "creditRating";

const LABEL_TO_FIELD: Record<string, UploadableField> = {
  종목명: "name",
  발행일: "issueDate",
  만기일: "maturityDate",
  표면이율: "couponRate",
  "이자지급 주기": "couponFrequency",
  최근이표일: "recentCouponDate",
  과세여부: "taxStatus",
  "날짜계산 기준": "calcBasis",
  해외신용등급: "creditRating",
};

const TAX_STATUS_BY_CODE: Record<number, TaxStatus> = {
  1: "일반과세",
  2: "비과세(농특세)",
  3: "비과세",
};

const CALC_BASIS_BY_CODE: Record<number, CalcBasis> = {
  1: "미국 30/360",
  2: "ACT/ACT",
  3: "ACT/360",
  4: "ACT/365",
  5: "유럽 30/360",
};

const COUPON_FREQUENCY_BY_CODE: Record<number, CouponFrequency> = {
  1: "3개월",
  2: "6개월",
  3: "12개월",
};

/**
 * 엑셀 날짜 값을 ISO(yyyy-mm-dd) 문자열로 변환한다.
 * 숫자(엑셀 시리얼 값)는 XLSX.SSF.parse_date_code로 직접 계산해, cellDates:true가
 * 만들어내는 JS Date 객체를 거치지 않는다 — 한국 등 일부 시간대에서는 1899-12-30
 * 기준일에 적용되는 역사적 시간대 오프셋(예: 구한국표준시 UTC+8:27:52) 때문에
 * new Date()로 변환한 날짜가 하루 전으로 밀리는 문제가 있다.
 */
function toIsoDate(value: unknown): string | null {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, "0");
    const d = String(parsed.d).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "string") {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return null;
  }
  return null;
}

/**
 * 업로드된 엑셀에서 라벨 텍스트를 찾아 바로 오른쪽 셀 값을 대응 필드로 매핑한다.
 * top_lay.xlsx(라벨/값이 인접 컬럼에 배치된 구조)와 동일한 방식의 파일이면 시트 레이아웃과 무관하게 인식된다.
 */
export function parseBondFile(buffer: ArrayBuffer): Partial<BondLayoutInput> {
  const workbook = XLSX.read(buffer, { type: "array" });
  const result: Partial<BondLayoutInput> = {};
  const found = new Set<UploadableField>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        if (!cell || typeof cell.v !== "string") continue;

        const field = LABEL_TO_FIELD[cell.v.trim()];
        if (!field || found.has(field)) continue;

        const valueCell = sheet[XLSX.utils.encode_cell({ r, c: c + 1 })];
        if (!valueCell || valueCell.v === undefined || valueCell.v === "")
          continue;

        if (field === "name" || field === "creditRating") {
          result[field] = String(valueCell.v);
          found.add(field);
        } else if (
          field === "issueDate" ||
          field === "maturityDate" ||
          field === "recentCouponDate"
        ) {
          const iso = toIsoDate(valueCell.v);
          if (iso) {
            result[field] = iso;
            found.add(field);
          }
        } else if (field === "couponRate") {
          const raw = Number(valueCell.v);
          if (!Number.isNaN(raw)) {
            result.couponRate = String(Math.round(raw * 100) / 100);
            found.add(field);
          }
        } else if (field === "couponFrequency") {
          const code = Number(valueCell.v);
          const couponFrequency = COUPON_FREQUENCY_BY_CODE[code];
          if (couponFrequency) {
            result.couponFrequency = couponFrequency;
            found.add(field);
          }
        } else if (field === "calcBasis") {
          const code = Number(valueCell.v);
          const calcBasis = CALC_BASIS_BY_CODE[code];
          if (calcBasis) {
            result.calcBasis = calcBasis;
            found.add(field);
          }
        } else if (field === "taxStatus") {
          const code = Number(valueCell.v);
          const taxStatus = TAX_STATUS_BY_CODE[code];
          if (taxStatus) {
            result.taxStatus = taxStatus;
            found.add(field);
          }
        }
      }
    }
  }

  return result;
}
