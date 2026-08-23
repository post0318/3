import { CouponFrequency } from "@/types/bondLayout";

const TRUST_MATURITY_LEAD_DAYS = 11;

const FREQUENCY_MONTHS: Record<CouponFrequency, number> = {
  "3개월": 3,
  "6개월": 6,
  "12개월": 12,
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getTrustMaturityDate(maturityDate: string): string | null {
  const maturity = new Date(maturityDate);
  if (Number.isNaN(maturity.getTime())) return null;
  return toDateString(addDays(maturity, TRUST_MATURITY_LEAD_DAYS));
}

/** 이자계산일 목록. 신탁만기일(=만기일+11일)과 이자지급주기에 따라 행 수가 자동으로 변동한다. */
export function generateCouponSchedule(
  issueDate: string,
  maturityDate: string,
  frequency: CouponFrequency
): string[] {
  const issue = new Date(issueDate);
  const maturity = new Date(maturityDate);
  if (
    Number.isNaN(issue.getTime()) ||
    Number.isNaN(maturity.getTime()) ||
    maturity <= issue
  ) {
    return [];
  }

  const months = FREQUENCY_MONTHS[frequency];
  const dates: string[] = [];
  let next = addMonths(issue, months);

  while (next < maturity) {
    dates.push(toDateString(next));
    next = addMonths(next, months);
  }

  dates.push(toDateString(addDays(maturity, TRUST_MATURITY_LEAD_DAYS)));

  return dates;
}
