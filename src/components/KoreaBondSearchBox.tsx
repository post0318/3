"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  active: boolean;
  onApply: (fields: Partial<BondLayoutInput>) => void;
}

/**
 * SEIBRO(seibro.or.kr) 채권 상세페이지의 신용등급 조회는 WebSquare 기반
 * 동적 페이지라 서버에서 값을 직접 긁어오려면 브라우저 부트로딩 시퀀스를
 * 흉내내야 하는데, 자동화된 반복 호출은 곧바로 차단당해(서버오류3) 배포
 * 환경에서 신뢰할 수 없었다. 그래서 신용등급은 자동 반영하지 않고, 종목
 * 선택 시 해당 ISIN의 SEIBRO 상세페이지로 바로 이동하는 참조 링크만 제공해
 * 사용자가 직접 확인 후 입력하도록 한다. 다만 국고채권은 개별 채권 신용평가
 * 대상이 아니라, tradingeconomics.com/country-list/rating(정적 HTML, 인증
 * 불필요, 반복 호출도 막히지 않음을 확인)에서 대한민국 국가신용등급(S&P/
 * Moody's만, DBRS 제외)을 가져와 신용등급으로 자동 반영한다(조회 지연에 대비해
 * 우선 "RF"를 반영해두고 성공 시 실제 등급으로 갱신). 미국채권검색에서
 * 미국국채에 미국 국가신용등급을 반영하는 것과 동일한 취급이다.
 *
 * 금융위원회_채권기본정보(data.go.kr, 원천: 한국예탁결제원) API로 국내 채권을
 * 발행회사명(부분일치)으로 검색해 발행일/만기일/표면이율/지급주기/거래통화를
 * 자동 반영한다. 날짜계산기준은 원화채권 관행에 맞춰 종목별로 자동 반영한다
 * (국고채권=ACT/ACT, 그 외 회사채/금융채/특수채/단기채 등=ACT/365). 미국채권검색의
 * U.S. Treasury 버튼과 동일한 "선택" 방식으로 국고채권 전용 바로가기 버튼을
 * 최상단에 둔다. 클릭하면(=국고채권 선택) 목록을 한 번만 받아온 뒤 재조회 없이
 * 입력창은 채권명/쿠폰으로 그 목록만 좁히는 용도로 바뀌고, "← 다른 회사"
 * 버튼으로만 일반 검색으로 되돌아간다(입력창에 타이핑해도 선택이 풀리지
 * 않는다). 공공누리
 * 2유형(출처표시·상업적 이용금지) —
 * 상업적 활용은 한국예탁결제원과 별도 계약이 필요하다.
 */
function seibroDetailUrl(bond: KoreaBondItem): string {
  const params = new URLSearchParams({
    w2xPath: "/IPORTAL/user/bond/BIP_CNTS03005V.xml",
    ISIN: bond.isin,
    menuNo: "88",
  });
  return `https://seibro.or.kr/websquare/control.jsp?${params.toString()}`;
}

export function KoreaBondSearchBox({ disabled, active, onApply }: KoreaBondSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [treasuryOnly, setTreasuryOnly] = useState(false);
  const [bonds, setBonds] = useState<KoreaBondItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingLink, setRatingLink] = useState<string | null>(null);
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
    if (treasuryOnly) return;
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
  }, [query, treasuryOnly]);

  /** 국고채권 선택 후에는 재조회 없이, 이미 받아온 목록을 채권명/쿠폰 텍스트로만 좁힌다(U.S. Treasury 선택 후와 동일한 방식) */
  const filteredBonds = useMemo(() => {
    if (!bonds) return [];
    if (!treasuryOnly) return bonds;
    const keyword = query.trim().toLowerCase();
    if (!keyword) return bonds;
    return bonds.filter((b) =>
      `${b.name} ${b.couponRate ?? ""}`.toLowerCase().includes(keyword)
    );
  }, [bonds, treasuryOnly, query]);

  const selectTreasury = () => {
    setTreasuryOnly(true);
    setQuery("");
    setBonds(null);
    setError(null);
    setLoading(true);
    fetch(`/api/kr-bond-search?issuer=${encodeURIComponent("국고채권")}`)
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
  };

  const resetTreasury = () => {
    setTreasuryOnly(false);
    setQuery("");
    setBonds(null);
    setError(null);
  };

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
    const isTreasury = bond.name.includes("국고채권");
    if (isKrw) {
      // 국고채권(이표채)은 ACT/ACT, 그 외(회사채/금융채/특수채/단기채 등)는 ACT/365 관행을 따른다.
      fields.calcBasis = (isTreasury ? "ACT/ACT" : "ACT/365") as CalcBasis;
    }
    if (isTreasury) {
      fields.creditRating = "RF";
    }

    onApply(fields);
    setRatingLink(isTreasury ? null : seibroDetailUrl(bond));
    setOpen(false);

    if (isTreasury) {
      fetch("/api/country-rating?slug=south-korea")
        .then((res) => res.json())
        .then((data: { rating?: string | null }) => {
          if (data.rating) onApply({ creditRating: data.rating });
        })
        .catch(() => {});
    }
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
          {treasuryOnly ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                국고채권
              </span>
              <button
                type="button"
                onClick={resetTreasury}
                className="shrink-0 text-xs text-zinc-400 hover:underline"
              >
                ← 다른 회사
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={selectTreasury}
              className="mb-2 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              국고채권
            </button>
          )}
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              treasuryOnly
                ? "채권명/쿠폰으로 좁히기 (예: 24-2 또는 3.0)"
                : "발행회사명 또는 채권종류 입력 (예: 롯데케미칼, 국채, 지방채)"
            }
            className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />

          {error && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{error}</p>}
          {loading && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">조회 중...</p>}

          {!loading && !error && bonds && (
            <ul className="mt-2 max-h-56 overflow-y-auto">
              {filteredBonds.map((b, i) => (
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
              {filteredBonds.length === 0 && (
                <li className="px-2 py-1 text-xs text-zinc-400">일치하는 종목이 없습니다.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {active && ratingLink && !open && (
        <a
          href={ratingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
        >
          SEIBRO에서 신용등급 확인
        </a>
      )}
    </div>
  );
}
