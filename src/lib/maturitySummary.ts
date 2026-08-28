import { CashFlowRow } from "@/lib/cashFlowSchedule";
import { BondPricingResult, roundDown } from "@/lib/bondPricing";
import { getInvestmentDays } from "@/lib/couponSchedule";

const TRUST_MATURITY_LEAD_DAYS = 11;
const DEFAULT_COMPREHENSIVE_TAX_RATE = 0.154;

export interface MaturitySummaryInputs {
  trustContractDate: string;
  maturityDate: string;
  trustInvestmentAmount: string;
  backFeeRate: string;
  tradeCurrency: string;
  custodyCurrency: string;
  maturityFxRate: string;
  comprehensiveTaxRate: string;
}

export interface MaturitySummary {
  lastBackFee: number;
  /** 신탁투자금액에서 첫 이자지급 시 돌려받는 경과이자(매수 시 선지급분)를 뺀 실투자원금 */
  investedPrincipal: number;
  totalInterest: number;
  postTaxMaturityAmount: number;
  postTaxYield: number;
  bankEquivalentYield: number;
}

/** 실투자원금, 이자총액, 만기시 세후금액, 세후수익률, 은행환산수익률 (fix.xlsx G10~G15) */
export function computeMaturitySummary(
  pricing: BondPricingResult,
  rows: CashFlowRow[],
  input: MaturitySummaryInputs
): MaturitySummary | null {
  const investmentDays = getInvestmentDays(
    input.trustContractDate,
    input.maturityDate
  );
  if (!investmentDays) return null;

  const principal = Number(input.trustInvestmentAmount);
  const backFeeRate = Number(input.backFeeRate);
  if (
    !input.trustInvestmentAmount ||
    Number.isNaN(principal) ||
    !input.backFeeRate ||
    Number.isNaN(backFeeRate) ||
    rows.length === 0
  ) {
    return null;
  }

  const needsFx = input.tradeCurrency !== input.custodyCurrency;
  const fx = needsFx ? Number(input.maturityFxRate) : 1;
  if (needsFx && (!fx || Number.isNaN(fx) || fx <= 0)) return null;

  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
  const totalPrincipal = rows.reduce((sum, row) => sum + row.principal, 0);
  const totalNetAmount = rows.reduce((sum, row) => sum + row.netAmount, 0);

  // 첫 이자지급 회차의 (이자 - 과세소득)은 매수 시 선지급한 경과이자로,
  // 첫 이자지급 때 그대로 돌려받는다. 실제 투자에 묶인 원금은 이만큼 작다.
  const preOwnedInterest = rows[0].interest - rows[0].taxableIncome;
  const investedPrincipal = roundDown(principal - preOwnedInterest, 2);

  const lastBackFee = roundDown(
    ((principal * (backFeeRate / 100)) / 365) * TRUST_MATURITY_LEAD_DAYS,
    2
  );

  const postTaxMaturityAmount = roundDown(
    totalNetAmount + totalPrincipal + pricing.cashBalance - lastBackFee,
    2
  );

  const postTaxYield =
    ((postTaxMaturityAmount - principal) / principal) * (365 / investmentDays);
  const parsedComprehensiveTaxRate = Number(input.comprehensiveTaxRate);
  const comprehensiveTaxRate =
    input.comprehensiveTaxRate && !Number.isNaN(parsedComprehensiveTaxRate)
      ? parsedComprehensiveTaxRate / 100
      : DEFAULT_COMPREHENSIVE_TAX_RATE;
  const bankEquivalentYield = postTaxYield / (1 - comprehensiveTaxRate);

  return {
    lastBackFee,
    investedPrincipal,
    totalInterest,
    postTaxMaturityAmount,
    postTaxYield,
    bankEquivalentYield,
  };
}
