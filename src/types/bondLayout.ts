export type CalcBasis =
  | "미국 30/360"
  | "ACT/ACT"
  | "ACT/360"
  | "ACT/365"
  | "유럽 30/360";

export type InvestorType = "개인" | "일반법인" | "금융법인";

export type CouponFrequency = "3개월" | "6개월" | "12개월";

export type Currency = "USD" | "EUR" | "CNY" | "JPY" | "KRW";

export interface BondLayoutInput {
  calcBasis: CalcBasis;
  investorType: InvestorType;

  name: string;
  issueDate: string;
  maturityDate: string;
  couponRate: number;
  couponFrequency: CouponFrequency;
  creditRating: string;
  tradeCurrency: Currency;
  custodyCurrency: Currency;

  trustContractDate: string;
  purchaseYield: number;

  frontFeeRate: number | null;
  backFeeRate: number | null;
}
