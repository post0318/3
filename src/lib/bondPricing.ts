import { CalcBasis, CouponFrequency } from "@/types/bondLayout";
import {
  FREQUENCY_PER_YEAR,
  getCouponPeriod,
  getSettlementDate,
} from "@/lib/couponSchedule";

export const BASIS_INDEX: Record<CalcBasis, number> = {
  "미국 30/360": 0,
  "ACT/ACT": 1,
  "ACT/360": 2,
  "ACT/365": 3,
  "유럽 30/360": 4,
};

function actualDays(start: Date, end: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

/** 30/360 (미국 NASD) 방식 일수 */
function days360Us(start: Date, end: Date): number {
  const y1 = start.getFullYear();
  const m1 = start.getMonth() + 1;
  let d1 = start.getDate();
  const y2 = end.getFullYear();
  const m2 = end.getMonth() + 1;
  let d2 = end.getDate();

  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

/** 30/360 (유럽) 방식 일수 */
function days360Eu(start: Date, end: Date): number {
  const y1 = start.getFullYear();
  const m1 = start.getMonth() + 1;
  const d1 = Math.min(start.getDate(), 30);
  const y2 = end.getFullYear();
  const m2 = end.getMonth() + 1;
  const d2 = Math.min(end.getDate(), 30);

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** ACT/ACT: 같은 해에 속하면 실제일수/해당 연도 일수(365 또는 366), 해를 걸치면 각 해 구간을 나눠 합산 */
function yearFracActAct(start: Date, end: Date): number {
  let s = start;
  let e = end;
  let sign = 1;
  if (s > e) {
    [s, e] = [e, s];
    sign = -1;
  }

  const y1 = s.getFullYear();
  const y2 = e.getFullYear();

  if (y1 === y2) {
    return (sign * actualDays(s, e)) / (isLeapYear(y1) ? 366 : 365);
  }

  let sum = 0;
  const endOfY1 = new Date(y1, 11, 31);
  sum += (actualDays(s, endOfY1) + 1) / (isLeapYear(y1) ? 366 : 365);

  for (let y = y1 + 1; y < y2; y++) {
    sum += 1;
  }

  const startOfY2 = new Date(y2, 0, 1);
  sum += actualDays(startOfY2, e) / (isLeapYear(y2) ? 366 : 365);

  return sign * sum;
}

/** YEARFRAC(start, end, basis) 근사 구현. basis: 0=미국30/360, 1=ACT/ACT, 2=ACT/360, 3=ACT/365, 4=유럽30/360 */
export function yearFrac(start: Date, end: Date, basis: number): number {
  switch (basis) {
    case 0:
      return days360Us(start, end) / 360;
    case 2:
      return actualDays(start, end) / 360;
    case 3:
      return actualDays(start, end) / 365;
    case 4:
      return days360Eu(start, end) / 360;
    case 1:
    default:
      return yearFracActAct(start, end);
  }
}

export function roundDown(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.trunc(value * factor) / factor;
}

export function roundUp(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return (Math.sign(value) || 1) * Math.ceil(Math.abs(value) * factor) / factor;
}

/**
 * 채권 매수단가(clean, per 100 face). 원본 fix.xlsx의 PRICE(...) 호출과 동일하게
 * day-count basis는 지정하지 않은 것으로 간주하여 미국 30/360으로 고정 계산한다.
 */
export function computeCleanPrice(
  settlement: Date,
  maturity: Date,
  annualRate: number,
  annualYield: number,
  redemption: number,
  frequency: CouponFrequency
): number | null {
  if (settlement >= maturity) return null;

  const f = FREQUENCY_PER_YEAR[frequency];
  const { previousCouponDate, nextCouponDate, periodsRemaining } =
    getCouponPeriod(maturity, frequency, settlement);

  const e = days360Us(previousCouponDate, nextCouponDate);
  const dsc = days360Us(settlement, nextCouponDate);
  const a = days360Us(previousCouponDate, settlement);
  if (e === 0) return null;

  const coupon = (100 * annualRate) / f;
  const yieldPerPeriod = annualYield / f;
  const n = periodsRemaining;

  if (n === 1) {
    return (
      (redemption + coupon) / (1 + (dsc / e) * yieldPerPeriod) -
      coupon * (a / e)
    );
  }

  let sum = 0;
  for (let k = 1; k <= n; k++) {
    sum += coupon / Math.pow(1 + yieldPerPeriod, k - 1 + dsc / e);
  }

  return (
    redemption / Math.pow(1 + yieldPerPeriod, n - 1 + dsc / e) +
    sum -
    coupon * (a / e)
  );
}

export interface BondPricingInputs {
  maturityDate: string;
  couponRate: string; // %
  couponFrequency: CouponFrequency;
  purchaseYield: string; // %
  calcBasis: CalcBasis;
  trustContractDate: string;
  recentCouponDate: string;
  custodyCurrency: string;
  purchaseFxRate: string;
  trustInvestmentAmount: string;
  frontFeeRate: string;
}

export interface BondPricingResult {
  settlementDate: string;
  recentCouponDate: string;
  accrualFraction: number;
  cleanPrice: number;
  dirtyPrice: number;
  faceValue: number;
  accruedInterest: number;
  settlementAmount: number;
  cashBalance: number;
}

/** 채권권면액/매수단가(clean·dirty)/경과이자/결제금액/현금잔액을 fix.xlsx 수식과 동일한 순서로 계산한다 */
export function computeBondPricing(
  input: BondPricingInputs
): BondPricingResult | null {
  const maturity = new Date(input.maturityDate);
  const rate = Number(input.couponRate);
  const yld = Number(input.purchaseYield);
  const principal = Number(input.trustInvestmentAmount);
  const frontFeeRate = Number(input.frontFeeRate);

  if (
    Number.isNaN(maturity.getTime()) ||
    Number.isNaN(rate) ||
    Number.isNaN(yld) ||
    !input.trustInvestmentAmount ||
    Number.isNaN(principal) ||
    !input.frontFeeRate ||
    Number.isNaN(frontFeeRate)
  ) {
    return null;
  }

  const settlement = getSettlementDate(input.trustContractDate);
  if (!settlement) return null;

  const cleanRaw = computeCleanPrice(
    settlement,
    maturity,
    rate / 100,
    yld / 100,
    100,
    input.couponFrequency
  );
  if (cleanRaw === null) return null;
  const cleanPrice = roundUp(cleanRaw, 4);

  const recentCoupon = input.recentCouponDate
    ? new Date(input.recentCouponDate)
    : getCouponPeriod(maturity, input.couponFrequency, settlement)
        .previousCouponDate;

  const basis = BASIS_INDEX[input.calcBasis];
  const accrualFrac = yearFrac(recentCoupon, settlement, basis);
  const dirtyPrice = roundUp(cleanPrice + 100 * (rate / 100) * accrualFrac, 4);

  const isKrw = input.custodyCurrency === "KRW";
  const fxRate = isKrw ? Number(input.purchaseFxRate) : 1;
  if (isKrw && (!fxRate || Number.isNaN(fxRate) || fxRate <= 0)) return null;

  const frontFeeAmount = Math.trunc(principal * (frontFeeRate / 100));
  const availableAmount = principal - frontFeeAmount;

  const faceValue = roundDown(
    (availableAmount / fxRate / dirtyPrice) * 100,
    -3
  );

  const accruedInterest = faceValue * (rate / 100) * accrualFrac;
  const settlementAmount = (faceValue * dirtyPrice) / 100 * fxRate;
  const cashBalance = roundDown(principal - frontFeeAmount - settlementAmount, 2);

  return {
    settlementDate: settlement.toISOString().slice(0, 10),
    recentCouponDate: recentCoupon.toISOString().slice(0, 10),
    accrualFraction: accrualFrac,
    cleanPrice,
    dirtyPrice,
    faceValue,
    accruedInterest,
    settlementAmount,
    cashBalance,
  };
}
