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
  /** 이번 회차 구간에 유지된 보유현금(KRW). 반기지급에서는 결제 후 현금잔액으로 고정 */
  cashBalance: number;
  /** 채권 쿠폰 이자만 (현금잔액 이자는 제외) */
  interest: number;
  /** 직전 지급일~이번 지급일 구간 보유현금(KRW)에 대한 단리 이자 */
  cashInterest: number;
  /** 채권 쿠폰 과세분 + 보유현금 이자 */
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
  tradeCurrency: Currency;
  custodyCurrency: Currency;
  purchaseFxRate: string;
  maturityFxRate: string;
  trustInvestmentAmount: string;
  frontFeeRate: string;
  backFeeRate: string;
  cashInterestRate: string;
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

  const needsFx = input.tradeCurrency !== input.custodyCurrency;
  const maturityFxRate = needsFx ? Number(input.maturityFxRate) : 1;
  if (needsFx && (!maturityFxRate || Number.isNaN(maturityFxRate) || maturityFxRate <= 0)) {
    return null;
  }
  const months = FREQUENCY_MONTHS[input.couponFrequency];
  const freqPerYear = 12 / months;
  const trustInvestmentAmount = Number(input.trustInvestmentAmount);
  const frontFeeAmount = Math.trunc(
    trustInvestmentAmount * (Number(input.frontFeeRate) / 100)
  );
  const cashInterestRate = Number(input.cashInterestRate) || 0;

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

  // 브라질 국채(Business/252)는 표면금리를 단순 나눗셈이 아니라 복리로 환산한
  // 반기 실효쿠폰을 지급한다(예: 연 10% -> 반기 4.880885%). 블룸버그 실제 값과
  // 대조해 확인함(computeBrazilDirtyPrice 참고).
  const couponAmount = roundDown(
    input.calcBasis === "Business/252"
      ? pricing.faceValue * (Math.pow(1 + rate, 1 / freqPerYear) - 1)
      : (rate * pricing.faceValue) / freqPerYear,
    2
  ) * maturityFxRate;

  // 화면에 보이는 현금흐름표 각 열(원금/이자/과세소득/과세표준/소득세/농특세/
  // 세후수령액)은 수탁통화가 KRW면 정수로, 그 외는 소수점 2자리까지 절사해
  // 표시한다. 절사 전 값을 그대로 내부 계산에 쓰면 "이자-소득세-농특세=
  // 세후수령액" 같은 검산이 화면상 어긋나 보이므로, 표시값과 동일하게 절사한
  // 값을 각 행에 저장하고 그 절사값으로 다음 계산을 이어간다.
  const isKrw = input.custodyCurrency === "KRW";
  const truncByCurrency = (n: number) => (isKrw ? Math.trunc(n) : roundDown(n, 2));

  const rows: CashFlowRow[] = [];
  let periodStart = contractDate;
  let carryFrontFee = frontFeeAmount;
  let carryBackFeeResidual = 0;
  // 결제 후 신탁 내 보유현금. 반기지급에서는 쿠폰·현금이자가 매 회차 그대로
  // 투자자에게 지급돼(전기와 당기간 발생분은 당기 지급) 남는 금액이 없으므로
  // 만기까지 불변이다. 월 지급 단계에서는 부분지급 잔액이 회차마다 합산된다.
  const runningCashBalance = pricing.cashBalance;

  dates.forEach((date, index) => {
    const isMaturity = toTime(date) === toTime(maturity);
    const principal = truncByCurrency(isMaturity ? pricing.faceValue * maturityFxRate : 0);
    const interest = truncByCurrency(couponAmount);

    // 직전 지급일~이번 지급일 구간 보유현금 단리 이자 (신탁계약일 기산, 만기일 종료)
    const cashInterest = truncByCurrency(
      (runningCashBalance * (cashInterestRate / 100) / 365) *
        daysBetween(periodStart, date)
    );

    let bondTaxableIncome: number;
    if (index === 0) {
      // couponAmount(이번 회차 이자, 브라질은 복리환산 쿠폰)와 같은 기준으로
      // 경과분을 계산해야 "이자-경과이자"가 일치한다. 별도로 단순금리(rate)를
      // 다시 곱해 계산하면 브라질처럼 쿠폰이 복리환산인 경우 어긋난다.
      const preOwnedInterest = couponAmount * pricing.accrualFraction * freqPerYear;
      bondTaxableIncome = truncByCurrency(couponAmount - preOwnedInterest);
    } else {
      bondTaxableIncome = interest;
    }
    const taxableIncome = bondTaxableIncome + cashInterest;

    const availableFrontFee = carryFrontFee;
    const backFeeThisPeriod =
      (trustInvestmentAmount * (backFeeRate / 100) / 365) *
      daysBetween(periodStart, date);
    const availableBackFee = carryBackFeeResidual + backFeeThisPeriod;
    const totalDeduction = availableFrontFee + availableBackFee;

    const taxBase = truncByCurrency(
      taxableIncome > totalDeduction ? taxableIncome - totalDeduction : 0
    );
    const incomeTaxRate = getEffectiveIncomeTaxRate(input.taxStatus);
    const incomeTax = isKrw
      ? roundDown(taxBase * incomeTaxRate, -1)
      : roundDown(taxBase * incomeTaxRate, 2);
    const specialTaxRate = input.investorType === "개인" ? 0.014 : 0.028;
    const specialTax =
      input.taxStatus === "비과세(농특세)"
        ? truncByCurrency(taxBase * specialTaxRate)
        : null;
    const netAmount = truncByCurrency(
      interest + cashInterest - backFeeThisPeriod - incomeTax - (specialTax ?? 0)
    );

    rows.push({
      date: date.toISOString().slice(0, 10),
      principal,
      cashBalance: truncByCurrency(runningCashBalance),
      interest,
      cashInterest,
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
