import { TaxStatus } from "@/types/bondLayout";

const GENERAL_TAX_RATE = 0.14;

/**
 * 과세여부가 일반과세면 개인/법인 모두 14%, 비과세·비과세(농특세)면 개인/법인 모두 0%.
 * (비과세(농특세)는 소득세는 0%이나 농특세는 별도로 부과된다.)
 */
export function getEffectiveIncomeTaxRate(taxStatus: TaxStatus): number {
  return taxStatus === "일반과세" ? GENERAL_TAX_RATE : 0;
}
