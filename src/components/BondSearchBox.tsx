"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BondLayoutInput, Currency } from "@/types/bondLayout";

interface BondSearchItem {
  isin: string;
  name: string;
  coupon: number | null;
  currency: string | null;
  slug: string | null;
}

interface BondDetail {
  isin: string;
  issueDate: string | null;
  maturityDate: string | null;
  couponRate: number | null;
  currency: string | null;
  slug: string | null;
}

const CURRENCY_VALUES: Currency[] = ["USD", "EUR", "CNY", "JPY", "KRW"];

/**
 * boerse-frankfurt 검색 목록에는 만기일 필드가 없어(상세조회를 해야 알 수 있음),
 * 종목명 끝의 "발행연도/만기연도" 표기(예: "3,85% 22/32")에서 만기연도를 추정한다.
 * 패턴이 없으면 걸러내지 않고 그대로 남긴다(오탐으로 유효 종목을 숨기지 않기 위함).
 */
function approxMaturityYear(name: string): number | null {
  const m = name.match(/(\d{2})\/(\d{2})\s*$/);
  if (!m) return null;
  return 2000 + parseInt(m[2], 10);
}

function isNotMatured(name: string): boolean {
  const year = approxMaturityYear(name);
  if (year === null) return true;
  return year >= new Date().getFullYear();
}

interface BondSearchBoxProps {
  disabled: boolean;
  onApply: (fields: Partial<BondLayoutInput>) => void;
}

/**
 * boerse-frankfurt.de 비공식 API로 발행자→채권→상세정보(발행일/만기일/표면이율/거래통화)를
 * 조회해 편입자산정보에 반영한다. 지급주기/날짜계산기준/해외신용등급은 이 API에 값이
 * 없어 상세페이지 링크로 안내하고 직접 입력하도록 한다.
 */
export function BondSearchBox({ disabled, onApply }: BondSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [issuers, setIssuers] = useState<string[] | null>(null);
  const [issuersError, setIssuersError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIssuer, setSelectedIssuer] = useState<string | null>(null);
  const [bonds, setBonds] = useState<BondSearchItem[] | null>(null);
  const [loadingBonds, setLoadingBonds] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || issuers !== null || issuersError) return;
    let cancelled = false;
    fetch("/api/bond-issuers")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: { issuers?: string[] }) => {
        if (!cancelled) setIssuers(Array.isArray(data.issuers) ? data.issuers : []);
      })
      .catch(() => {
        if (!cancelled) {
          setIssuersError("온라인(Vercel) 배포판에서만 종목검색을 사용할 수 있습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, issuers, issuersError]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const matchingIssuers = useMemo(() => {
    if (!issuers || selectedIssuer) return [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return issuers.filter((i) => i.toLowerCase().includes(keyword)).slice(0, 15);
  }, [issuers, query, selectedIssuer]);

  const filteredBonds = useMemo(() => {
    if (!bonds) return [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return bonds;
    return bonds.filter((b) =>
      `${b.name} ${b.coupon ?? ""}`.toLowerCase().includes(keyword)
    );
  }, [bonds, query]);

  const selectIssuer = (issuer: string) => {
    setSelectedIssuer(issuer);
    setQuery("");
    setBonds(null);
    setStatus(null);
    setLoadingBonds(true);
    fetch(`/api/bond-search?issuer=${encodeURIComponent(issuer)}`)
      .then((res) => res.json())
      .then((data: { bonds?: BondSearchItem[] }) => {
        const all = Array.isArray(data.bonds) ? data.bonds : [];
        setBonds(all.filter((b) => isNotMatured(b.name)));
      })
      .catch(() => setStatus("채권 목록을 불러오지 못했습니다."))
      .finally(() => setLoadingBonds(false));
  };

  const selectBond = (bond: BondSearchItem) => {
    setStatus("조회 중...");
    fetch(`/api/bond-detail?isin=${encodeURIComponent(bond.isin)}`)
      .then((res) => res.json())
      .then((data: BondDetail) => {
        const fields: Partial<BondLayoutInput> = {};
        fields.name = bond.name;
        if (data.issueDate) fields.issueDate = data.issueDate;
        if (data.maturityDate) fields.maturityDate = data.maturityDate;
        if (typeof data.couponRate === "number") fields.couponRate = String(data.couponRate);
        if (data.currency && CURRENCY_VALUES.includes(data.currency as Currency)) {
          fields.tradeCurrency = data.currency as Currency;
        }
        onApply(fields);
        setDetailSlug(data.slug ?? bond.slug ?? null);
        setStatus("OK");
        setOpen(false);
      })
      .catch(() => setStatus("상세정보를 불러오지 못했습니다."));
  };

  const resetIssuer = () => {
    setSelectedIssuer(null);
    setBonds(null);
    setQuery("");
  };

  return (
    <div className="relative inline-flex items-center gap-2" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-blue-400 dark:disabled:text-zinc-600"
      >
        종목검색
      </button>

      {detailSlug && (
        <a
          href={`https://www.boerse-frankfurt.de/bond/${detailSlug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
        >
          상세페이지 열기
        </a>
      )}

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {issuersError ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{issuersError}</p>
          ) : (
            <>
              {selectedIssuer && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    {selectedIssuer}
                  </span>
                  <button
                    type="button"
                    onClick={resetIssuer}
                    className="shrink-0 text-xs text-zinc-400 hover:underline"
                  >
                    ← 다른 발행자
                  </button>
                </div>
              )}
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  selectedIssuer ? "채권명/쿠폰으로 좁히기 (예: 5.4)" : "발행자명 입력 (예: META)"
                }
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />

              {!selectedIssuer && (
                <ul className="mt-2 max-h-56 overflow-y-auto">
                  {matchingIssuers.map((issuer) => (
                    <li key={issuer}>
                      <button
                        type="button"
                        onClick={() => selectIssuer(issuer)}
                        className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {issuer}
                      </button>
                    </li>
                  ))}
                  {query.trim() && matchingIssuers.length === 0 && (
                    <li className="px-2 py-1 text-xs text-zinc-400">일치하는 발행자가 없습니다.</li>
                  )}
                </ul>
              )}

              {selectedIssuer && loadingBonds && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">불러오는 중...</p>
              )}

              {selectedIssuer && !loadingBonds && (
                <ul className="mt-2 max-h-56 overflow-y-auto">
                  {filteredBonds.map((bond) => (
                    <li key={bond.isin}>
                      <button
                        type="button"
                        onClick={() => selectBond(bond)}
                        className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <span className="block truncate">{bond.name}</span>
                        <span className="text-xs text-zinc-400">{bond.isin}</span>
                      </button>
                    </li>
                  ))}
                  {filteredBonds.length === 0 && (
                    <li className="px-2 py-1 text-xs text-zinc-400">일치하는 종목이 없습니다.</li>
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {status && !open && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{status}</p>
      )}
    </div>
  );
}
