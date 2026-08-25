"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  Currency,
} from "@/types/bondLayout";

interface CompanyInfo {
  cik: string;
  ticker: string;
  name: string;
}

interface OfferingSummary {
  accessionNumber: string;
  filedDate: string;
  indexUrl: string;
}

interface BondTranche {
  label: string;
  maturityDate: string | null;
  couponRate: number | null;
  isin: string | null;
  rating: string | null;
  couponFrequencyMonths: number | null;
  settlementDate: string | null;
  calcBasis: string | null;
}

interface FwpDetail {
  tranches: BondTranche[];
  currency: string;
  issuer: string | null;
}

const CURRENCY_VALUES: Currency[] = ["USD", "EUR", "CNY", "JPY", "KRW"];
const CALC_BASIS_VALUES: CalcBasis[] = [
  "미국 30/360",
  "ACT/ACT",
  "ACT/360",
  "ACT/365",
  "유럽 30/360",
];

function frequencyFromMonths(months: number | null): CouponFrequency | null {
  if (months === 3) return "3개월";
  if (months === 6) return "6개월";
  if (months === 12) return "12개월";
  return null;
}

interface UsBondSearchBoxProps {
  disabled: boolean;
  onApply: (fields: Partial<BondLayoutInput>) => void;
}

/**
 * SEC EDGAR(공식·자동화 허용)의 FWP(가격결정 조건표) 문서를 서버에서 파싱해
 * 미국 등록채권의 발행일/만기일/표면이율/지급주기/날짜계산기준/신용등급/거래통화를
 * 자동 반영한다. 발행사·주간사마다 문서 서식이 달라 100% 정확하지 않을 수 있다.
 */
export function UsBondSearchBox({ disabled, onApply }: UsBondSearchBoxProps) {
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyInfo[] | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<CompanyInfo | null>(null);
  const [offerings, setOfferings] = useState<OfferingSummary[] | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [tranches, setTranches] = useState<BondTranche[] | null>(null);
  const [issuer, setIssuer] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>("USD");
  const [loadingTranches, setLoadingTranches] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || companies !== null || companiesError) return;
    let cancelled = false;
    fetch("/api/us-companies")
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: { companies?: CompanyInfo[] }) => {
        if (!cancelled) setCompanies(Array.isArray(data.companies) ? data.companies : []);
      })
      .catch(() => {
        if (!cancelled) setCompaniesError("온라인(Vercel) 배포판에서만 미국채권검색을 사용할 수 있습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, companies, companiesError]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const matchingCompanies = useMemo(() => {
    if (!companies || selectedCompany) return [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return companies
      .filter((c) => c.name.toLowerCase().includes(keyword) || c.ticker.toLowerCase() === keyword)
      .slice(0, 15);
  }, [companies, query, selectedCompany]);

  const selectCompany = (company: CompanyInfo) => {
    setSelectedCompany(company);
    setQuery("");
    setOfferings(null);
    setTranches(null);
    setStatus(null);
    setLoadingOfferings(true);
    fetch(`/api/us-bond-offerings?cik=${company.cik}`)
      .then((res) => res.json())
      .then((data: { offerings?: OfferingSummary[] }) =>
        setOfferings(Array.isArray(data.offerings) ? data.offerings : [])
      )
      .catch(() => setStatus("채권 발행 이력을 불러오지 못했습니다."))
      .finally(() => setLoadingOfferings(false));
  };

  const selectOffering = (offering: OfferingSummary) => {
    if (!selectedCompany) return;
    setTranches(null);
    setLoadingTranches(true);
    setStatus(null);
    const params = new URLSearchParams({
      cik: selectedCompany.cik,
      indexUrl: offering.indexUrl,
      filedDate: offering.filedDate,
    });
    fetch(`/api/us-bond-detail?${params}`)
      .then((res) => res.json())
      .then((data: FwpDetail) => {
        setTranches(data.tranches ?? []);
        setIssuer(data.issuer ?? selectedCompany.name);
        setCurrency(data.currency ?? "USD");
      })
      .catch(() => setStatus("조건표를 불러오지 못했습니다."))
      .finally(() => setLoadingTranches(false));
  };

  const applyTranche = (tranche: BondTranche) => {
    const fields: Partial<BondLayoutInput> = {};
    const displayIssuer = issuer ?? selectedCompany?.name ?? "";
    if (displayIssuer && tranche.couponRate !== null && tranche.maturityDate) {
      const year = tranche.maturityDate.slice(0, 4);
      fields.name = `${displayIssuer} ${tranche.couponRate}% ${year}`;
    }
    if (tranche.settlementDate) fields.issueDate = tranche.settlementDate;
    if (tranche.maturityDate) fields.maturityDate = tranche.maturityDate;
    if (tranche.couponRate !== null) fields.couponRate = String(tranche.couponRate);
    if (tranche.rating) fields.creditRating = tranche.rating;
    if (tranche.calcBasis && CALC_BASIS_VALUES.includes(tranche.calcBasis as CalcBasis)) {
      fields.calcBasis = tranche.calcBasis as CalcBasis;
    }
    const frequency = frequencyFromMonths(tranche.couponFrequencyMonths);
    if (frequency) fields.couponFrequency = frequency;
    if (CURRENCY_VALUES.includes(currency as Currency)) {
      fields.tradeCurrency = currency as Currency;
    }

    onApply(fields);

    const missing: string[] = [];
    if (!tranche.rating) missing.push("신용등급");
    if (!frequency) missing.push("지급주기");
    if (!tranche.calcBasis) missing.push("날짜계산기준");
    setStatus(
      missing.length > 0
        ? `일부 항목을 반영했습니다. ${missing.join("/")}은(는) 자동으로 찾지 못해 직접 입력이 필요합니다.`
        : "발행일·만기일·표면이율·지급주기·날짜계산기준·신용등급·거래통화를 모두 반영했습니다."
    );
    setOpen(false);
  };

  const resetCompany = () => {
    setSelectedCompany(null);
    setOfferings(null);
    setTranches(null);
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
        미국채권검색(SEC)
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-96 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {companiesError ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{companiesError}</p>
          ) : (
            <>
              {selectedCompany && (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    {selectedCompany.name} ({selectedCompany.ticker})
                  </span>
                  <button
                    type="button"
                    onClick={resetCompany}
                    className="shrink-0 text-xs text-zinc-400 hover:underline"
                  >
                    ← 다른 회사
                  </button>
                </div>
              )}

              {!selectedCompany && (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="회사명/티커 입력 (예: Apple)"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                  <ul className="mt-2 max-h-56 overflow-y-auto">
                    {matchingCompanies.map((c) => (
                      <li key={c.cik}>
                        <button
                          type="button"
                          onClick={() => selectCompany(c)}
                          className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {c.name} <span className="text-xs text-zinc-400">{c.ticker}</span>
                        </button>
                      </li>
                    ))}
                    {query.trim() && matchingCompanies.length === 0 && (
                      <li className="px-2 py-1 text-xs text-zinc-400">일치하는 회사가 없습니다.</li>
                    )}
                  </ul>
                </>
              )}

              {selectedCompany && !tranches && (
                <>
                  {loadingOfferings && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">발행 이력 불러오는 중...</p>
                  )}
                  {!loadingOfferings && offerings && (
                    <ul className="max-h-56 overflow-y-auto">
                      {offerings.map((o) => (
                        <li key={o.accessionNumber}>
                          <button
                            type="button"
                            onClick={() => selectOffering(o)}
                            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                          >
                            {o.filedDate || o.accessionNumber} 발행 조건표
                          </button>
                        </li>
                      ))}
                      {offerings.length === 0 && (
                        <li className="px-2 py-1 text-xs text-zinc-400">
                          최근 채권 발행(FWP) 이력이 없습니다.
                        </li>
                      )}
                    </ul>
                  )}
                  {loadingTranches && (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">조건표 분석 중...</p>
                  )}
                </>
              )}

              {tranches && (
                <>
                  <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
                    발행 만기별로 선택하세요.
                  </p>
                  <ul className="max-h-56 overflow-y-auto">
                    {tranches.map((t, i) => (
                      <li key={`${t.isin ?? i}`}>
                        <button
                          type="button"
                          onClick={() => applyTranche(t)}
                          className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          {t.label || `만기 ${t.maturityDate ?? "-"}`}
                          {t.couponRate !== null ? ` · ${t.couponRate}%` : ""}
                          <span className="ml-1 text-xs text-zinc-400">{t.isin}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setTranches(null)}
                    className="mt-1 text-xs text-zinc-400 hover:underline"
                  >
                    ← 다른 발행 선택
                  </button>
                </>
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
