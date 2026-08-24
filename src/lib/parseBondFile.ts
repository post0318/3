import * as XLSX from "xlsx";
import { BondLayoutInput, CalcBasis, CouponFrequency } from "@/types/bondLayout";

type UploadableField =
  | "name"
  | "issueDate"
  | "maturityDate"
  | "couponRate"
  | "couponFrequency"
  | "recentCouponDate"
  | "calcBasis"
  | "creditRating";

const LABEL_TO_FIELD: Record<string, UploadableField> = {
  종목명: "name",
  발행일: "issueDate",
  만기일: "maturityDate",
  표면이율: "couponRate",
  "이자지급 주기": "couponFrequency",
  최근이표일: "recentCouponDate",
  "날짜계산 기준": "calcBasis",
  해외신용등급: "creditRating",
};

const CALC_BASIS_VALUES: CalcBasis[] = [
  "미국 30/360",
  "ACT/ACT",
  "ACT/360",
  "ACT/365",
  "유럽 30/360",
];

const COUPON_FREQUENCY_VALUES: CouponFrequency[] = ["3개월", "6개월", "12개월"];

function toIsoDate(value: unknown): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 업로드된 엑셀에서 라벨 텍스트를 찾아 바로 오른쪽 셀 값을 대응 필드로 매핑한다.
 * top_lay.xlsx(라벨/값이 인접 컬럼에 배치된 구조)와 동일한 방식의 파일이면 시트 레이아웃과 무관하게 인식된다.
 */
export function parseBondFile(buffer: ArrayBuffer): Partial<BondLayoutInput> {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
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
            const percent = Math.abs(raw) < 1 ? raw * 100 : raw;
            result.couponRate = String(Math.round(percent * 100) / 100);
            found.add(field);
          }
        } else if (field === "couponFrequency") {
          const text = String(valueCell.v).trim();
          if (COUPON_FREQUENCY_VALUES.includes(text as CouponFrequency)) {
            result.couponFrequency = text as CouponFrequency;
            found.add(field);
          }
        } else if (field === "calcBasis") {
          const text = String(valueCell.v).trim();
          if (CALC_BASIS_VALUES.includes(text as CalcBasis)) {
            result.calcBasis = text as CalcBasis;
            found.add(field);
          }
        }
      }
    }
  }

  return result;
}
