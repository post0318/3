export type CalcBasis =
  | "미국 30/360"
  | "ACT/ACT"
  | "ACT/360"
  | "ACT/365"
  | "유럽 30/360"
  | "Business/252";

export type InvestorType = "개인" | "일반법인" | "금융법인";

export type CouponFrequency = "3개월" | "6개월" | "12개월";

/** 이 상품은 브라질 국채(NTN-F) 전용이라 거래통화 BRL·수탁통화 KRW로 고정된다 */
export type Currency = "KRW" | "BRL";

export type TaxStatus = "일반과세" | "비과세(농특세)" | "비과세";

/** 지급구분: 월/재투자는 준비 중(1단계는 반기만 지원) */
export type DistributionType = "월" | "반기" | "재투자";

export interface BondLayoutInput {
  calcBasis: CalcBasis;
  investorType: InvestorType;
  distributionType: DistributionType;

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
