export type CalcBasis =
  | "미국 30/360"
  | "ACT/ACT"
  | "ACT/360"
  | "ACT/365"
  | "유럽 30/360";

export type InvestorType = "개인" | "일반법인" | "금융법인";

export type CouponFrequency = "3개월" | "6개월" | "12개월";

export type Currency = "USD" | "EUR" | "CNY" | "JPY" | "KRW";

export type TaxStatus = "일반과세" | "비과세(농특세)" | "비과세";

export interface BondLayoutInput {
  calcBasis: CalcBasis;
  investorType: InvestorType;

  name: string;
  issueDate: string;
  maturityDate: string;
  couponRate: string;
  couponFrequency: CouponFrequency;
  recentCouponDate: string;
  taxStatus: TaxStatus;
  creditRating: string;
  tradeCurrency: Currency;
  custodyCurrency: Currency;
  purchaseFxRate: string;
  maturityFxRate: string;

  trustContractDate: string;
  purchaseYield: string;

  trustInvestmentAmount: string;
  frontFeeRate: string;
  backFeeRate: string;
  incomeTaxRate: string;
}
