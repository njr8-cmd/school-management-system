"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BikramDatePicker } from "@inicrea/bikram-sambat-react";
import "@inicrea/bikram-sambat-react/styles.css";
import { adDateToBSInput, formatBSDate } from "@/lib/nepali-date";

type AcademicYear = { id: string; name: string; isActive: boolean };
type AcademicTerm = { id: string; name: string; order: number };
type FinanceReport = {
  period: string;
  from: string;
  to: string;
  feeIncome: number;
  waivers: number;
  salaryPaid: number;
  otherExpenses: number;
  totalExpenses: number;
  netCashflow: number;
  counts: {
    feePayments: number;
    waivers: number;
    salaryPayments: number;
    unreconciledSalaries: number;
    expenses: number;
  };
  chartData: { label: string; fees: number; waivers: number; salaries: number; expenses: number }[];
  expenseCategories: { category: string; amount: number; count: number }[];
  transactions: {
    id: string;
    date: string;
    type: "fee" | "waiver" | "salary" | "expense";
    description: string;
    amount: number;
  }[];
};

const periods = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
  ["termly", "Termly"],
  ["yearly", "Yearly"],
];
const categoryNames: Record<string, string> = {
  OFFICE_SUPPLIES: "Office supplies",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  INTERNET: "Internet",
  MAINTENANCE: "Maintenance",
  TRANSPORT: "Transport",
  MEDICAL: "Medical",
  SALARY: "Other salary",
  FOOD: "Food",
  RENT: "Rent",
  TAX: "Tax",
  OTHER: "Other",
};

function money(value: number) {
  return `Rs. ${value.toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function FinanceBarChart({
  data,
}: {
  data: FinanceReport["chartData"];
}) {
  const width = 900;
  const height = 340;
  const left = 72;
  const right = 20;
  const top = 24;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(
    1,
    ...data.flatMap((item) => [item.fees, item.waivers, item.salaries, item.expenses]),
  );
  const step = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const chartMax = Math.ceil(maxValue / step) * step || 1;
  const series = [
    { key: "fees", label: "Fees received", color: "#15803d" },
    { key: "waivers", label: "Fee waivers (non-cash)", color: "#7c3aed" },
    { key: "salaries", label: "Salaries paid", color: "#d97706" },
    { key: "expenses", label: "Other expenses", color: "#dc2626" },
  ] as const;
  const slotWidth = data.length ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(20, Math.max(3, (slotWidth * 0.68) / series.length));
  const labelStep = Math.max(1, Math.ceil(data.length / 9));

  if (data.length === 0) {
    return <p className="p-5 text-sm text-gray-500">No data to chart for this period.</p>;
  }

  return (
    <div className="overflow-x-auto px-3 pb-3">
      <svg
        role="img"
        aria-label="Bar chart comparing fees received, fee waivers, salaries paid, and other expenses"
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-w-[680px] w-full"
      >
        <title>Finance totals by {data.length > 1 ? "day or month" : "period"}</title>
        {[0, 1, 2, 3, 4].map((line) => {
          const value = (chartMax * line) / 4;
          const y = top + plotHeight - (plotHeight * line) / 4;
          return (
            <g key={line}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e5e7eb" />
              <text x={left - 9} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="11">
                {value.toLocaleString("en-NP", { maximumFractionDigits: 0 })}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const center = left + slotWidth * (index + 0.5);
          return (
            <g key={`${item.label}-${index}`}>
              {series.map((entry, seriesIndex) => {
                const value = item[entry.key];
                const barHeight = (value / chartMax) * plotHeight;
                const x = center - (series.length * barWidth) / 2 + seriesIndex * barWidth;
                const y = top + plotHeight - barHeight;
                return (
                  <rect
                    key={entry.key}
                    x={x}
                    y={y}
                    width={Math.max(1, barWidth - 2)}
                    height={barHeight}
                    rx="2"
                    fill={entry.color}
                  >
                    <title>{`${item.label}: ${entry.label} ${money(value)}`}</title>
                  </rect>
                );
              })}
              {index % labelStep === 0 && (
                <text
                  x={center}
                  y={top + plotHeight + 20}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize="10"
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 pb-2 text-xs text-gray-600">
        {series.map((item) => (
          <span key={item.key} className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const [period, setPeriod] = useState("monthly");
  const [date, setDate] = useState(() => adDateToBSInput(new Date()));
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [academicYearId, setAcademicYearId] = useState("");
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [termId, setTermId] = useState("");
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadYears() {
      try {
        const response = await fetch("/api/academic-years", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load academic years.");
        const list: AcademicYear[] = Array.isArray(data) ? data : [];
        setYears(list);
        const active = list.find((year) => year.isActive) ?? list[0];
        if (active) setAcademicYearId(active.id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Failed to load academic years.");
      }
    }
    void loadYears();
  }, []);

  useEffect(() => {
    if (!academicYearId || (period !== "termly" && period !== "yearly")) return;
    let active = true;
    async function loadTerms() {
      try {
        const response = await fetch(
          `/api/academic-terms?academicYearId=${encodeURIComponent(academicYearId)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load terms.");
        if (!active) return;
        const list: AcademicTerm[] = Array.isArray(data) ? data : [];
        setTerms(list);
        setTermId((current) =>
          list.some((term) => term.id === current) ? current : list[0]?.id ?? "",
        );
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Failed to load terms.");
      }
    }
    void loadTerms();
    return () => { active = false; };
  }, [academicYearId, period]);

  useEffect(() => {
    if ((period === "yearly" || period === "termly") && !academicYearId) return;
    if (period === "termly" && (!termId || !terms.some((term) => term.id === termId))) return;
    let active = true;
    async function loadReport() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ period });
        if (period === "daily" || period === "weekly" || period === "monthly") {
          params.set("date", date);
        } else {
          params.set("academicYearId", academicYearId);
          if (period === "termly") params.set("termId", termId);
        }
        const response = await fetch(`/api/finance-overview?${params}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load finance overview.");
        if (active) setReport(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Failed to load finance overview.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReport();
    return () => { active = false; };
  }, [period, date, academicYearId, termId, terms]);

  const selectedTermName = useMemo(
    () => terms.find((term) => term.id === termId)?.name,
    [terms, termId],
  );

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">School Finance Overview</h1>
          <p className="mt-1 text-sm text-gray-600">
            Fees actually received, salary payments, and recorded school expenses in one place.
          </p>
        </div>
        <Link
          href="/dashboard/finance/bulk-adjustments"
          className="inline-flex items-center rounded-lg border border-[#d9c4b5] bg-white px-4 py-2.5 text-sm font-semibold text-[#702d27] transition hover:bg-[#f7eee5]"
        >
          Bulk discounts &amp; charges
        </Link>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Reporting period
            <select value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
              {periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {["daily", "weekly", "monthly"].includes(period) ? (
            <label className="text-sm font-medium text-gray-700">
              Date (BS)
              <BikramDatePicker value={date} onChange={setDate} valueFormat="BS" className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
            </label>
          ) : (
            <label className="text-sm font-medium text-gray-700">
              Academic year
              <select value={academicYearId} onChange={(event) => setAcademicYearId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <option value="">Select academic year</option>
                {years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isActive ? " (Active)" : ""}</option>)}
              </select>
            </label>
          )}
          {period === "termly" ? (
            <label className="text-sm font-medium text-gray-700">
              Academic term
              <select value={termId} onChange={(event) => setTermId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
                <option value="">Select term</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
              </select>
            </label>
          ) : (
            <div className="flex items-end text-xs leading-5 text-gray-500">
              {period === "termly"
                ? "Term periods are divided evenly across the academic year's BS months."
                : period === "yearly"
                  ? "Yearly totals use the academic year's configured dates."
                  : period === "weekly"
                    ? "Weekly totals run Sunday through Saturday."
                    : "Daily totals use the selected Bikram Sambat date."}
            </div>
          )}
        </div>
        {period === "termly" && (
          <p className="mt-3 text-xs text-gray-500">
            {selectedTermName ? `${selectedTermName}: ` : ""}
            Termly totals split the academic year’s BS calendar months evenly according to term order.
          </p>
        )}
      </section>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading && <p className="text-sm text-gray-500">Loading finance totals...</p>}
      {report && (
        <>
          <p className="text-sm font-medium text-gray-600">
            Report range: {formatBSDate(report.from)} – {formatBSDate(report.to)}
          </p>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: "Fees Received", value: report.feeIncome, detail: `${report.counts.feePayments} payments`, color: "text-green-700" },
              { label: "Fee Waivers", value: report.waivers, detail: `${report.counts.waivers} non-cash adjustments`, color: "text-violet-700" },
              { label: "Teacher Salaries Paid", value: report.salaryPaid, detail: `${report.counts.salaryPayments} recorded payments · ${report.counts.unreconciledSalaries} legacy records excluded pending reconciliation`, color: "text-orange-700" },
              { label: "Other School Expenses", value: report.otherExpenses, detail: `${report.counts.expenses} records`, color: "text-red-700" },
              { label: "Net Cashflow", value: report.netCashflow, detail: "Fees received minus all expenses", color: report.netCashflow >= 0 ? "text-blue-700" : "text-red-700" },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                <p className={`mt-2 text-xl font-bold ${card.color}`}>{money(card.value)}</p>
                <p className="mt-1 text-xs text-gray-500">{card.detail}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="font-semibold text-gray-900">Finance by {period === "yearly" || period === "termly" ? "Month" : "Day"}</h2>
              <p className="mt-1 text-sm text-gray-500">Waivers are shown separately and are not cash income or expenses.</p>
            </div>
            <FinanceBarChart data={report.chartData} />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="font-semibold text-gray-900">Expenses by Category</h2>
                <p className="mt-1 text-sm text-gray-500">Teacher salaries are shown separately above.</p>
              </div>
              {report.expenseCategories.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">No other expenses for this period.</p>
              ) : (
                <div className="space-y-4 p-5">
                  {report.expenseCategories.map((item) => {
                    const maximum = Math.max(...report.expenseCategories.map((category) => category.amount), 1);
                    return (
                      <div key={item.category}>
                        <div className="mb-1.5 flex justify-between gap-3 text-sm">
                          <span className="text-gray-700">{categoryNames[item.category] ?? item.category} <span className="text-gray-400">({item.count})</span></span>
                          <span className="font-semibold text-gray-900">{money(item.amount)}</span>
                        </div>
                        <div
                          role="img"
                          aria-label={`${categoryNames[item.category] ?? item.category}: ${money(item.amount)}`}
                          className="h-2.5 overflow-hidden rounded-full bg-gray-100"
                        >
                          <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(2, (item.amount / maximum) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                <div>
                  <h2 className="font-semibold text-gray-900">Recent Finance Activity</h2>
                  <p className="mt-1 text-sm text-gray-500">Latest income and payments in this period.</p>
                </div>
                <Link href="/dashboard/finance/expenses" className="text-sm font-medium text-blue-700 hover:underline">Manage expenses</Link>
              </div>
              {report.transactions.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">No transactions recorded for this period.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {report.transactions.map((transaction) => (
                    <li key={`${transaction.type}-${transaction.id}`} className="flex items-start justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">{transaction.description}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatBSDate(transaction.date)} · {transaction.type === "fee" ? "Fee income" : transaction.type === "waiver" ? "Non-cash waiver" : transaction.type === "salary" ? "Salary" : "Expense"}</p>
                      </div>
                      <span className={`whitespace-nowrap text-sm font-semibold ${transaction.type === "fee" ? "text-green-700" : transaction.type === "waiver" ? "text-violet-700" : "text-red-700"}`}>{transaction.type === "fee" ? "+" : transaction.type === "waiver" ? "Waived " : "−"}{money(Math.abs(transaction.amount))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
