import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  Currency,
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
};
const CALC_BASIS_BY_CODE: Record<number, CalcBasis> = {
  1: "미국 30/360",
  2: "ACT/ACT",
  3: "ACT/360",
  4: "ACT/365",
  5: "유럽 30/360",
};

const CURRENCY_TO_CODE: Record<Currency, number> = {
  USD: 1,
  EUR: 2,
  CNY: 3,
  JPY: 4,
  KRW: 0,
};
const CURRENCY_BY_CODE: Record<number, Currency> = {
  1: "USD",
  2: "EUR",
  3: "CNY",
  4: "JPY",
  0: "KRW",
};

function toBase64Url(text: string): string {
  const base64 = btoa(unescape(encodeURIComponent(text)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

/**
 * 편입자산정보 11개 필드를 "|" 구분 문자열로 압축한다.
 * 코드값(이자지급주기/과세여부/날짜계산기준/통화)을 써서 JSON 키 이름 없이
 * 값만 나열하므로 링크 길이가 JSON 방식보다 크게 줄어든다.
 */
function pack(value: BondLayoutInput): string {
  const fields = [
    value.name,
    value.issueDate,
    value.maturityDate,
    value.couponRate,
    String(COUPON_FREQUENCY_TO_CODE[value.couponFrequency] ?? ""),
    value.recentCouponDate,
    String(TAX_STATUS_TO_CODE[value.taxStatus] ?? ""),
    String(CALC_BASIS_TO_CODE[value.calcBasis] ?? ""),
    value.creditRating,
    String(CURRENCY_TO_CODE[value.tradeCurrency] ?? ""),
    String(CURRENCY_TO_CODE[value.custodyCurrency] ?? ""),
  ];
  return fields.map((f) => (f ?? "").replace(/\|/g, " ")).join("|");
}

function unpack(text: string): Partial<BondLayoutInput> | null {
  const parts = text.split("|");
  if (parts.length < 11) return null;

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
  ] = parts;

  const result: Partial<BondLayoutInput> = {};
  if (name) result.name = name;
  if (issueDate) result.issueDate = issueDate;
  if (maturityDate) result.maturityDate = maturityDate;
  if (couponRate) result.couponRate = couponRate;
  if (recentCouponDate) result.recentCouponDate = recentCouponDate;
  if (creditRating) result.creditRating = creditRating;

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

  return result;
}

/** 편입자산정보만 담아 현재 페이지 URL에 붙일 공유 링크를 만든다 */
export function encodeBondLink(value: BondLayoutInput): string {
  const encoded = toBase64Url(pack(value));

  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("bond", encoded);
  return url.toString();
}

/** 링크의 bond 쿼리 파라미터를 편입자산정보 필드로 되돌린다 */
export function decodeBondLink(search: string): Partial<BondLayoutInput> | null {
  const encoded = new URLSearchParams(search).get("bond");
  if (!encoded) return null;

  try {
    return unpack(fromBase64Url(encoded));
  } catch {
    return null;
  }
}
