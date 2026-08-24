"use client";

import { useMemo, useState } from "react";
import { BondLayoutForm } from "@/components/BondLayoutForm";
import { CashFlowTable } from "@/components/CashFlowTable";
import { generateFixCashFlow } from "@/lib/cashFlowSchedule";
import { BondLayoutInput } from "@/types/bondLayout";

function todayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createDefaultInput(): BondLayoutInput {
  return {
    calcBasis: "미국 30/360",
    investorType: "개인",
    name: "",
    issueDate: "",
    maturityDate: "",
    couponRate: "",
    couponFrequency: "6개월",
    recentCouponDate: "",
    taxStatus: "일반과세",
    creditRating: "",
    tradeCurrency: "USD",
    custodyCurrency: "USD",
    purchaseFxRate: "1",
    maturityFxRate: "1",
    trustContractDate: todayDateString(),
    purchaseYield: "",
    trustInvestmentAmount: "",
    frontFeeRate: "",
    backFeeRate: "",
    incomeTaxRate: "",
  };
}

export default function Home() {
  const [input, setInput] = useState<BondLayoutInput>(createDefaultInput);

  const cashFlowRows = useMemo(
    () =>
      generateFixCashFlow({
        maturityDate: input.maturityDate,
        couponRate: input.couponRate,
        couponFrequency: input.couponFrequency,
        purchaseYield: input.purchaseYield,
        calcBasis: input.calcBasis,
        trustContractDate: input.trustContractDate,
        recentCouponDate: input.recentCouponDate,
        custodyCurrency: input.custodyCurrency,
        purchaseFxRate: input.purchaseFxRate,
        trustInvestmentAmount: input.trustInvestmentAmount,
        frontFeeRate: input.frontFeeRate,
        backFeeRate: input.backFeeRate,
        investorType: input.investorType,
        taxStatus: input.taxStatus,
      }),
    [
      input.maturityDate,
      input.couponRate,
      input.couponFrequency,
      input.purchaseYield,
      input.calcBasis,
      input.trustContractDate,
      input.recentCouponDate,
      input.custodyCurrency,
      input.purchaseFxRate,
      input.trustInvestmentAmount,
      input.frontFeeRate,
      input.backFeeRate,
      input.investorType,
      input.taxStatus,
    ]
  );

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            채권세상
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            채권정보만 입력하면 현금흐름을 보여주는 서비스
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <BondLayoutForm value={input} onChange={setInput} />
          <CashFlowTable
            rows={cashFlowRows}
            tradeCurrency={input.tradeCurrency}
            custodyCurrency={input.custodyCurrency}
            name={input.name}
          />
        </div>
      </main>
    </div>
  );
}
