import { CashFlowRow } from "@/lib/cashFlowSchedule";

interface CashFlowTableProps {
  rows: CashFlowRow[] | null;
  tradeCurrency: string;
  custodyCurrency: string;
  name: string;
}

function formatAmount(n: number, isKrw: boolean): string {
  if (isKrw) {
    return Math.trunc(n).toLocaleString("ko-KR");
  }
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export function CashFlowTable({
  rows,
  tradeCurrency,
  custodyCurrency,
  name,
}: CashFlowTableProps) {
  const data = rows ?? [];
  const isKrw = custodyCurrency === "KRW";
  const hasSpecialTax = data.some((row) => row.specialTax !== null);

  const columns = [
    "이자계산일",
    "원금",
    "이자",
    "과세소득",
    "과세표준",
    "소득세",
    ...(hasSpecialTax ? ["농특세"] : []),
    "세후수령액",
  ];

  const total = data.reduce(
    (acc, row) => ({
      principal: acc.principal + row.principal,
      interest: acc.interest + row.interest,
      taxableIncome: acc.taxableIncome + row.taxableIncome,
      incomeTax: acc.incomeTax + row.incomeTax,
      specialTax: acc.specialTax + (row.specialTax ?? 0),
      netAmount: acc.netAmount + row.netAmount,
    }),
    {
      principal: 0,
      interest: 0,
      taxableIncome: 0,
      incomeTax: 0,
      specialTax: 0,
      netAmount: 0,
    }
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        현금흐름표
      </h2>
      <p className="mb-5 mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {name ? `(${tradeCurrency}) ${name} 시뮬레이션` : " "}
      </p>

      {data.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          채권정보와 신탁계약일, 신탁투자금액, 선취/후취보수율을 모두
          입력하면 현금흐름표가 표시됩니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                {columns.map((col, i) => (
                  <th
                    key={col}
                    className={`whitespace-nowrap py-2 pr-4 font-medium ${
                      i > 0 ? "text-right" : ""
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.date}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {row.date}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {row.principal ? formatAmount(row.principal, isKrw) : ""}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatAmount(row.interest, isKrw)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatAmount(row.taxableIncome, isKrw)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatAmount(row.taxBase, isKrw)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatAmount(row.incomeTax, isKrw)}
                  </td>
                  {hasSpecialTax && (
                    <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {formatAmount(row.specialTax as number, isKrw)}
                    </td>
                  )}
                  <td className="whitespace-nowrap py-2 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                    {formatAmount(row.netAmount, isKrw)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4 font-semibold text-zinc-900 dark:text-zinc-100">
                  합 계
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(total.principal, isKrw)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(total.interest, isKrw)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(total.taxableIncome, isKrw)}
                </td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(total.incomeTax, isKrw)}
                </td>
                {hasSpecialTax && (
                  <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatAmount(total.specialTax, isKrw)}
                  </td>
                )}
                <td className="py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatAmount(total.netAmount, isKrw)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
