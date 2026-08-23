const COLUMNS = [
  "이자계산일",
  "원금",
  "이자",
  "과세소득",
  "과세표준",
  "소득세",
  "농특세",
  "세후수령액",
] as const;

function ComputedCell() {
  return (
    <span className="italic text-zinc-400 dark:text-zinc-600">자동계산</span>
  );
}

export function CashFlowTable({ dates }: { dates: string[] }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 sm:p-6">
      <h2 className="mb-5 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        현금흐름표
      </h2>

      {dates.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          발행일, 만기일, 이자지급 주기를 입력하면 현금흐름표가 표시됩니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                {COLUMNS.map((col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap py-2 pr-4 font-medium"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr
                  key={date}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700 dark:text-zinc-300">
                    {date}
                  </td>
                  {COLUMNS.slice(1).map((col) => (
                    <td key={col} className="whitespace-nowrap py-2 pr-4">
                      <ComputedCell />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4 font-semibold text-zinc-900 dark:text-zinc-100">
                  합 계
                </td>
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
                <td className="py-2 pr-4">
                  <ComputedCell />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
