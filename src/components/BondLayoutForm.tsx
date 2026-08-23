"use client";

import { ChangeEvent, ReactNode, useState } from "react";
import {
  BondLayoutInput,
  CalcBasis,
  CouponFrequency,
  Currency,
  InvestorType,
} from "@/types/bondLayout";
import { getTrustMaturityDate } from "@/lib/couponSchedule";
import { parseBondFile } from "@/lib/parseBondFile";

interface BondLayoutFormProps {
  value: BondLayoutInput;
  onChange: (value: BondLayoutInput) => void;
}

const CALC_BASIS_OPTIONS: CalcBasis[] = [
  "미국 30/360",
  "ACT/ACT",
  "ACT/360",
  "ACT/365",
  "유럽 30/360",
];

const INVESTOR_TYPE_OPTIONS: InvestorType[] = ["개인", "일반법인", "금융법인"];

const COUPON_FREQUENCY_OPTIONS: CouponFrequency[] = ["3개월", "6개월", "12개월"];

const CURRENCY_OPTIONS: Currency[] = ["USD", "EUR", "CNY", "JPY", "KRW"];

const cellBase = "flex items-center px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-800";
const labelCellClass = `${cellBase} bg-zinc-50 font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400`;
const valueCellClass = `${cellBase} bg-white dark:bg-zinc-950`;
const inputClass =
  "w-full bg-transparent text-sm text-zinc-900 outline-none dark:text-zinc-100";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-2">
      <div className={labelCellClass}>{label}</div>
      <div className={valueCellClass}>{children}</div>
    </div>
  );
}

function ComputedValue() {
  return (
    <span className="text-sm italic text-zinc-400 dark:text-zinc-600">
      자동계산
    </span>
  );
}

function BlankValue() {
  return <span>&nbsp;</span>;
}

function GroupCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="border border-b-0 border-zinc-200 bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        {title}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

export function BondLayoutForm({ value, onChange }: BondLayoutFormProps) {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const update = <K extends keyof BondLayoutInput>(
    key: K,
    val: BondLayoutInput[K]
  ) => onChange({ ...value, [key]: val });

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseBondFile(buffer);
      const count = Object.keys(parsed).length;
      if (count === 0) {
        setUploadStatus("일치하는 항목을 찾지 못했습니다.");
        return;
      }
      onChange({ ...value, ...parsed });
      setUploadStatus(`${count}개 항목을 반영했습니다.`);
    } catch {
      setUploadStatus("파일을 읽는 중 오류가 발생했습니다.");
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="mb-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        입력 레이아웃
      </h2>

      {/* 소득자구분 / 편입자산정보 업로드 */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <Row label="소득자구분">
            <select
              className={inputClass}
              value={value.investorType}
              onChange={(e) =>
                update("investorType", e.target.value as InvestorType)
              }
            >
              {INVESTOR_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Row>
        </div>
        <div className="hidden md:block" />
        <div className="flex flex-col justify-center gap-2">
          <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800">
            편입자산정보 업로드
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleUpload}
            />
          </label>
          {uploadStatus && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {uploadStatus}
            </p>
          )}
        </div>
      </div>

      {/* 편입자산정보 / 매수내역 / 상품수익률 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <GroupCard title="편입자산정보">
          <Row label="종목명">
            <input
              className={inputClass}
              type="text"
              placeholder="예: KORELE 7.95 04/01/2096"
              value={value.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </Row>
          <Row label="발행일">
            <input
              className={inputClass}
              type="date"
              value={value.issueDate}
              onChange={(e) => update("issueDate", e.target.value)}
            />
          </Row>
          <Row label="만기일">
            <input
              className={inputClass}
              type="date"
              value={value.maturityDate}
              onChange={(e) => update("maturityDate", e.target.value)}
            />
          </Row>
          <Row label="표면이율">
            <input
              className={inputClass}
              type="number"
              step="0.0001"
              value={value.couponRate}
              onChange={(e) => update("couponRate", Number(e.target.value))}
            />
          </Row>
          <Row label="이자지급 주기">
            <select
              className={inputClass}
              value={value.couponFrequency}
              onChange={(e) =>
                update("couponFrequency", e.target.value as CouponFrequency)
              }
            >
              {COUPON_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Row>
          <Row label="날짜계산 기준">
            <select
              className={inputClass}
              value={value.calcBasis}
              onChange={(e) =>
                update("calcBasis", e.target.value as CalcBasis)
              }
            >
              {CALC_BASIS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Row>
          <Row label="해외신용등급">
            <input
              className={inputClass}
              type="text"
              placeholder="예: 무디스: Aa2 / S&P: AA"
              value={value.creditRating}
              onChange={(e) => update("creditRating", e.target.value)}
            />
          </Row>
          <Row label="거래통화">
            <select
              className={inputClass}
              value={value.tradeCurrency}
              onChange={(e) =>
                update("tradeCurrency", e.target.value as Currency)
              }
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Row>
          <Row label="수탁통화">
            <select
              className={inputClass}
              value={value.custodyCurrency}
              onChange={(e) =>
                update("custodyCurrency", e.target.value as Currency)
              }
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </Row>
          <Row label="매수시점환율">
            <ComputedValue />
          </Row>
          <Row label="만기예상환율(예상)">
            <ComputedValue />
          </Row>
        </GroupCard>

        <GroupCard title="매수내역">
          <Row label="신탁투자금액">
            <BlankValue />
          </Row>
          <Row label="선취보수(차감)">
            <ComputedValue />
          </Row>
          <Row label="매수가능금액">
            <ComputedValue />
          </Row>
          <Row label="채권권면액">
            <ComputedValue />
          </Row>
          <Row label="매수단가(clean)">
            <ComputedValue />
          </Row>
          <Row label="매수단가(dirty)">
            <ComputedValue />
          </Row>
          <Row label="매수금리(YTM)">
            <input
              className={inputClass}
              type="number"
              step="0.0001"
              value={value.purchaseYield}
              onChange={(e) => update("purchaseYield", Number(e.target.value))}
            />
          </Row>
          <Row label="경과이자(100$)">
            <ComputedValue />
          </Row>
          <Row label="결제금액">
            <ComputedValue />
          </Row>
          <Row label="현금잔액">
            <ComputedValue />
          </Row>
        </GroupCard>

        <GroupCard title="상품수익률">
          <Row label="신탁계약일">
            <input
              className={inputClass}
              type="date"
              value={value.trustContractDate}
              onChange={(e) => update("trustContractDate", e.target.value)}
            />
          </Row>
          <Row label="신탁만기일">
            {getTrustMaturityDate(value.maturityDate) ? (
              <span className="text-sm text-zinc-900 dark:text-zinc-100">
                {getTrustMaturityDate(value.maturityDate)}
              </span>
            ) : (
              <ComputedValue />
            )}
          </Row>
          <Row label="투자일수">
            <ComputedValue />
          </Row>
          <Row label="선취보수율(%)">
            <input
              className={inputClass}
              type="number"
              step="0.01"
              placeholder="예: 3"
              value={value.frontFeeRate ?? ""}
              onChange={(e) =>
                update(
                  "frontFeeRate",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            />
          </Row>
          <Row label="후취보수율(%)">
            <input
              className={inputClass}
              type="number"
              step="0.01"
              placeholder="예: 0.5"
              value={value.backFeeRate ?? ""}
              onChange={(e) =>
                update(
                  "backFeeRate",
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
            />
          </Row>
          <Row label="만기시 세전금액">
            <ComputedValue />
          </Row>
          <Row label="마지막 후취보수">
            <ComputedValue />
          </Row>
          <Row label="만기시 세후금액">
            <ComputedValue />
          </Row>
          <Row label="세전수익률">
            <ComputedValue />
          </Row>
          <Row label="세후수익률">
            <ComputedValue />
          </Row>
          <Row label="은행환산수익률">
            <ComputedValue />
          </Row>
        </GroupCard>
      </div>
    </section>
  );
}
