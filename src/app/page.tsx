"use client";

import { useState } from "react";
import { BondLayoutForm } from "@/components/BondLayoutForm";
import { BondLayoutInput } from "@/types/bondLayout";

const DEFAULT_INPUT: BondLayoutInput = {
  calcBasis: "미국 30/360",
  investorType: "개인",
  name: "",
  issueDate: "",
  maturityDate: "",
  couponRate: 0,
  couponFrequency: "6개월",
  creditRating: "",
  tradeCurrency: "USD",
  custodyCurrency: "USD",
  trustContractDate: "",
  purchaseYield: 0,
  frontFeeRate: 0,
  backFeeRate: 0,
};

export default function Home() {
  const [input, setInput] = useState<BondLayoutInput>(DEFAULT_INPUT);

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
        </div>
      </main>
    </div>
  );
}
