"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import {
  billOutstandingAmount,
  sumActiveBilledAmount,
} from "@/lib/finance/bill-summary";
import { BS_MONTHS, formatBSDate } from "@/lib/nepali-date";

type AcademicYear = {
  id: string;
  name?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
};

type BillPayment = {
  id: string;
  amount: string | number;
  waiverAmount?: string | number;
};

type CreditApplication = {
  id: string;
  amount: string | number;
  reversedAt?: string | null;
  credit?: {
    amount?: string | number;
  };
};

type Student = {
  id?: string;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
};

type Bill = {
  id: string;
  billNumber: string;
  billingDate: string;
  dueDate?: string | null;

  periodStartYear: number;
  periodStartMonth: number;
  periodEndYear: number;
  periodEndMonth: number;

  totalAmount: string | number;
  discountAmount: string | number;
  paidAmount: string | number;

  status:
    | "UNPAID"
    | "PARTIAL"
    | "PAID"
    | "CANCELLED";

  notes?: string | null;

  student?: Student | null;
  studentId: string;

  academicYear?: AcademicYear | null;
  academicYearId: string;

  payments?: BillPayment[];
  creditApplications?: CreditApplication[];
};

const statusOptions = [
  { value: "ALL", label: "All Statuses" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

function toNumber(
  value: string | number | null | undefined,
): number {
  const number = Number(value ?? 0);

  return Number.isFinite(number) ? number : 0;
}

function formatMoney(
  value: string | number | null | undefined,
): string {
  return `Rs. ${toNumber(value).toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(
  value: string | null | undefined,
): string {
  return formatBSDate(value);
}

/**
 * Format the billing period using the Nepali calendar.
 *
 * Example:
 * Shrawan 2083 → Ashwin 2083
 */
function formatBillingPeriod(
  bill: Bill,
): string {
  const startMonth =
    BS_MONTHS[bill.periodStartMonth - 1];

  const endMonth =
    BS_MONTHS[bill.periodEndMonth - 1];

  if (!startMonth || !endMonth) {
    return "-";
  }

  const start = `${startMonth} ${bill.periodStartYear}`;
  const end = `${endMonth} ${bill.periodEndYear}`;

  return `${start} → ${end}`;
}

function getStudentName(
  student?: Student | null,
  studentId?: string,
): string {
  if (!student) {
    return studentId || "Unknown Student";
  }

  if (student.name?.trim()) {
    return student.name;
  }

  if (student.fullName?.trim()) {
    return student.fullName;
  }

  const fullName = [
    student.firstName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  return studentId || "Unknown Student";
}

function getAcademicYearName(
  academicYear?: AcademicYear | null,
  academicYearId?: string,
): string {
  if (!academicYear) {
    return academicYearId || "Unknown Year";
  }

  return (
    academicYear.name ||
    academicYear.title ||
    academicYearId ||
    "Unknown Year"
  );
}

function getTotalWaiver(
  bill: Bill,
): number {
  return (bill.payments ?? []).reduce(
    (sum, payment) =>
      sum + toNumber(payment.waiverAmount),
    0,
  );
}

function getTotalCredits(
  bill: Bill,
): number {
  return (
    bill.creditApplications ?? []
  ).reduce((sum, application) => {
    if (application.reversedAt) {
      return sum;
    }

    const applicationAmount =
      toNumber(application.amount);

    if (applicationAmount > 0) {
      return sum + applicationAmount;
    }

    return (
      sum +
      toNumber(application.credit?.amount)
    );
  }, 0);
}

function getRemainingAmount(
  bill: Bill,
): number {
  return billOutstandingAmount({
    status: bill.status,
    totalAmount: toNumber(bill.totalAmount),
    paidAmount: toNumber(bill.paidAmount),
    waiverAmount: getTotalWaiver(bill),
    creditAmount: getTotalCredits(bill),
  });
}

function getStatusClasses(
  status: Bill["status"],
): string {
  switch (status) {
    case "PAID":
      return "bg-green-100 text-green-700 border-green-200";

    case "PARTIAL":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";

    case "UNPAID":
      return "bg-red-100 text-red-700 border-red-200";

    case "CANCELLED":
      return "bg-gray-100 text-gray-600 border-gray-200";

    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

function getStatusLabel(
  status: Bill["status"],
): string {
  switch (status) {
    case "PAID":
      return "Paid";

    case "PARTIAL":
      return "Partial";

    case "UNPAID":
      return "Unpaid";

    case "CANCELLED":
      return "Cancelled";

    default:
      return status;
  }
}

export default function BillsPage() {
  const [bills, setBills] =
    useState<Bill[]>([]);

  const [academicYears, setAcademicYears] =
    useState<AcademicYear[]>([]);

  const [
    selectedAcademicYear,
    setSelectedAcademicYear,
  ] = useState("ALL");

  const [selectedStatus, setSelectedStatus] =
    useState("ALL");

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  async function loadBills(
    showRefreshing = false,
  ) {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      }

      const response = await fetch(
        "/api/bills",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load bills.",
        );
      }

      if (!Array.isArray(data)) {
        throw new Error(
          "Invalid bills response from server.",
        );
      }


      setError("");
      setBills(data);
    } catch (err) {
      console.error(
        "Failed to load bills:",
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load bills. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadAcademicYears() {
    try {
      const response = await fetch(
        "/api/academic-years",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load academic years.",
        );
      }

      if (Array.isArray(data)) {
        setAcademicYears(data);
      }
    } catch (err) {
      console.error(
        "Failed to load academic years:",
        err,
      );
    }
  }

  useEffect(() => {
    // These loaders update state only after their requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBills();
    loadAcademicYears();
  }, []);

  const filteredBills = useMemo(() => {
    const searchTerm =
      search.trim().toLowerCase();

    return bills.filter((bill) => {
      const matchesAcademicYear =
        selectedAcademicYear === "ALL" ||
        bill.academicYearId ===
          selectedAcademicYear;

      const matchesStatus =
        selectedStatus === "ALL" ||
        bill.status === selectedStatus;

      if (
        !matchesAcademicYear ||
        !matchesStatus
      ) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      const studentName =
        getStudentName(
          bill.student,
          bill.studentId,
        ).toLowerCase();

      const billNumber =
        bill.billNumber?.toLowerCase() ||
        "";

      return (
        studentName.includes(searchTerm) ||
        billNumber.includes(searchTerm) ||
        bill.studentId
          .toLowerCase()
          .includes(searchTerm)
      );
    });
  }, [
    bills,
    selectedAcademicYear,
    selectedStatus,
    search,
  ]);

  const summary = useMemo(() => {
    let paid = 0;
    let remaining = 0;

    const total = sumActiveBilledAmount(filteredBills);

    filteredBills.forEach((bill) => {
      paid += toNumber(
        bill.paidAmount,
      );

      remaining +=
        getRemainingAmount(bill);
    });

    return {
      count: filteredBills.length,
      total,
      paid,
      remaining,
    };
  }, [filteredBills]);

  return (
    <div className="space-y-6">
      {/* Header */}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-100 p-3 text-red-700">
              <FileText className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Bills
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                View and manage student
                bills, payments, discounts,
                and outstanding amounts.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadBills(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing
                ? "animate-spin"
                : ""
            }`}
          />

          Refresh
        </button>
      </div>

      {/* Error */}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Bills
          </p>

          <p className="mt-1 text-2xl font-bold text-gray-900">
            {summary.count}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Billed
          </p>

          <p className="mt-1 text-2xl font-bold text-gray-900">
            {formatMoney(summary.total)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total Paid
          </p>

          <p className="mt-1 text-2xl font-bold text-green-700">
            {formatMoney(summary.paid)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Outstanding
          </p>

          <p className="mt-1 text-2xl font-bold text-red-700">
            {formatMoney(summary.remaining)}
          </p>
        </div>
      </div>

      {/* Filters */}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Search */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search
            </label>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Bill number or student..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
          </div>

          {/* Academic Year */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Academic Year
            </label>

            <select
              value={selectedAcademicYear}
              onChange={(event) =>
                setSelectedAcademicYear(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ALL">
                All Academic Years
              </option>

              {academicYears.map((year) => (
                <option
                  key={year.id}
                  value={year.id}
                >
                  {getAcademicYearName(
                    year,
                    year.id,
                  )}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Status
            </label>

            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(
                  event.target.value,
                )
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              {statusOptions.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Bills Table */}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Bill List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {loading
                ? "Loading bills..."
                : `${filteredBills.length} bill${
                    filteredBills.length ===
                    1
                      ? ""
                      : "s"
                  } found`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center px-6 py-16">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading bills...
            </div>
          </div>
        ) : filteredBills.length ===
          0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-gray-300" />

            <h3 className="mt-3 text-sm font-semibold text-gray-900">
              No bills found
            </h3>

            <p className="mt-1 text-sm text-gray-500">
              Try changing the filters or
              search term.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Bill
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Student
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Billing Period
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Total
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Discount
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Paid
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Remaining
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Due Date
                  </th>

                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredBills.map(
                  (bill) => {
                    const remaining =
                      getRemainingAmount(
                        bill,
                      );

                    return (
                      <tr
                        key={bill.id}
                        className="transition hover:bg-gray-50"
                      >
                        {/* Bill */}

                        <td className="whitespace-nowrap px-5 py-4">
                          <div className="font-medium text-gray-900">
                            {bill.billNumber}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {formatDate(
                              bill.billingDate,
                            )}
                          </div>
                        </td>

                        {/* Student */}

                        <td className="px-5 py-4">
                          <div className="font-medium text-gray-900">
                            {getStudentName(
                              bill.student,
                              bill.studentId,
                            )}
                          </div>

                          <div className="mt-1 text-xs text-gray-500">
                            {getAcademicYearName(
                              bill.academicYear,
                              bill.academicYearId,
                            )}
                          </div>
                        </td>

                        {/* BS Billing Period */}

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                          <div className="font-medium text-gray-800">
                            {formatBillingPeriod(
                              bill,
                            )}
                          </div>

                          <div className="mt-1 text-xs text-gray-400">
                            {bill.periodStartYear ===
                              bill.periodEndYear &&
                            bill.periodStartMonth ===
                              bill.periodEndMonth
                              ? "1 billing month"
                              : "Billing period"}
                          </div>
                        </td>

                        {/* Total */}

                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-medium text-gray-900">
                          {formatMoney(
                            bill.totalAmount,
                          )}
                        </td>

                        {/* Discount */}

                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm text-red-600">
                          {formatMoney(
                            bill.discountAmount,
                          )}
                        </td>

                        {/* Paid */}

                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-medium text-green-700">
                          {formatMoney(
                            bill.paidAmount,
                          )}
                        </td>

                        {/* Remaining */}

                        <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold">
                          <span
                            className={
                              remaining > 0
                                ? "text-red-700"
                                : "text-green-700"
                            }
                          >
                            {formatMoney(
                              remaining,
                            )}
                          </span>
                        </td>

                        {/* Due Date */}

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-600">
                          {formatDate(
                            bill.dueDate,
                          )}
                        </td>

                        {/* Status */}

                        <td className="whitespace-nowrap px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(
                              bill.status,
                            )}`}
                          >
                            {getStatusLabel(
                              bill.status,
                            )}
                          </span>
                        </td>

                        {/* Action */}

                        <td className="whitespace-nowrap px-5 py-4 text-right">
                          <Link
                            href={`/dashboard/finance/bills/${bill.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}