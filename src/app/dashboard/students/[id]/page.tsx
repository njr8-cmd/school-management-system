
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BS_MONTHS, formatBSDate } from "@/lib/nepali-date";

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;

  class: {
    id: string;
    name: string;
  };

  rollNumber: number | null;
};

type Student = {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  fatherName: string | null;
  motherName: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
};

type Enrollment = {
  id: string;

  class: {
    id: string;
    name: string;
  };

  rollNumber: number | null;
};

type Bill = {
  id: string;
  billNumber: string;
  billingDate: string;
  dueDate: string | null;
  periodStartYear: number;
  periodStartMonth: number;
  periodEndYear: number;
  periodEndMonth: number;

  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  waiverAmount: number;
  creditApplied: number;
  remainingAmount: number;

  status: string;
};

type Payment = {
  id: string;
  billId: string;
  billNumber: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string | null;
  notes: string | null;
  waiverAmount: number;
  waiverReason: string | null;
};

type Discount = {
  id: string;
  name: string;
  percentage: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
  feeTypes: string[];
};

type Charge = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  feeType: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  notes: string | null;
};

type ExamSubject = {
  id: string;

  subject: {
    id: string;
    name: string;
    code: string | null;
  };

  theoryFullMarks: number;
  practicalFullMarks: number;

  theoryMarks: number | null;
  practicalMarks: number | null;
  totalMarks: number | null;
};

type Exam = {
  id: string;
  name: string;

  term: {
    id: string;
    name: string;
    order: number;
  };

  startDate: string | null;
  endDate: string | null;

  subjects: ExamSubject[];
};

type ProfileData = {
  student: Student;

  academicYears: AcademicYear[];

  selectedAcademicYear: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
  } | null;

  enrollment: Enrollment | null;

  financial: {
    summary: {
      totalBilled: number;
      totalDiscounts: number;
      totalPaid: number;
      totalWaivers: number;
      totalCreditsApplied: number;
      remainingDue: number;
      currentPeriodDue: number;
      broughtForwardDue: number;
      totalDue: number;
    };

    bills: Bill[];
    payments: Payment[];
    discounts: Discount[];
    charges: Charge[];
    credits: {
      id: string;
      amount: number;
      appliedAmount: number;
      remainingAmount: number;
      source: string;
      notes: string | null;
      createdAt: string;
    }[];
  };

  academic: {
    exams: Exam[];
  };
};

function formatMoney(value: number) {
  return `Rs. ${value.toLocaleString("en-IN")}`;
}

function formatDate(
  value: string | null | undefined
) {
  return formatBSDate(value);
}

function getFullName(student: Student) {
  return [
    student.firstName,
    student.middleName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function StudentProfilePage() {
  const params = useParams();

  const studentId = params.id as string;

  const [data, setData] =
    useState<ProfileData | null>(null);

  const [selectedYearId, setSelectedYearId] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const loadProfile = useCallback(async (yearId?: string) => {
    try {
      let url =
        `/api/students/${studentId}/profile`;

      if (yearId) {
        url += `?academicYearId=${encodeURIComponent(
          yearId
        )}`;
      }

      const response = await fetch(url, {
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Failed to load student profile."
        );
      }

      setError("");
      setData(result);

      if (result.selectedAcademicYear?.id) {
        setSelectedYearId(
          result.selectedAcademicYear.id
        );
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load student profile."
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      // The loader applies state only after the request completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadProfile();
    }
  }, [loadProfile, studentId]);

  function handleYearChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    const yearId = event.target.value;

    setSelectedYearId(yearId);
    setLoading(true);

    loadProfile(yearId);
  }

  const fullName = useMemo(() => {
    if (!data) {
      return "";
    }

    return getFullName(data.student);
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-(--muted)">
          Loading student profile...
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/students"
          className="text-sm font-medium text-(--primary) hover:underline"
        >
          ← Back to Students
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const summary =
    data.financial.summary;

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------- */}
      {/* HEADER */}
      {/* -------------------------------------------------- */}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/dashboard/students"
            className="text-sm font-medium text-(--primary) hover:underline"
          >
            ← Back to Students
          </Link>

          <h1 className="mt-3 text-3xl font-bold">
            {fullName}
          </h1>

          <p className="mt-1 text-sm text-(--muted)">
            Admission No.{" "}
            {data.student.admissionNumber}
          </p>
        </div>

        <Link
          href="/dashboard/students"
          className="rounded-lg border border-(--border) px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Student List
        </Link>
      </div>

      {/* -------------------------------------------------- */}
      {/* ACADEMIC YEAR SELECTOR */}
      {/* -------------------------------------------------- */}

      <section className="rounded-2xl border border-(--border) bg-(--surface) p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-(--muted)">
              Viewing Records For
            </p>

            <h2 className="mt-1 text-xl font-bold">
              {data.selectedAcademicYear?.name ||
                "No Academic Year"}
            </h2>

            <p className="mt-1 text-sm text-(--muted)">
              All financial and academic records
              below are filtered to this academic
              year.
            </p>
          </div>

          <div className="w-full lg:w-72">
            <label className="mb-2 block text-sm font-medium">
              Academic Year
            </label>

            <select
              value={selectedYearId}
              onChange={handleYearChange}
              disabled={loading}
              className="w-full rounded-lg border border-(--border) bg-(--background) px-3 py-2.5 outline-none focus:ring-2 focus:ring-(--primary)"
            >
              {data.academicYears.map(
                (year) => (
                  <option
                    key={year.id}
                    value={year.id}
                  >
                    {year.name}
                    {year.isActive
                      ? " — Active"
                      : ""}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {loading && (
          <p className="mt-4 text-sm text-(--muted)">
            Loading {data.selectedAcademicYear?.name}{" "}
            records...
          </p>
        )}
      </section>

      {/* -------------------------------------------------- */}
      {/* ENROLLMENT / PERSONAL / PARENTS */}
      {/* -------------------------------------------------- */}

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoCard
          title="Enrollment"
          items={[
            [
              "Class",
              data.enrollment?.class.name ||
                "Not enrolled",
            ],
            [
              "Roll Number",
              data.enrollment?.rollNumber ??
                "—",
            ],
          ]}
        />

        <InfoCard
          title="Personal Information"
          items={[
            [
              "Gender",
              data.student.gender || "—",
            ],
            [
              "Date of Birth",
              formatDate(
                data.student.dateOfBirth
              ),
            ],
            [
              "Phone",
              data.student.phone || "—",
            ],
          ]}
        />

        <InfoCard
          title="Parents / Guardian"
          items={[
            [
              "Father",
              data.student.fatherName || "—",
            ],
            [
              "Mother",
              data.student.motherName || "—",
            ],
            [
              "Guardian",
              data.student.guardianName ||
                "—",
            ],
          ]}
        />
      </div>

      {/* -------------------------------------------------- */}
      {/* FINANCIAL SUMMARY */}
      {/* -------------------------------------------------- */}

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-bold">
            Financial Summary
          </h2>

          <p className="text-sm text-(--muted)">
            {data.selectedAcademicYear?.name}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total Billed"
            value={formatMoney(
              summary.totalBilled
            )}
          />

          <SummaryCard
            label="Discounts"
            value={formatMoney(
              summary.totalDiscounts
            )}
          />

          <SummaryCard
            label="Paid"
            value={formatMoney(
              summary.totalPaid
            )}
          />

          <SummaryCard
            label="Waivers"
            value={formatMoney(
              summary.totalWaivers
            )}
          />

          <SummaryCard
            label="Current Period Due"
            value={formatMoney(
              summary.currentPeriodDue
            )}
          />

          <SummaryCard
            label="Brought Forward"
            value={formatMoney(
              summary.broughtForwardDue
            )}
          />

          <SummaryCard
            label="Total Outstanding"
            value={formatMoney(
              summary.totalDue
            )}
          />
        </div>
      </section>

      {/* -------------------------------------------------- */}
      {/* BILLS */}
      {/* -------------------------------------------------- */}

      <section className="rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
        <div className="border-b border-(--border) p-5">
          <h2 className="text-lg font-bold">
            Bills
          </h2>

          <p className="mt-1 text-sm text-(--muted)">
            Bills belonging to this academic
            year. Earlier BS billing periods and previous-year balances are shown as brought forward; original bills remain unchanged.
          </p>
        </div>

        {data.financial.bills.length ===
        0 ? (
          <EmptyState text="No bills found for this academic year." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-black/5">
                <tr>
                  <th className="px-5 py-3 text-left">
                    Bill
                  </th>

                  <th className="px-5 py-3 text-left">
                    Period
                  </th>

                  <th className="px-5 py-3 text-right">
                    Amount
                  </th>

                  <th className="px-5 py-3 text-right">
                    Paid
                  </th>

                  <th className="px-5 py-3 text-right">
                    Due
                  </th>

                  <th className="px-5 py-3 text-left">
                    Status
                  </th>

                  <th className="px-5 py-3 text-right">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.financial.bills.map(
                  (bill) => (
                    <tr
                      key={bill.id}
                      className="border-t border-(--border)"
                    >
                      <td className="px-5 py-4 font-medium">
                        {bill.billNumber}
                      </td>

                      <td className="px-5 py-4">
                        {bill.periodStartYear === bill.periodEndYear &&
                        bill.periodStartMonth === bill.periodEndMonth
                          ? `${BS_MONTHS[bill.periodStartMonth - 1]} ${bill.periodStartYear}`
                          : `${BS_MONTHS[bill.periodStartMonth - 1]} ${bill.periodStartYear} – ${BS_MONTHS[bill.periodEndMonth - 1]} ${bill.periodEndYear}`}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {formatMoney(
                          bill.totalAmount
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {formatMoney(
                          bill.paidAmount
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {formatMoney(
                          bill.remainingAmount
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge
                          status={bill.status}
                        />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/dashboard/finance/bills/${bill.id}`}
                          className="font-medium text-(--primary) hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------------------------------------- */}
      {/* PAYMENTS */}
      {/* -------------------------------------------------- */}

      <section className="rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
        <div className="border-b border-(--border) p-5">
          <h2 className="text-lg font-bold">
            Payments
          </h2>

          <p className="mt-1 text-sm text-(--muted)">
            Payments made during this academic
            year.
          </p>
        </div>

        {data.financial.payments.length ===
        0 ? (
          <EmptyState text="No payments found for this academic year." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-black/5">
                <tr>
                  <th className="px-5 py-3 text-left">
                    Date
                  </th>

                  <th className="px-5 py-3 text-left">
                    Bill
                  </th>

                  <th className="px-5 py-3 text-right">
                    Amount
                  </th>

                  <th className="px-5 py-3 text-left">
                    Method
                  </th>

                  <th className="px-5 py-3 text-right">
                    Waiver
                  </th>

                  <th className="px-5 py-3 text-left">
                    Reference
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.financial.payments.map(
                  (payment) => (
                    <tr
                      key={payment.id}
                      className="border-t border-(--border)"
                    >
                      <td className="px-5 py-4">
                        {formatDate(
                          payment.paymentDate
                        )}
                      </td>

                      <td className="px-5 py-4 font-medium">
                        {payment.billNumber}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {formatMoney(
                          payment.amount
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {payment.method}
                      </td>

                      <td className="px-5 py-4 text-right">
                        {formatMoney(
                          payment.waiverAmount
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {payment.reference ||
                          "—"}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* -------------------------------------------------- */}
      {/* DISCOUNTS + CHARGES */}
      {/* -------------------------------------------------- */}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
          <div className="border-b border-(--border) p-5">
            <h2 className="text-lg font-bold">
              Discounts
            </h2>
          </div>

          {data.financial.discounts.length ===
          0 ? (
            <EmptyState text="No discounts for this academic year." />
          ) : (
            <div className="divide-y divide-(--border)">
              {data.financial.discounts.map(
                (discount) => (
                  <div
                    key={discount.id}
                    className="p-5"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {discount.name}
                        </p>

                        <p className="mt-1 text-sm text-(--muted)">
                          {discount.percentage}%
                        </p>

                        <p className="mt-1 text-xs text-(--muted)">
                          {formatDate(
                            discount.startDate
                          )}{" "}
                          –{" "}
                          {formatDate(
                            discount.endDate
                          )}
                        </p>
                      </div>

                      <span
                        className={
                          discount.isActive
                            ? "text-sm font-medium text-green-600"
                            : "text-sm text-(--muted)"
                        }
                      >
                        {discount.isActive
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-(--border) bg-(--surface) shadow-sm">
          <div className="border-b border-(--border) p-5">
            <h2 className="text-lg font-bold">
              Student Charges
            </h2>
          </div>

          {data.financial.charges.length ===
          0 ? (
            <EmptyState text="No student-specific charges for this academic year." />
          ) : (
            <div className="divide-y divide-(--border)">
              {data.financial.charges.map(
                (charge) => (
                  <div
                    key={charge.id}
                    className="p-5"
                  >
                    <div className="flex justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {charge.description}
                        </p>

                        <p className="mt-1 text-sm text-(--muted)">
                          {charge.feeType} •{" "}
                          {charge.frequency}
                        </p>
                      </div>

                      <p className="font-bold">
                        {formatMoney(
                          charge.amount
                        )}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>

      {/* -------------------------------------------------- */}
      {/* ACADEMIC RECORDS */}
      {/* -------------------------------------------------- */}

      <section>
        <div className="mb-3">
          <h2 className="text-xl font-bold">
            Academic Records
          </h2>

          <p className="text-sm text-(--muted)">
            Examination results for{" "}
            {data.selectedAcademicYear?.name}
          </p>
        </div>

        {data.academic.exams.length ===
        0 ? (
          <div className="rounded-2xl border border-(--border) bg-(--surface) p-8 text-center">
            <p className="font-medium">
              No examination records found.
            </p>

            <p className="mt-1 text-sm text-(--muted)">
              Marks will appear here once they
              are entered for this student.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {data.academic.exams.map(
              (exam) => (
                <div
                  key={exam.id}
                  className="overflow-hidden rounded-2xl border border-(--border) bg-(--surface) shadow-sm"
                >
                  <div className="border-b border-(--border) bg-black/5 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold">
                          {exam.name}
                        </h3>

                        <p className="text-sm text-(--muted)">
                          {exam.term.name}
                        </p>
                      </div>

                      <p className="text-sm text-(--muted)">
                        {formatDate(
                          exam.startDate
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-(--border)">
                          <th className="px-5 py-3 text-left">
                            Subject
                          </th>

                          <th className="px-5 py-3 text-right">
                            Theory
                          </th>

                          <th className="px-5 py-3 text-right">
                            Practical
                          </th>

                          <th className="px-5 py-3 text-right">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {exam.subjects.map(
                          (subject) => (
                            <tr
                              key={subject.id}
                              className="border-t border-(--border)"
                            >
                              <td className="px-5 py-4 font-medium">
                                {subject.subject
                                  .name}
                              </td>

                              <td className="px-5 py-4 text-right">
                                {subject.theoryMarks ??
                                  "—"}{" "}
                                /{" "}
                                {
                                  subject.theoryFullMarks
                                }
                              </td>

                              <td className="px-5 py-4 text-right">
                                {subject.practicalMarks ??
                                  "—"}{" "}
                                /{" "}
                                {
                                  subject.practicalFullMarks
                                }
                              </td>

                              <td className="px-5 py-4 text-right font-semibold">
                                {subject.totalMarks ??
                                  "—"}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ========================================================= */
/* COMPONENTS                                                 */
/* ========================================================= */

function InfoCard({
  title,
  items,
}: {
  title: string;
  items: Array<
    [string, string | number]
  >;
}) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-sm">
      <h3 className="mb-4 font-bold">
        {title}
      </h3>

      <div className="space-y-3">
        {items.map(
          ([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-4"
            >
              <span className="text-sm text-(--muted)">
                {label}
              </span>

              <span className="text-right text-sm font-medium">
                {value}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-(--border) bg-(--surface) p-5 shadow-sm">
      <p className="text-sm text-(--muted)">
        {label}
      </p>

      <p className="mt-2 text-xl font-bold">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  const styles: Record<
    string,
    string
  > = {
    PAID: "bg-green-100 text-green-700",
    PARTIAL:
      "bg-yellow-100 text-yellow-700",
    UNPAID: "bg-red-100 text-red-700",
    CANCELLED:
      "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        styles[status] ||
        "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  text,
}: {
  text: string;
}) {
  return (
    <div className="p-8 text-center text-sm text-(--muted)">
      {text}
    </div>
  );
}
