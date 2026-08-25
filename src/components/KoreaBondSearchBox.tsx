"use client";

import { useEffect, useRef, useState } from "react";
import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  Currency,
} from "@/types/bondLayout";

interface KoreaBondItem {
  isin: string;
  name: string;
  issuer: string;
  issueDate: string | null;
  maturityDate: string | null;
  couponRate: number | null;
  currency: string | null;
  paymentCycle: string | null;
}

const CURRENCY_VALUES: Currency[] = ["USD", "EUR", "CNY", "JPY", "KRW"];
const COUPON_FREQUENCY_VALUES: CouponFrequency[] = ["3개월", "6개월", "12개월"];

interface KoreaBondSearchBoxProps {
  disabled: boolean;
  onApply: (fields: Partial<BondLayoutInput>) => void;
}

/**
 * 금융위원회_채권기본정보(data.go.kr, 원천: 한국예탁결제원) API로 국내 채권을
 * 발행회사명(부분일치)으로 검색해 발행일/만기일/표면이율/지급주기/거래통화를
 * 자동 반영한다. 신용등급은 이 API에 없어 수동 입력이 필요하고, 날짜계산기준은
 * 원화채권 시장 관행(ACT/365)을 가정값으로 반영한다(확인 후 사용 권장).
 * 공공누리 2유형(출처표시·상업적 이용금지) — 상업적 활용은 한국예탁결제원과
 * 별도 계약이 필요하다.
 */
export function KoreaBondSearchBox({ disabled, onApply }: KoreaBondSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bonds, setBonds] = useState<KoreaBondItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const keyword = query.trim();
    const timer = setTimeout(() => {
      if (keyword.length < 2) {
        setBonds(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      fetch(`/api/kr-bond-search?issuer=${encodeURIComponent(keyword)}`)
        .then((res) => res.json())
        .then((data: { bonds?: KoreaBondItem[]; error?: string }) => {
          if (data.error) {
            setError("온라인(Vercel) 배포판에서만, 그리고 서비스키가 설정된 경우에만 사용할 수 있습니다.");
            setBonds([]);
            return;
          }
          const today = new Date().toISOString().slice(0, 10);
          const all = Array.isArray(data.bonds) ? data.bonds : [];
          setBonds(all.filter((b) => !b.maturityDate || b.maturityDate >= today));
        })
        .catch(() => setError("조회 중 오류가 발생했습니다."))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const selectBond = (bond: KoreaBondItem) => {
    const fields: Partial<BondLayoutInput> = {};
    if (bond.name) fields.name = bond.name;
    if (bond.issueDate) fields.issueDate = bond.issueDate;
    if (bond.maturityDate) fields.maturityDate = bond.maturityDate;
    if (bond.couponRate !== null) fields.couponRate = String(bond.couponRate);
    if (bond.paymentCycle && COUPON_FREQUENCY_VALUES.includes(bond.paymentCycle as CouponFrequency)) {
      fields.couponFrequency = bond.paymentCycle as CouponFrequency;
    }
    let isKrw = false;
    if (bond.currency && CURRENCY_VALUES.includes(bond.currency as Currency)) {
      fields.tradeCurrency = bond.currency as Currency;
      isKrw = bond.currency === "KRW";
    }
    let calcBasisApplied = false;
    if (isKrw) {
      fields.calcBasis = "ACT/365" as CalcBasis;
      calcBasisApplied = true;
    }

    onApply(fields);

    const missing = ["신용등급"];
    if (!calcBasisApplied) missing.push("날짜계산기준");
    setStatus(
      isKrw
        ? `일부 항목을 반영했습니다. 날짜계산기준은 원화채권 관행(ACT/365) 가정값이니 확인해 주세요. 신용등급은 자동으로 찾지 못해 직접 입력이 필요합니다.`
        : `일부 항목을 반영했습니다. ${missing.join("/")}은(는) 자동으로 찾지 못해 직접 입력이 필요합니다.`
    );
    setOpen(false);
  };

  return (
    <div className="relative inline-flex items-center gap-2" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-blue-400 dark:disabled:text-zinc-600"
      >
        한국채권검색
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-96 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="발행회사명 입력 (예: 롯데케미칼)"
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />

          {error && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{error}</p>}
          {loading && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">조회 중...</p>}

          {!loading && !error && bonds && (
            <ul className="mt-2 max-h-56 overflow-y-auto">
              {bonds.map((b, i) => (
                <li key={`${b.isin}-${i}`}>
                  <button
                    type="button"
                    onClick={() => selectBond(b)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className="block truncate">{b.name}</span>
                    <span className="text-xs text-zinc-400">
                      {b.isin} {b.couponRate !== null ? `· ${b.couponRate}%` : ""}
                    </span>
                  </button>
                </li>
              ))}
              {bonds.length === 0 && (
                <li className="px-2 py-1 text-xs text-zinc-400">일치하는 종목이 없습니다.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {status && !open && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
      )}
    </div>
  );
}
