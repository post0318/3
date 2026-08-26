import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  Currency,
  InvestorType,
  TaxStatus,
} from "@/types/bondLayout";

const COUPON_FREQUENCY_TO_CODE: Record<CouponFrequency, number> = {
  "3개월": 1,
  "6개월": 2,
  "12개월": 3,
};
const COUPON_FREQUENCY_BY_CODE: Record<number, CouponFrequency> = {
  1: "3개월",
  2: "6개월",
  3: "12개월",
};

const TAX_STATUS_TO_CODE: Record<TaxStatus, number> = {
  일반과세: 1,
  "비과세(농특세)": 2,
  비과세: 3,
};
const TAX_STATUS_BY_CODE: Record<number, TaxStatus> = {
  1: "일반과세",
  2: "비과세(농특세)",
  3: "비과세",
};

const CALC_BASIS_TO_CODE: Record<CalcBasis, number> = {
  "미국 30/360": 1,
  "ACT/ACT": 2,
  "ACT/360": 3,
  "ACT/365": 4,
  "유럽 30/360": 5,
  "Business/252": 6,
};
const CALC_BASIS_BY_CODE: Record<number, CalcBasis> = {
  1: "미국 30/360",
  2: "ACT/ACT",
  3: "ACT/360",
  4: "ACT/365",
  5: "유럽 30/360",
  6: "Business/252",
};

const CURRENCY_TO_CODE: Record<Currency, number> = {
  USD: 1,
  EUR: 2,
  CNY: 3,
  JPY: 4,
  KRW: 0,
  BRL: 5,
};
const CURRENCY_BY_CODE: Record<number, Currency> = {
  1: "USD",
  2: "EUR",
  3: "CNY",
  4: "JPY",
  0: "KRW",
  5: "BRL",
};

const INVESTOR_TYPE_TO_CODE: Record<InvestorType, number> = {
  개인: 1,
  일반법인: 2,
  금융법인: 3,
};
const INVESTOR_TYPE_BY_CODE: Record<number, InvestorType> = {
  1: "개인",
  2: "일반법인",
  3: "금융법인",
};

const FIELD_COUNT = 20;

/** "1996-04-01" -> "19960401" (링크 길이를 줄이기 위한 날짜 압축) */
function stripDateDashes(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, "") : iso;
}

/** "19960401" -> "1996-04-01" */
function restoreDateDashes(compact: string): string {
  return /^\d{8}$/.test(compact)
    ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`
    : compact;
}

/**
 * 화면 전체 입력값(20개 필드)을 "|" 구분 문자열로 압축한다. 링크를 열면
 * 원본과 동일한 값으로 시작하고, 이후 영업점이 매수내역/상품수익률 항목을
 * 직접 수정하면 그때부터 달라진다. 코드값(이자지급주기/과세여부/날짜계산
 * 기준/통화/소득자구분)을 써서 JSON 키 이름 없이 값만 나열하므로 링크
 * 길이가 짧아진다.
 */
function pack(value: BondLayoutInput): string {
  const fields = [
    value.name,
    stripDateDashes(value.issueDate),
    stripDateDashes(value.maturityDate),
    value.couponRate,
    String(COUPON_FREQUENCY_TO_CODE[value.couponFrequency] ?? ""),
    stripDateDashes(value.recentCouponDate),
    String(TAX_STATUS_TO_CODE[value.taxStatus] ?? ""),
    String(CALC_BASIS_TO_CODE[value.calcBasis] ?? ""),
    value.creditRating,
    String(CURRENCY_TO_CODE[value.tradeCurrency] ?? ""),
    String(CURRENCY_TO_CODE[value.custodyCurrency] ?? ""),
    String(INVESTOR_TYPE_TO_CODE[value.investorType] ?? ""),
    value.purchaseFxRate,
    value.maturityFxRate,
    stripDateDashes(value.trustContractDate),
    value.purchaseYield,
    value.trustInvestmentAmount,
    value.frontFeeRate,
    value.backFeeRate,
    value.incomeTaxRate,
  ];
  return fields.map((f) => (f ?? "").replace(/\|/g, " ")).join("|");
}

function unpack(text: string): Partial<BondLayoutInput> | null {
  const parts = text.split("|");
  if (parts.length < FIELD_COUNT) return null;

  const [
    name,
    issueDate,
    maturityDate,
    couponRate,
    couponFrequencyCode,
    recentCouponDate,
    taxStatusCode,
    calcBasisCode,
    creditRating,
    tradeCurrencyCode,
    custodyCurrencyCode,
    investorTypeCode,
    purchaseFxRate,
    maturityFxRate,
    trustContractDate,
    purchaseYield,
    trustInvestmentAmount,
    frontFeeRate,
    backFeeRate,
    incomeTaxRate,
  ] = parts;

  const result: Partial<BondLayoutInput> = {};
  if (name) result.name = name;
  if (issueDate) result.issueDate = restoreDateDashes(issueDate);
  if (maturityDate) result.maturityDate = restoreDateDashes(maturityDate);
  if (couponRate) result.couponRate = couponRate;
  if (recentCouponDate) result.recentCouponDate = restoreDateDashes(recentCouponDate);
  if (creditRating) result.creditRating = creditRating;
  if (purchaseFxRate) result.purchaseFxRate = purchaseFxRate;
  if (maturityFxRate) result.maturityFxRate = maturityFxRate;
  if (trustContractDate) result.trustContractDate = restoreDateDashes(trustContractDate);
  if (purchaseYield) result.purchaseYield = purchaseYield;
  if (trustInvestmentAmount) result.trustInvestmentAmount = trustInvestmentAmount;
  if (frontFeeRate) result.frontFeeRate = frontFeeRate;
  if (backFeeRate) result.backFeeRate = backFeeRate;
  if (incomeTaxRate) result.incomeTaxRate = incomeTaxRate;

  if (couponFrequencyCode !== "") {
    const couponFrequency = COUPON_FREQUENCY_BY_CODE[Number(couponFrequencyCode)];
    if (couponFrequency) result.couponFrequency = couponFrequency;
  }
  if (taxStatusCode !== "") {
    const taxStatus = TAX_STATUS_BY_CODE[Number(taxStatusCode)];
    if (taxStatus) result.taxStatus = taxStatus;
  }
  if (calcBasisCode !== "") {
    const calcBasis = CALC_BASIS_BY_CODE[Number(calcBasisCode)];
    if (calcBasis) result.calcBasis = calcBasis;
  }
  if (tradeCurrencyCode !== "") {
    const tradeCurrency = CURRENCY_BY_CODE[Number(tradeCurrencyCode)];
    if (tradeCurrency) result.tradeCurrency = tradeCurrency;
  }
  if (custodyCurrencyCode !== "") {
    const custodyCurrency = CURRENCY_BY_CODE[Number(custodyCurrencyCode)];
    if (custodyCurrency) result.custodyCurrency = custodyCurrency;
  }
  if (investorTypeCode !== "") {
    const investorType = INVESTOR_TYPE_BY_CODE[Number(investorTypeCode)];
    if (investorType) result.investorType = investorType;
  }

  return result;
}

/** 화면 전체 입력값을 담아 현재 페이지 URL에 붙일 공유 링크를 만든다 */
export function encodeBondLink(value: BondLayoutInput): string {
  const encoded = compressToEncodedURIComponent(pack(value));

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("bond", encoded);
  return url.toString();
}

/** 링크의 bond 쿼리 파라미터를 화면 입력값으로 되돌린다 */
export function decodeBondLink(search: string): Partial<BondLayoutInput> | null {
  const encoded = new URLSearchParams(search).get("bond");
  if (!encoded) return null;

  try {
    const text = decompressFromEncodedURIComponent(encoded);
    if (!text) return null;
    return unpack(text);
  } catch {
    return null;
  }
}
