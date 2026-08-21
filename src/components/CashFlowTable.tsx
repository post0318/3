import { CashFlowRow } from "@/types/bond";

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function CashFlowTable({ rows }: { rows: CashFlowRow[] }) {
  const total = rows.reduce(
    (acc, row) => ({
      taxableIncome: acc.taxableIncome + row.taxableIncome,
      incomeTax: acc.incomeTax + row.incomeTax,
      cashFlow: acc.cashFlow + row.cashFlow,
    }),
    { taxableIncome: 0, incomeTax: 0, cashFlow: 0 }
  );

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="mb-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        현금흐름표
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          채권정보를 입력하면 현금흐름표가 표시됩니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="whitespace-nowrap py-2 pr-4 font-medium">
                  이표일자
                </th>
                <th className="whitespace-nowrap py-2 pr-4 text-right font-medium">
                  과세소득
                </th>
                <th className="whitespace-nowrap py-2 pr-4 text-right font-medium">
                  소득세
                </th>
                <th className="whitespace-nowrap py-2 text-right font-medium">
                  현금흐름
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.date}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {row.date}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatNumber(row.taxableIncome)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatNumber(row.incomeTax)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                    {formatNumber(row.cashFlow)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4 font-semibold text-zinc-900 dark:text-zinc-100">
                  합계
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(total.taxableIncome)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(total.incomeTax)}
                </td>
                <td className="py-2 text-right tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatNumber(total.cashFlow)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
