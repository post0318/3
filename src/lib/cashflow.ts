import { BondInput, CashFlowRow } from "@/types/bond";

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function generateCashFlow(input: BondInput): CashFlowRow[] {
  const issue = new Date(input.issueDate);
  const maturity = new Date(input.maturityDate);
  if (Number.isNaN(issue.getTime()) || Number.isNaN(maturity.getTime()) || maturity <= issue) {
    return [];
  }

  const couponAmount =
    (input.faceValue * (input.couponRate / 100) * input.couponFrequency) / 12;
  const taxRate = input.taxRate / 100;

  const rows: CashFlowRow[] = [];
  let couponDate = addMonths(issue, input.couponFrequency);

  while (couponDate < maturity) {
    const incomeTax = Math.trunc(couponAmount * taxRate);
    rows.push({
      date: toDateString(couponDate),
      principal: 0,
      taxableIncome: Math.trunc(couponAmount),
      incomeTax,
      cashFlow: Math.trunc(couponAmount) - incomeTax,
    });
    couponDate = addMonths(couponDate, input.couponFrequency);
  }

  const finalIncomeTax = Math.trunc(couponAmount * taxRate);
  rows.push({
    date: toDateString(maturity),
    principal: input.faceValue,
    taxableIncome: Math.trunc(couponAmount),
    incomeTax: finalIncomeTax,
    cashFlow: input.faceValue + Math.trunc(couponAmount) - finalIncomeTax,
  });

  return rows;
}
