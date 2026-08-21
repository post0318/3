"use client";

import { useMemo, useState } from "react";
import { BondInputForm } from "@/components/BondInputForm";
import { CashFlowTable } from "@/components/CashFlowTable";
import { generateCashFlow } from "@/lib/cashflow";
import { BondInput } from "@/types/bond";

const DEFAULT_INPUT: BondInput = {
  name: "",
  faceValue: 10000000,
  couponRate: 5,
  issueDate: "",
  maturityDate: "",
  couponFrequency: 6,
  purchaseYield: 5,
  taxRate: 15.4,
};

export default function Home() {
  const [input, setInput] = useState<BondInput>(DEFAULT_INPUT);
  const rows = useMemo(() => generateCashFlow(input), [input]);

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
          <BondInputForm value={input} onChange={setInput} />
          <CashFlowTable rows={rows} />
        </div>
      </main>
    </div>
  );
}
