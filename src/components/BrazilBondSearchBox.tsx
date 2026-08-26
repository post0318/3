"use client";

import { useEffect, useRef, useState } from "react";
import { BondLayoutInput, CalcBasis, Currency } from "@/types/bondLayout";

interface BrazilBondItem {
  maturityDate: string;
  buyRate: number | null;
  sellRate: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
}

/** NTN-F는 2015년 이후 표면이율 연 10.00% 단일금리로 통일 발행된다 */
const NTNF_COUPON_RATE = "10";

interface BrazilBondSearchBoxProps {
  disabled: boolean;
  active: boolean;
  onApply: (fields: Partial<BondLayoutInput>) => void;
}

/**
 * 브라질 재무부 공식 오픈데이터 포털 tesourotransparente.gov.br의 CSV(매일 갱신,
 * 인증 불필요)에서 NTN-F(Nota do Tesouro Nacional Série F, 소매판매명
 * "Tesouro Prefixado com Juros Semestrais") 현재 거래 종목만 가져와 선택
 * 즉시 발행일/만기일/표면이율/지급주기/날짜계산기준/거래통화를 자동 반영한다.
 * NTN-F는 표면이율 연 10.00% 고정, 6개월마다(1/1, 7/1) 이자 지급, 일수계산은
 * 브라질 영업일 기준 Business/252를 쓴다(brazilCalendar.ts).
 *
 * 옛 JSON API(treasurybondsinfo.json)는 2025-08부터 죽었고 B3 공식 API는
 * B2B 전용이라 개인/자동화 접근이 불가해, 정부 오픈데이터 CSV로 대체했다.
 * 신용등급은 개별 채권 평가 대상이 아니라 tradingeconomics.com의 브라질
 * 국가신용등급(S&P/Moody's)을 가져와 반영한다(한국채권검색의 국고채권,
 * 미국채권검색의 U.S. Treasury와 동일한 취급). 발행일은 CSV에 없어,
 * NTN-F가 만기 11년 전 1월 1일에 발행되는 관행(maisretorno.com 실제
 * 발행일·Bloomberg 데이터로 확인)을 근거로 추정해 반영한다(확인 후 사용 권장).
 */
export function BrazilBondSearchBox({ disabled, active, onApply }: BrazilBondSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [bonds, setBonds] = useState<BrazilBondItem[] | null>(null);
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
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

  const toggleOpen = () => {
    setOpen((v) => !v);
    if (!open && bonds === null && !loading) {
      setLoading(true);
      setError(null);
      fetch("/api/br-bond-search")
        .then((res) => res.json())
        .then((data: { asOfDate?: string; bonds?: BrazilBondItem[]; error?: string }) => {
          if (data.error) {
            setError("온라인(Vercel) 배포판에서만 사용할 수 있습니다.");
            setBonds([]);
            return;
          }
          setAsOfDate(data.asOfDate ?? null);
          setBonds(Array.isArray(data.bonds) ? data.bonds : []);
        })
        .catch(() => setError("조회 중 오류가 발생했습니다."))
        .finally(() => setLoading(false));
    }
  };

  const selectBond = (bond: BrazilBondItem) => {
    const year = Number(bond.maturityDate.slice(0, 4));
    // NTN-F는 만기 11년 전 1월 1일에 발행되는 관행이 있다(2027→2016, 2029→2018, ...
    // 2037→2026년 발행 - maisretorno.com 실제 발행일 및 Bloomberg 기준 확인).
    const issueDate = `${year - 11}-01-01`;
    const fields: Partial<BondLayoutInput> = {
      name: `NTN-F ${NTNF_COUPON_RATE}% ${year}`,
      issueDate,
      maturityDate: bond.maturityDate,
      couponRate: NTNF_COUPON_RATE,
      couponFrequency: "6개월",
      calcBasis: "Business/252" as CalcBasis,
      tradeCurrency: "BRL" as Currency,
      creditRating: "RF",
    };

    onApply(fields);
    setStatus("일부 항목을 반영했습니다. 발행일은 NTN-F 발행 관행(만기 11년 전 1/1) 추정값이니 확인해 주세요.");
    setOpen(false);

    fetch("/api/country-rating?slug=brazil")
      .then((res) => res.json())
      .then((data: { rating?: string | null }) => {
        if (data.rating) onApply({ creditRating: data.rating });
      })
      .catch(() => {});
  };

  return (
    <div className="relative inline-flex items-center gap-2" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-blue-400 dark:disabled:text-zinc-600"
      >
        브라질채권검색
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-96 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
            NTN-F (Tesouro Prefixado com Juros Semestrais)
            {asOfDate && ` · 기준일 ${asOfDate}`}
          </p>

          {error && <p className="text-xs text-zinc-500 dark:text-zinc-400">{error}</p>}
          {loading && <p className="text-xs text-zinc-500 dark:text-zinc-400">조회 중...</p>}

          {!loading && !error && bonds && (
            <ul className="max-h-56 overflow-y-auto">
              {bonds.map((b) => (
                <li key={b.maturityDate}>
                  <button
                    type="button"
                    onClick={() => selectBond(b)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <span className="block truncate">
                      NTN-F {NTNF_COUPON_RATE}% {b.maturityDate}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {b.buyRate !== null ? `매수 ${b.buyRate}%` : ""}
                      {b.sellRate !== null ? ` · 매도 ${b.sellRate}%` : ""}
                    </span>
                  </button>
                </li>
              ))}
              {bonds.length === 0 && (
                <li className="px-2 py-1 text-xs text-zinc-400">거래 중인 종목이 없습니다.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {active && status && !open && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
      )}
    </div>
  );
}
