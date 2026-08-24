import { CashFlowRow } from "@/lib/cashFlowSchedule";
import { BondPricingResult } from "@/lib/bondPricing";
import { getInvestmentDays } from "@/lib/couponSchedule";

const TRUST_MATURITY_LEAD_DAYS = 11;
const DEFAULT_COMPREHENSIVE_TAX_RATE = 0.154;

export interface MaturitySummaryInputs {
  trustContractDate: string;
  maturityDate: string;
  trustInvestmentAmount: string;
  backFeeRate: string;
  custodyCurrency: string;
  maturityFxRate: string;
  comprehensiveTaxRate: string;
}

export interface MaturitySummary {
  lastBackFee: number;
  preTaxMaturityAmount: number;
  postTaxMaturityAmount: number;
  preTaxYield: number;
  postTaxYield: number;
  bankEquivalentYield: number;
}

/** 만기시 세전/세후금액, 세전/세후수익률, 은행환산수익률 (fix.xlsx G10~G15) */
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

  const isKrw = input.custodyCurrency === "KRW";
  const fx = isKrw ? Number(input.maturityFxRate) : 1;
  if (isKrw && (!fx || Number.isNaN(fx) || fx <= 0)) return null;

  const totalInterest = rows.reduce((sum, row) => sum + row.interest, 0);
  const totalPrincipal = rows.reduce((sum, row) => sum + row.principal, 0);
  const totalNetAmount = rows.reduce((sum, row) => sum + row.netAmount, 0);

  const totalBackFeeEstimate =
    ((principal * (backFeeRate / 100)) / 365) * investmentDays;

  const preTaxMaturityAmount = Math.trunc(
    totalInterest +
      totalPrincipal * fx +
      pricing.cashBalance -
      totalBackFeeEstimate
  );

  const lastBackFee = Math.trunc(
    ((principal * (backFeeRate / 100)) / 365) * TRUST_MATURITY_LEAD_DAYS
  );

  const postTaxMaturityAmount = Math.trunc(
    totalNetAmount + totalPrincipal * fx + pricing.cashBalance - lastBackFee
  );

  const preTaxYield =
    ((preTaxMaturityAmount - principal) / principal) * (365 / investmentDays);
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
    preTaxMaturityAmount,
    postTaxMaturityAmount,
    preTaxYield,
    postTaxYield,
    bankEquivalentYield,
  };
}
