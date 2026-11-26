
"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import NepaliDate from "nepali-date-converter";
import { BikramDatePicker } from "@inicrea/bikram-sambat-react";
import "@inicrea/bikram-sambat-react/styles.css";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Plus,
  
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";

import {
  BS_MONTHS,
  adDateToBSInput,
  bsInputToADDate,
  formatBSDate,
} from "@/lib/nepali-date";
import {
  getSalaryPaymentSummary,
  type SalaryPaymentSummary,
} from "@/lib/finance/salary-payment-summary";

type AcademicYear = {
  id: string;
  name: string;
  isActive?: boolean;
};

type Teacher = {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  basicSalary?: string | number | null;
  position?: string | null;
  phone?: string | null;
};

type SalaryPayment = {
  id: string;
  amount: string | number;
  paymentDate: string;
  createdAt: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  recordedBy?: { id: string; name: string } | null;
};

type Salary = {
  id: string;
  teacherId: string;
  academicYearId: string;
  month: number;
  year: number;
  salaryAmount: string | number;
  deduction: string | number;
  netAmount: string | number;
  status: "PENDING" | "PARTIAL" | "PAID";
  paymentDate?: string | null;
  notes?: string | null;
  teacher: Teacher;
  academicYear: AcademicYear;
  payments: SalaryPayment[];
};

const statusOptions = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "PARTIAL", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "UNRECONCILED", label: "Needs reconciliation" },
];

const paymentMethods = [
  { value: "CASH", label: "Cash" },
  { value: "BANK", label: "Bank transfer" },
  { value: "ONLINE", label: "Online" },
  { value: "OTHER", label: "Other" },
];

const paymentMethodLabels: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank transfer",
  ONLINE: "Online",
  OTHER: "Other",
};

function numberValue(
  value: string | number | null | undefined,
): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value: number | string): string {
  return `Rs. ${numberValue(value).toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function teacherName(teacher?: Teacher | null): string {
  if (!teacher) return "Unknown teacher";

  return [
    teacher.firstName,
    teacher.middleName,
    teacher.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function getCurrentBS() {
  try {
    const date = new NepaliDate();

    return {
      year: date.getYear(),
      month: date.getMonth() + 1,
    };
  } catch {
    const today = new Date();

    return {
      year:
        today.getFullYear() +
        (today.getMonth() >= 3 ? 57 : 56),
      month: 1,
    };
  }
}

function todayAD(): string {
  const today = new Date();

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDate(value?: string | null): string {
  return formatBSDate(value);
}

function statusStyle(status: SalaryPaymentSummary["status"]): string {
  switch (status) {
    case "PAID":
      return "border-green-200 bg-green-50 text-green-700";
    case "PARTIAL":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "UNRECONCILED":
      return "border-orange-200 bg-orange-50 text-orange-800";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function statusLabel(status: SalaryPaymentSummary["status"]): string {
  switch (status) {
    case "PAID":
      return "Paid";
    case "PARTIAL":
      return "Partially paid";
    case "UNRECONCILED":
      return "Needs reconciliation";
    default:
      return "Pending";
  }
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export default function TeacherSalariesPage() {
  const currentBS = useMemo(() => getCurrentBS(), []);

  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [academicYears, setAcademicYears] =
    useState<AcademicYear[]>([]);
  const [salaries, setSalaries] = useState<Salary[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] =
    useState(String(currentBS.year));
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [filterAcademicYear, setFilterAcademicYear] =
    useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [showCreateForm, setShowCreateForm] =
    useState(false);

  const [teacherId, setTeacherId] = useState("");
  const [academicYearId, setAcademicYearId] =
    useState("");
  const [salaryMonth, setSalaryMonth] =
    useState(String(currentBS.month));
  const [salaryYear, setSalaryYear] =
    useState(String(currentBS.year));
  const [salaryAmount, setSalaryAmount] = useState("");
  const [deduction, setDeduction] = useState("0");
  const [salaryNotes, setSalaryNotes] = useState("");

  const [expandedSalaryId, setExpandedSalaryId] =
    useState<string | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] =
    useState(adDateToBSInput(todayAD()));
  const [paymentMethod, setPaymentMethod] =
    useState("CASH");
  const [paymentReference, setPaymentReference] =
    useState("");
  const [paymentNotes, setPaymentNotes] =
    useState("");
  const paymentIdempotencyKeys = useRef(new Map<string, string>());

  async function loadData(showRefresh = false) {
    try {
      if (showRefresh) {
        setRefreshing(true);
      }

      const [teacherResponse, yearResponse, salaryResponse] =
        await Promise.all([
          fetch("/api/teachers", { cache: "no-store" }),
          fetch("/api/academic-years", { cache: "no-store" }),
          fetch("/api/teacher-salaries", { cache: "no-store" }),
        ]);

      const [teacherData, yearData, salaryData] =
        await Promise.all([
          readJson(teacherResponse),
          readJson(yearResponse),
          readJson(salaryResponse),
        ]);

      if (!teacherResponse.ok) {
        throw new Error(
          teacherData?.error || "Failed to load teachers.",
        );
      }

      if (!yearResponse.ok) {
        throw new Error(
          yearData?.error || "Failed to load academic years.",
        );
      }

      if (!salaryResponse.ok) {
        throw new Error(
          salaryData?.error ||
            "Failed to load salary records.",
        );
      }

      const teacherList = Array.isArray(teacherData)
        ? teacherData
        : teacherData?.teachers ?? [];

      const yearList = Array.isArray(yearData)
        ? yearData
        : yearData?.academicYears ?? [];

      const salaryList = Array.isArray(salaryData)
        ? salaryData
        : salaryData?.salaries ?? [];

      setError("");
      setTeachers(teacherList);
      setAcademicYears(yearList);
      setSalaries(salaryList);

      setAcademicYearId((current) => {
        if (current && yearList.some(
          (year: AcademicYear) => year.id === current,
        )) {
          return current;
        }

        return (
          yearList.find(
            (year: AcademicYear) => year.isActive,
          )?.id ??
          yearList[0]?.id ??
          ""
        );
      });
    } catch (err) {
      console.error("Failed to load salary data:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load salary data.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // The loader applies state only after its requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  function selectTeacher(id: string) {
    setTeacherId(id);

    const teacher = teachers.find(
      (item) => item.id === id,
    );

    setSalaryAmount(
      teacher?.basicSalary == null
        ? ""
        : String(teacher.basicSalary),
    );
  }

  const filteredSalaries = useMemo(() => {
    const term = search.trim().toLowerCase();

    return salaries.filter((salary) => {
      if (
        filterYear !== "ALL" &&
        String(salary.year) !== filterYear
      ) {
        return false;
      }

      if (
        filterMonth !== "ALL" &&
        salary.month !== Number(filterMonth)
      ) {
        return false;
      }

      if (
        filterAcademicYear !== "ALL" &&
        salary.academicYearId !== filterAcademicYear
      ) {
        return false;
      }

      if (
        filterStatus !== "ALL" &&
        getSalaryPaymentSummary(salary).status !== filterStatus
      ) {
        return false;
      }

      if (term) {
        const name = teacherName(salary.teacher).toLowerCase();

        if (
          !name.includes(term) &&
          !(salary.teacher?.phone ?? "").includes(term)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    salaries,
    search,
    filterYear,
    filterMonth,
    filterAcademicYear,
    filterStatus,
  ]);

  const summary = useMemo(() => {
    return filteredSalaries.reduce(
      (total, salary) => {
        const paymentSummary = getSalaryPaymentSummary(salary);
        total.gross += numberValue(salary.salaryAmount);
        total.deductions += numberValue(salary.deduction);
        total.net += numberValue(salary.netAmount);
        total.paid += paymentSummary.paidAmount;
        total.remaining += paymentSummary.remainingAmount;

        return total;
      },
      {
        count: filteredSalaries.length,
        gross: 0,
        deductions: 0,
        net: 0,
        paid: 0,
        remaining: 0,
      },
    );
  }, [filteredSalaries]);

  async function handleCreateSalary(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setNotice("");

    if (!teacherId || !academicYearId) {
      setError("Select a teacher and academic year.");
      return;
    }

    const numericSalary = Number(salaryAmount);
    const numericDeduction = Number(deduction);

    if (
      !Number.isFinite(numericSalary) ||
      numericSalary <= 0
    ) {
      setError("Enter a valid gross salary.");
      return;
    }

    if (
      !Number.isFinite(numericDeduction) ||
      numericDeduction < 0 ||
      numericDeduction > numericSalary
    ) {
      setError(
        "Deduction must be between zero and the gross salary.",
      );
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/teacher-salaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          teacherId,
          academicYearId,
          month: Number(salaryMonth),
          year: Number(salaryYear),
          salaryAmount: numericSalary,
          deduction: numericDeduction,
          notes: salaryNotes.trim(),
        }),
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to create salary record.",
        );
      }

      setNotice(
        data?.message ?? "Salary record created successfully.",
      );

      setShowCreateForm(false);
      setTeacherId("");
      setSalaryAmount("");
      setDeduction("0");
      setSalaryNotes("");

      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create salary record.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(
    event: FormEvent<HTMLFormElement>,
    salary: Salary,
  ) {
    event.preventDefault();

    setError("");
    setNotice("");

    const amount = Number(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }

    if (!paymentDate) {
      setError("Select the payment date.");
      return;
    }

    try {
      setSaving(true);
      let idempotencyKey = paymentIdempotencyKeys.current.get(salary.id);
      if (!idempotencyKey) {
        idempotencyKey = crypto.randomUUID();
        paymentIdempotencyKeys.current.set(salary.id, idempotencyKey);
      }

      const response = await fetch(
        "/api/teacher-salary-payments",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({
            teacherSalaryId: salary.id,
            amount,
            paymentDate: bsInputToADDate(paymentDate),
            method: paymentMethod,
            reference: paymentReference.trim(),
            notes: paymentNotes.trim(),
          }),
        },
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          data?.error || "Failed to record payment.",
        );
      }

      setNotice(
        data?.message ?? "Payment recorded successfully.",
      );

      paymentIdempotencyKeys.current.delete(salary.id);
      setPaymentAmount("");
      setPaymentDate(adDateToBSInput(todayAD()));
      setPaymentMethod("CASH");
      setPaymentReference("");
      setPaymentNotes("");

      await loadData(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to record payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openNewSalaryForm() {
    setError("");
    setNotice("");
    setShowCreateForm(true);
  }

  function openSalaryPayments(salary: Salary) {
    setError("");
    setNotice("");

    if (expandedSalaryId === salary.id) {
      setExpandedSalaryId(null);
      return;
    }

    setExpandedSalaryId(salary.id);
    setPaymentAmount("");
    setPaymentDate(adDateToBSInput(todayAD()));
    setPaymentMethod("CASH");
    setPaymentReference("");
    setPaymentNotes("");
  }

  return (
    <div className="space-y-6">
      {/* Heading */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-red-100 p-3 text-red-700">
            <Wallet className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Teacher Salaries
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage monthly salaries, instalments, and outstanding balances.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                refreshing ? "animate-spin" : ""
              }`}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={openNewSalaryForm}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800"
          >
            <Plus className="h-4 w-4" />
            New Salary Record
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Create salary form */}

      {showCreateForm && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <h2 className="font-semibold text-gray-900">
                Create Monthly Salary
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Salary month and year use the Bikram Sambat calendar.
              </p>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => setShowCreateForm(false)}
              aria-label="Close form"
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleCreateSalary}
            className="space-y-5 p-5"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor="salary-teacher"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Teacher *
                </label>
                <select
                  id="salary-teacher"
                  required
                  value={teacherId}
                  onChange={(event) =>
                    selectTeacher(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="">Select teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacherName(teacher)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="salary-academic-year"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Academic Year *
                </label>
                <select
                  id="salary-academic-year"
                  required
                  value={academicYearId}
                  onChange={(event) =>
                    setAcademicYearId(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="">Select academic year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                      {year.isActive ? " (Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="salary-month"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  BS Month *
                </label>
                <select
                  id="salary-month"
                  required
                  value={salaryMonth}
                  onChange={(event) =>
                    setSalaryMonth(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  {BS_MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="salary-year"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  BS Year *
                </label>
                <input
                  id="salary-year"
                  required
                  type="number"
                  min={2000}
                  max={2200}
                  value={salaryYear}
                  onChange={(event) =>
                    setSalaryYear(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <label
                  htmlFor="salary-gross"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Monthly Salary (Rs.) *
                </label>
                <input
                  id="salary-gross"
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={salaryAmount}
                  onChange={(event) =>
                    setSalaryAmount(event.target.value)
                  }
                  disabled={saving}
                  placeholder="Monthly salary"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Prefilled from the teacher profile; editable if needed.
                </p>
              </div>

              <div>
                <label
                  htmlFor="salary-deduction"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  Approved Deductions (Rs.)
                </label>
                <input
                  id="salary-deduction"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deduction}
                  onChange={(event) =>
                    setDeduction(event.target.value)
                  }
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-gray-500">
                    Net salary payable
                  </p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {money(
                      Math.max(
                        0,
                        numberValue(salaryAmount) -
                          numberValue(deduction),
                      ),
                    )}
                  </p>
                </div>
                <BadgeCheck className="h-8 w-8 text-red-700" />
              </div>
            </div>

            <div>
              <label
                htmlFor="salary-notes"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Notes (optional)
              </label>
              <textarea
                id="salary-notes"
                rows={2}
                value={salaryNotes}
                onChange={(event) =>
                  setSalaryNotes(event.target.value)
                }
                disabled={saving}
                placeholder="Salary adjustment or other details..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  saving ||
                  teachers.length === 0 ||
                  academicYears.length === 0
                }
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Create Salary Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Gross Salary"
          value={summary.gross}
          icon={Banknote}
        />
        <SummaryCard
          label="Total Deductions"
          value={summary.deductions}
          icon={FileText}
        />
        <SummaryCard
          label="Salary Paid"
          value={summary.paid}
          icon={CheckCircle2}
          valueClass="text-green-700"
        />
        <SummaryCard
          label="Outstanding Salary"
          value={summary.remaining}
          icon={Clock3}
          valueClass="text-red-700"
        />
      </div>

      {/* Filters */}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <label
              htmlFor="salary-search"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Search teacher
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                id="salary-search"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Teacher name or phone"
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="filter-salary-year"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              BS Year
            </label>
            <select
              id="filter-salary-year"
              value={filterYear}
              onChange={(event) =>
                setFilterYear(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ALL">All years</option>
              {Array.from(
                new Set([
                  currentBS.year,
                  ...salaries.map((salary) => salary.year),
                ]),
              )
                .sort((a, b) => b - a)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-salary-month"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              BS Month
            </label>
            <select
              id="filter-salary-month"
              value={filterMonth}
              onChange={(event) =>
                setFilterMonth(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ALL">All months</option>
              {BS_MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-salary-academic-year"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Academic Year
            </label>
            <select
              id="filter-salary-academic-year"
              value={filterAcademicYear}
              onChange={(event) =>
                setFilterAcademicYear(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ALL">All academic years</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="filter-salary-status"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Payment Status
            </label>
            <select
              id="filter-salary-status"
              value={filterStatus}
              onChange={(event) =>
                setFilterStatus(event.target.value)
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Salary table */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Salary Records
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading salary records..."
                : `${filteredSalaries.length} record${
                    filteredSalaries.length === 1 ? "" : "s"
                  }`}
            </p>
          </div>
          <p className="text-sm font-medium text-gray-600">
            Net payable: {money(summary.net)}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading salary records...
          </div>
        ) : filteredSalaries.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">
              No salary records found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Try different filters or create a salary record for a teacher.
            </p>
            <button
              type="button"
              onClick={openNewSalaryForm}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800"
            >
              <Plus className="h-4 w-4" />
              Create Salary Record
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Teacher",
                    "Salary Period",
                    "Gross",
                    "Deduction",
                    "Net Payable",
                    "Paid",
                    "Remaining",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {filteredSalaries.map((salary) => {
                  const paymentSummary = getSalaryPaymentSummary(salary);
                  const remaining = paymentSummary.remainingAmount;
                  const paid = paymentSummary.paidAmount;
                  const expanded =
                    expandedSalaryId === salary.id;

                  return (
                    <Fragment key={salary.id}>
                      <tr
                        key={salary.id}
                        className="transition hover:bg-gray-50"
                      >
                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="font-medium text-gray-900">
                            {teacherName(salary.teacher)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {salary.teacher?.position || "Teacher"}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          <p className="text-sm font-medium text-gray-800">
                            {BS_MONTHS[salary.month - 1] ??
                              salary.month}{" "}
                            {salary.year}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {salary.academicYear?.name ?? "-"}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-700">
                          {money(salary.salaryAmount)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm text-red-600">
                          {money(salary.deduction)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-gray-900">
                          {money(salary.netAmount)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-green-700">
                          {money(paid)}
                        </td>

                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold">
                          <span
                            className={
                              remaining > 0
                                ? "text-red-700"
                                : "text-green-700"
                            }
                          >
                            {money(remaining)}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle(
                              paymentSummary.status,
                            )}`}
                          >
                            {statusLabel(paymentSummary.status)}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-4 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              openSalaryPayments(salary)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Banknote className="h-4 w-4" />
                            {expanded ? "Close" : "Payments"}
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${salary.id}-details`}>
                          <td colSpan={9} className="bg-gray-50 p-4 sm:p-6">
                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                              {/* Record payment */}

                              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                                <h3 className="font-semibold text-gray-900">
                                  Record Salary Payment
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                  Balance remaining:{" "}
                                  <span className="font-semibold text-red-700">
                                    {money(remaining)}
                                  </span>
                                </p>
                                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                  Early or partial payments only reduce the outstanding balance.
                                  They do not change the monthly salary or approved deductions.
                                </p>

                                {paymentSummary.status === "UNRECONCILED" ? (
                                  <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                                    This salary is marked {salary.status.toLowerCase()} but has no recorded payment transactions. It is excluded from verified salary cash outflow. Reconcile the historical payment evidence before recording another payment.
                                  </div>
                                ) : remaining > 0 ? (
                                  <form
                                    onSubmit={(event) =>
                                      void handleRecordPayment(
                                        event,
                                        salary,
                                      )
                                    }
                                    className="mt-4 space-y-4"
                                  >
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                      <div>
                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                          <label
                                            htmlFor={`payment-amount-${salary.id}`}
                                            className="block text-sm font-medium text-gray-700"
                                          >
                                            Payment Amount (Rs.) *
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPaymentAmount(
                                                remaining.toFixed(2),
                                              )
                                            }
                                            disabled={saving}
                                            className="text-xs font-semibold text-red-700 hover:text-red-900"
                                          >
                                            Use full balance
                                          </button>
                                        </div>
                                        <input
                                          id={`payment-amount-${salary.id}`}
                                          type="number"
                                          required
                                          min="0.01"
                                          max={remaining}
                                          step="0.01"
                                          value={paymentAmount}
                                          onChange={(event) =>
                                            setPaymentAmount(
                                              event.target.value,
                                            )
                                          }
                                          disabled={saving}
                                          placeholder={`Up to ${remaining.toFixed(2)}`}
                                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                        />
                                      </div>

                                      <div>
                                        <label
                                          htmlFor={`payment-date-${salary.id}`}
                                          className="mb-1.5 block text-sm font-medium text-gray-700"
                                        >
                                          Payment Date *
                                        </label>
                                        <BikramDatePicker
                                          value={paymentDate}
                                          onChange={(value) =>
                                            setPaymentDate(value)
                                          }
                                          valueFormat="BS"
                                        />
                                      </div>

                                      <div>
                                        <label
                                          htmlFor={`payment-method-${salary.id}`}
                                          className="mb-1.5 block text-sm font-medium text-gray-700"
                                        >
                                          Payment Method
                                        </label>
                                        <select
                                          id={`payment-method-${salary.id}`}
                                          value={paymentMethod}
                                          onChange={(event) =>
                                            setPaymentMethod(
                                              event.target.value,
                                            )
                                          }
                                          disabled={saving}
                                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                        >
                                          {paymentMethods.map(
                                            (method) => (
                                              <option
                                                key={method.value}
                                                value={method.value}
                                              >
                                                {method.label}
                                              </option>
                                            ),
                                          )}
                                        </select>
                                      </div>

                                      <div>
                                        <label
                                          htmlFor={`payment-reference-${salary.id}`}
                                          className="mb-1.5 block text-sm font-medium text-gray-700"
                                        >
                                          Reference (optional)
                                        </label>
                                        <input
                                          id={`payment-reference-${salary.id}`}
                                          value={paymentReference}
                                          onChange={(event) =>
                                            setPaymentReference(
                                              event.target.value,
                                            )
                                          }
                                          disabled={saving}
                                          placeholder="Receipt number"
                                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label
                                        htmlFor={`payment-notes-${salary.id}`}
                                        className="mb-1.5 block text-sm font-medium text-gray-700"
                                      >
                                        Notes (optional)
                                      </label>
                                      <textarea
                                        id={`payment-notes-${salary.id}`}
                                        rows={2}
                                        value={paymentNotes}
                                        onChange={(event) =>
                                          setPaymentNotes(
                                            event.target.value,
                                          )
                                        }
                                        disabled={saving}
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                      />
                                    </div>

                                    <button
                                      type="submit"
                                      disabled={saving}
                                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
                                    >
                                      {saving && (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      )}
                                      Record Payment
                                    </button>
                                  </form>
                                ) : paymentSummary.status === "PAID" ? (
                                  <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                                    This salary has been fully paid.
                                  </div>
                                ) : (
                                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                                    No salary payment balance is due.
                                  </div>
                                )}
                              </div>

                              {/* Payment history */}

                              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                                <h3 className="font-semibold text-gray-900">
                                  Payment History
                                </h3>
                                <p className="mt-1 text-sm text-gray-500">
                                  {salary.payments?.length ?? 0} recorded instalment(s)
                                </p>

                                {!salary.payments?.length ? (
                                  <div className="mt-5 rounded-lg border border-dashed border-gray-300 p-6 text-center">
                                    <Banknote className="mx-auto h-8 w-8 text-gray-300" />
                                    <p className="mt-2 text-sm text-gray-600">
                                      No payment history recorded.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="mt-4 space-y-3">
                                    {salary.payments.map(
                                      (payment) => (
                                        <div
                                          key={payment.id}
                                          className="rounded-lg border border-gray-200 p-3"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="font-semibold text-green-700">
                                              {money(payment.amount)}
                                            </p>
                                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                                              {paymentMethodLabels[payment.method] ??
                                                payment.method}
                                            </span>
                                          </div>

                                          <p className="mt-1 text-xs text-gray-500">
                                            {formatDate(
                                              payment.paymentDate,
                                            )}
                                            {` · Recorded by ${payment.recordedBy?.name ?? "not recorded"}`}
                                            {` · Entered ${new Date(payment.createdAt).toLocaleString()}`}
                                            {payment.reference
                                              ? ` · Ref: ${payment.reference}`
                                              : ""}
                                          </p>

                                          {payment.notes && (
                                            <p className="mt-2 text-sm text-gray-600">
                                              {payment.notes}
                                            </p>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueClass = "text-gray-900",
}: {
  label: string;
  value: number;
  icon: typeof Wallet;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{label}</p>
        <div className="rounded-lg bg-gray-100 p-2 text-gray-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className={`mt-3 text-2xl font-bold ${valueClass}`}>
        {money(value)}
      </p>
    </div>
  );
}
