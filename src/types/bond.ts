export type CouponFrequency = 3 | 6 | 12;

export interface BondInput {
  name: string;
  faceValue: number;
  couponRate: number; // %
  issueDate: string; // yyyy-mm-dd
  maturityDate: string; // yyyy-mm-dd
  couponFrequency: CouponFrequency;
  purchaseYield: number; // %
  taxRate: number; // %
}

export interface CashFlowRow {
  date: string;
  principal: number;
  taxableIncome: number;
  incomeTax: number;
  cashFlow: number;
}
