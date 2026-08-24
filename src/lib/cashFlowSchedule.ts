import {
  CouponFrequency,
  Currency,
  InvestorType,
  CalcBasis,
  TaxStatus,
} from "@/types/bondLayout";
import { FREQUENCY_MONTHS, addMonths } from "@/lib/couponSchedule";
import { computeBondPricing, roundDown } from "@/lib/bondPricing";
import { getEffectiveIncomeTaxRate } from "@/lib/taxRules";

export interface CashFlowRow {
  date: string;
  principal: number;
  interest: number;
  taxableIncome: number;
  taxBase: number;
  incomeTax: number;
  specialTax: number | null;
  netAmount: number;
}

export interface CashFlowScheduleInputs {
  maturityDate: string;
  couponRate: string;
  couponFrequency: CouponFrequency;
  purchaseYield: string;
  calcBasis: CalcBasis;
  trustContractDate: string;
  recentCouponDate: string;
  custodyCurrency: Currency;
  purchaseFxRate: string;
  trustInvestmentAmount: string;
  frontFeeRate: string;
  backFeeRate: string;
  investorType: InvestorType;
  taxStatus: TaxStatus;
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** fix.xlsx의 이자계산일별 현금흐름(원금/이자/과세소득/과세표준/소득세/농특세/세후수령액) 계산 */
export function generateFixCashFlow(
  input: CashFlowScheduleInputs
): CashFlowRow[] | null {
  const pricing = computeBondPricing(input);
  if (!pricing) return null;

  const maturity = new Date(input.maturityDate);
  const contractDate = new Date(input.trustContractDate);
  if (Number.isNaN(maturity.getTime()) || Number.isNaN(contractDate.getTime()))
    return null;

  const rate = Number(input.couponRate) / 100;
  const backFeeRate = Number(input.backFeeRate);
  if (Number.isNaN(backFeeRate)) return null;

  const isKrw = input.custodyCurrency === "KRW";
  const fxRate = isKrw ? Number(input.purchaseFxRate) : 1;
  const months = FREQUENCY_MONTHS[input.couponFrequency];
  const freqPerYear = 12 / months;
  const trustInvestmentAmount = Number(input.trustInvestmentAmount);
  const frontFeeAmount = Math.trunc(
    trustInvestmentAmount * (Number(input.frontFeeRate) / 100)
  );

  // 이자계산일 목록: 결제일 이후 첫 이표일부터 만기일까지 (만기일 그대로 마지막 원금상환일)
  const dates: Date[] = [];
  let cursor = new Date(pricing.recentCouponDate);
  cursor = addMonths(cursor, months);
  while (cursor <= maturity) {
    dates.push(cursor);
    if (toTime(cursor) === toTime(maturity)) break;
    cursor = addMonths(cursor, months);
  }
  if (dates.length === 0) return null;

  const couponAmount = roundDown(
    (rate * pricing.faceValue) / freqPerYear,
    2
  ) * fxRate;

  const rows: CashFlowRow[] = [];
  let periodStart = contractDate;
  let carryFrontFee = frontFeeAmount;
  let carryBackFeeResidual = 0;

  dates.forEach((date, index) => {
    const isMaturity = toTime(date) === toTime(maturity);
    const principal = isMaturity ? pricing.faceValue : 0;
    const interest = couponAmount;

    let taxableIncome: number;
    if (index === 0) {
      const preOwnedInterest =
        pricing.faceValue * rate * fxRate * pricing.accrualFraction;
      taxableIncome = Math.trunc(interest - preOwnedInterest);
    } else {
      taxableIncome = interest;
    }

    const availableFrontFee = carryFrontFee;
    const backFeeThisPeriod =
      (trustInvestmentAmount * (backFeeRate / 100) / 365) *
      daysBetween(periodStart, date);
    const availableBackFee = carryBackFeeResidual + backFeeThisPeriod;
    const totalDeduction = availableFrontFee + availableBackFee;

    const taxBase =
      taxableIncome > totalDeduction ? taxableIncome - totalDeduction : 0;
    const incomeTaxRate = getEffectiveIncomeTaxRate(input.taxStatus);
    const incomeTax = roundDown(taxBase * incomeTaxRate, -1);
    const specialTaxRate = input.investorType === "개인" ? 0.014 : 0.028;
    const specialTax =
      input.taxStatus === "비과세(농특세)" ? taxBase * specialTaxRate : null;
    const netAmount =
      interest - backFeeThisPeriod - incomeTax - (specialTax ?? 0);

    rows.push({
      date: date.toISOString().slice(0, 10),
      principal,
      interest,
      taxableIncome,
      taxBase,
      incomeTax,
      specialTax,
      netAmount,
    });

    const remainingFrontFee =
      taxableIncome < availableFrontFee
        ? availableFrontFee - taxableIncome
        : 0;
    const remainingBackFee =
      remainingFrontFee > 0
        ? availableBackFee
        : taxableIncome > totalDeduction
          ? 0
          : availableBackFee - (taxableIncome - availableFrontFee);

    carryFrontFee = remainingFrontFee;
    carryBackFeeResidual = remainingBackFee;
    periodStart = date;
  });

  return rows;
}

function toTime(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
