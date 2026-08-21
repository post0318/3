"use client";

import { BondInput, CouponFrequency } from "@/types/bond";

interface BondInputFormProps {
  value: BondInput;
  onChange: (value: BondInput) => void;
}

const FREQUENCY_OPTIONS: { label: string; value: CouponFrequency }[] = [
  { label: "3개월", value: 3 },
  { label: "6개월", value: 6 },
  { label: "12개월", value: 12 },
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500";

export function BondInputForm({ value, onChange }: BondInputFormProps) {
  const update = <K extends keyof BondInput>(key: K, val: BondInput[K]) =>
    onChange({ ...value, [key]: val });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="mb-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        채권정보
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="채권명">
          <input
            className={inputClass}
            type="text"
            placeholder="예: KORELE 7.95 04/01/2096"
            value={value.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </Field>

        <Field label="투자원금 (액면금액)">
          <input
            className={inputClass}
            type="number"
            min={0}
            value={value.faceValue}
            onChange={(e) => update("faceValue", Number(e.target.value))}
          />
        </Field>

        <Field label="표면이율 (%)">
          <input
            className={inputClass}
            type="number"
            step="0.0001"
            value={value.couponRate}
            onChange={(e) => update("couponRate", Number(e.target.value))}
          />
        </Field>

        <Field label="매수수익률 (%)">
          <input
            className={inputClass}
            type="number"
            step="0.0001"
            value={value.purchaseYield}
            onChange={(e) => update("purchaseYield", Number(e.target.value))}
          />
        </Field>

        <Field label="발행일">
          <input
            className={inputClass}
            type="date"
            value={value.issueDate}
            onChange={(e) => update("issueDate", e.target.value)}
          />
        </Field>

        <Field label="만기일">
          <input
            className={inputClass}
            type="date"
            value={value.maturityDate}
            onChange={(e) => update("maturityDate", e.target.value)}
          />
        </Field>

        <Field label="이자지급 주기">
          <select
            className={inputClass}
            value={value.couponFrequency}
            onChange={(e) =>
              update(
                "couponFrequency",
                Number(e.target.value) as CouponFrequency
              )
            }
          >
            {FREQUENCY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="소득세율 (%)">
          <input
            className={inputClass}
            type="number"
            step="0.1"
            value={value.taxRate}
            onChange={(e) => update("taxRate", Number(e.target.value))}
          />
        </Field>
      </div>
    </section>
  );
}
