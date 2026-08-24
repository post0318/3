import { BondLayoutInput } from "@/types/bondLayout";

const TEMPLATE_KEYS = [
  "name",
  "issueDate",
  "maturityDate",
  "couponRate",
  "couponFrequency",
  "recentCouponDate",
  "taxStatus",
  "calcBasis",
  "creditRating",
  "tradeCurrency",
  "custodyCurrency",
] as const;

type TemplateKey = (typeof TEMPLATE_KEYS)[number];
type TemplatePayload = Pick<BondLayoutInput, TemplateKey>;

function toBase64Url(json: string): string {
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return decodeURIComponent(escape(atob(padded)));
}

/** 편입자산정보만 담아 현재 페이지 URL에 붙일 공유 링크를 만든다 */
export function encodeBondLink(value: BondLayoutInput): string {
  const payload = {} as TemplatePayload;
  for (const key of TEMPLATE_KEYS) {
    (payload as Record<TemplateKey, string>)[key] = value[key];
  }
  const encoded = toBase64Url(JSON.stringify(payload));

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
    const payload = JSON.parse(fromBase64Url(encoded));
    if (typeof payload !== "object" || payload === null) return null;

    const result: Partial<BondLayoutInput> = {};
    for (const key of TEMPLATE_KEYS) {
      const v = (payload as Record<string, unknown>)[key];
      if (typeof v === "string") {
        (result as Record<TemplateKey, string>)[key] = v;
      }
    }
    return result;
  } catch {
    return null;
  }
}
