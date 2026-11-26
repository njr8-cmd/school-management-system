"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BikramDatePicker } from "@inicrea/bikram-sambat-react";
import "@inicrea/bikram-sambat-react/styles.css";
import { adDateToBSInput, formatBSDate } from "@/lib/nepali-date";

type AcademicYear = { id: string; name: string; isActive: boolean };
type Expense = {
  id: string;
  academicYearId: string;
  category: string;
  description: string;
  amount: string | number;
  expenseDate: string;
  paidTo?: string | null;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  academicYear?: { name: string };
  voidedAt?: string | null;
  voidReason?: string | null;
  voidedBy?: { id: string; name: string } | null;
};

const categories = [
  ["OFFICE_SUPPLIES", "Office supplies"],
  ["ELECTRICITY", "Electricity"],
  ["WATER", "Water"],
  ["INTERNET", "Internet"],
  ["MAINTENANCE", "Maintenance"],
  ["TRANSPORT", "Transport"],
  ["MEDICAL", "Medical"],
  ["SALARY", "Other salary"],
  ["FOOD", "Food"],
  ["RENT", "Rent"],
  ["TAX", "Tax"],
  ["OTHER", "Other"],
];
const methods = [
  ["CASH", "Cash"],
  ["BANK", "Bank transfer"],
  ["ONLINE", "Online"],
  ["OTHER", "Other"],
];

const emptyForm = () => ({
  academicYearId: "",
  category: "OFFICE_SUPPLIES",
  description: "",
  amount: "",
  expenseDate: adDateToBSInput(new Date()),
  paidTo: "",
  paymentMethod: "CASH",
  reference: "",
  notes: "",
});

function money(value: number | string) {
  return `Rs. ${Number(value).toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ExpensesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filterYear, setFilterYear] = useState("ALL");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voidingId, setVoidingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [yearResponse, expenseResponse] = await Promise.all([
        fetch("/api/academic-years", { cache: "no-store" }),
        fetch("/api/expenses", { cache: "no-store" }),
      ]);
      const [yearData, expenseData] = await Promise.all([
        yearResponse.json(),
        expenseResponse.json(),
      ]);
      if (!yearResponse.ok) throw new Error(yearData.error ?? "Could not load academic years.");
      if (!expenseResponse.ok) throw new Error(expenseData.error ?? "Could not load expenses.");
      const availableYears: AcademicYear[] = Array.isArray(yearData) ? yearData : [];
      setYears(availableYears);
      setExpenses(Array.isArray(expenseData) ? expenseData : []);
      setForm((current) => ({
        ...current,
        academicYearId:
          current.academicYearId ||
          availableYears.find((year) => year.isActive)?.id ||
          availableYears[0]?.id ||
          "",
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load expenses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function initialize() {
      await loadData();
    }
    void initialize();
  }, []);

  const visibleExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          filterYear === "ALL" || expense.academicYearId === filterYear,
      ),
    [expenses, filterYear],
  );
  const activeExpenseCount = visibleExpenses.filter(
    (expense) => !expense.voidedAt,
  ).length;
  const total = visibleExpenses.reduce(
    (sum, expense) =>
      expense.voidedAt ? sum : sum + Number(expense.amount),
    0,
  );

  function editExpense(expense: Expense) {
    setEditingId(expense.id);
    setForm({
      academicYearId: expense.academicYearId,
      category: expense.category,
      description: expense.description,
      amount: String(expense.amount),
      expenseDate: adDateToBSInput(expense.expenseDate),
      paidTo: expense.paidTo ?? "",
      paymentMethod: expense.paymentMethod,
      reference: expense.reference ?? "",
      notes: expense.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/expenses?id=${encodeURIComponent(editingId)}` : "/api/expenses",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save expense.");
      setNotice(editingId ? "Expense updated." : "Expense recorded.");
      setEditingId("");
      setForm({ ...emptyForm(), academicYearId: form.academicYearId });
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense(expense: Expense) {
    const reason = window.prompt(
      "Enter the reason for voiding this expense. The record will be retained for audit.",
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("A reason is required to void an expense.");
      return;
    }
    if (!window.confirm("Void this expense and exclude it from active totals?")) return;

    setError("");
    setNotice("");
    setVoidingId(expense.id);
    try {
      const response = await fetch(
        `/api/expenses?id=${encodeURIComponent(expense.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not void expense.");
      setNotice("Expense voided and retained for audit.");
      if (editingId === expense.id) {
        setEditingId("");
        setForm(emptyForm());
      }
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not void expense.");
    } finally {
      setVoidingId("");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">School Expenses</h1>
        <p className="mt-1 text-sm text-gray-600">
          Record daily school spending. These expenses are included in the finance overview.
        </p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editingId ? "Edit Expense" : "Record an Expense"}</h2>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(""); setForm(emptyForm()); }} className="text-sm text-gray-600 hover:text-gray-900">
              Cancel editing
            </button>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Academic year *
            <select required value={form.academicYearId} onChange={(event) => setForm({ ...form, academicYearId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
              <option value="">Select academic year</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}{year.isActive ? " (Active)" : ""}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Expense date (BS) *
            <BikramDatePicker value={form.expenseDate} onChange={(value) => setForm({ ...form, expenseDate: value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" valueFormat="BS" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Category *
            <select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Description *
            <input required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={200} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" placeholder="What was the expense for?" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Amount (Rs.) *
            <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Payment method *
            <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5">
              {methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            Paid to
            <input value={form.paidTo} onChange={(event) => setForm({ ...form, paidTo: event.target.value })} maxLength={120} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Reference
            <input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} maxLength={120} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-gray-700 md:col-span-2 xl:col-span-1">
            Notes
            <input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5" />
          </label>
        </div>
        <button disabled={saving || years.length === 0} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
          {saving ? "Saving..." : editingId ? "Save Changes" : "Record Expense"}
        </button>
      </form>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">Expense Records</h2>
            <p className="mt-1 text-sm text-gray-500">
              {activeExpenseCount} active · {visibleExpenses.length} total · {money(total)} active outflow
            </p>
          </div>
          <label className="text-sm font-medium text-gray-700">
            Filter by academic year
            <select value={filterYear} onChange={(event) => setFilterYear(event.target.value)} className="ml-2 rounded-lg border border-gray-300 bg-white px-3 py-2">
              <option value="ALL">All years</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </label>
        </div>
        {loading ? <p className="p-6 text-sm text-gray-500">Loading expenses...</p> : visibleExpenses.length === 0 ? <p className="p-6 text-sm text-gray-500">No expense records yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr><th className="px-5 py-3">Date (BS)</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Paid to</th><th className="px-5 py-3">Method</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleExpenses.map((expense) => (
                  <tr key={expense.id} className={expense.voidedAt ? "bg-gray-50 text-gray-500" : undefined}>
                    <td className="whitespace-nowrap px-5 py-3">{formatBSDate(expense.expenseDate)}</td>
                    <td className="px-5 py-3">
                      <div className={`font-medium ${expense.voidedAt ? "text-gray-500 line-through" : "text-gray-900"}`}>{expense.description}</div>
                      <div className="text-xs text-gray-500">{expense.academicYear?.name}</div>
                      {expense.voidedAt && (
                        <div className="mt-1 text-xs text-orange-800">
                          Voided {new Date(expense.voidedAt).toLocaleString()} by {expense.voidedBy?.name ?? "unknown user"}: {expense.voidReason}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">{categories.find(([value]) => value === expense.category)?.[1] ?? expense.category}</td>
                    <td className="px-5 py-3">{expense.paidTo || "—"}</td>
                    <td className="px-5 py-3">{methods.find(([value]) => value === expense.paymentMethod)?.[1] ?? expense.paymentMethod}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold">{money(expense.amount)}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {expense.voidedAt ? (
                        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800">Voided</span>
                      ) : (
                        <>
                          <button type="button" onClick={() => editExpense(expense)} className="mr-3 font-medium text-blue-700 hover:underline">Edit</button>
                          <button type="button" disabled={voidingId === expense.id} onClick={() => void voidExpense(expense)} className="font-medium text-red-700 hover:underline disabled:opacity-50">
                            {voidingId === expense.id ? "Voiding..." : "Void"}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
