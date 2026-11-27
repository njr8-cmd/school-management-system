"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Loader2,
  User,
  Users,
  CheckCircle2,
} from "lucide-react";

import {
  BS_MONTHS,
  bsToDate,
  dateToBS,
  compareBSMonths,
} from "@/lib/nepali-date";

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

type Student = {
  id: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  phone: string | null;
};

type BSYearMonth = {
  year: number;
  month: number;
};

type ExistingBalanceState =
  | {
      studentId: string;
      academicYearId: string;
      totalDue: number;
    }
  | {
      studentId: string;
      academicYearId: string;
      errorMessage: string;
    };

type AdmissionAssessment = {
  id: string;
  status: "NOT_PAID" | "PARTIAL_PAID" | "FULL_PAID" | "EXEMPTED" | "PENDING";
  feeStructure: {
    id: string;
    name: string;
    amount: string | number;
  };
};

function getStudentName(student: Student) {
  return [
    student.firstName,
    student.middleName,
    student.lastName,
  ]
    .filter(Boolean)
    .join(" ");
}

function getAcademicYearBSRange(
  year: AcademicYear
): {
  start: BSYearMonth;
  end: BSYearMonth;
} {
  const start = dateToBS(new Date(year.startDate));
  const end = dateToBS(new Date(year.endDate));

  return {
    start: {
      year: start.year,
      month: start.month,
    },
    end: {
      year: end.year,
      month: end.month,
    },
  };
}

function formatBSMonth(year: number, month: number) {
  if (!year || !month) return "-";

  return `${BS_MONTHS[month - 1]} ${year}`;
}

function formatBSDate(
  year: number,
  month: number,
  day: number
) {
  if (!year || !month || !day) return "-";

  return `${day} ${BS_MONTHS[month - 1]} ${year} BS`;
}

function formatCurrency(value: number) {
  return `Rs. ${value.toLocaleString("en-NP", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getBSYears(
  academicYears: AcademicYear[]
): number[] {
  const years = new Set<number>();

  for (const academicYear of academicYears) {
    const range = getAcademicYearBSRange(academicYear);

    for (
      let year = range.start.year;
      year <= range.end.year;
      year++
    ) {
      years.add(year);
    }
  }

  return Array.from(years).sort((a, b) => a - b);
}

export default function NewBillPage() {
  const router = useRouter();

  const [academicYears, setAcademicYears] =
    useState<AcademicYear[]>([]);

  const [students, setStudents] =
    useState<Student[]>([]);

  const [academicYearId, setAcademicYearId] =
    useState("");

  const [studentId, setStudentId] =
    useState("");

  const [periodStartYear, setPeriodStartYear] =
    useState<number | "">("");

  const [periodStartMonth, setPeriodStartMonth] =
    useState<number | "">("");

  const [periodEndYear, setPeriodEndYear] =
    useState<number | "">("");

  const [periodEndMonth, setPeriodEndMonth] =
    useState<number | "">("");

  const [dueDateYear, setDueDateYear] =
    useState<number | "">("");

  const [dueDateMonth, setDueDateMonth] =
    useState<number | "">("");

  const [dueDateDay, setDueDateDay] =
    useState<number | "">("");

  const [notes, setNotes] = useState("");

  const [admissionAssessments, setAdmissionAssessments] =
    useState<AdmissionAssessment[]>([]);
  const [admissionStatus, setAdmissionStatus] =
    useState<"NOT_PAID" | "PARTIAL_PAID" | "FULL_PAID" | "EXEMPTED">(
      "NOT_PAID",
    );
  const [historicalAmount, setHistoricalAmount] = useState("");
  const [historicalPaymentDate, setHistoricalPaymentDate] = useState("");
  const [historicalReference, setHistoricalReference] = useState("");
  const [historicalRemarks, setHistoricalRemarks] = useState("");
  const [exemptionReason, setExemptionReason] = useState("");

  const [loadingYears, setLoadingYears] =
    useState(true);

  const [loadingStudents, setLoadingStudents] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [existingBalance, setExistingBalance] =
    useState<ExistingBalanceState | null>(null);

  async function loadAcademicYears() {
    try {
      const response = await fetch(
        "/api/academic-years",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load academic years."
        );
      }

      const years: AcademicYear[] =
        Array.isArray(data)
          ? data
          : data?.academicYears || [];

      setAcademicYears(years);

      const activeYear =
        years.find((year) => year.isActive) ||
        years[0];

      if (activeYear) {
        setAcademicYearId(activeYear.id);

        const range =
          getAcademicYearBSRange(activeYear);

        setPeriodStartYear(range.start.year);
        setPeriodStartMonth(range.start.month);

        setPeriodEndYear(range.end.year);
        setPeriodEndMonth(range.end.month);
      }
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load academic years."
      );
    } finally {
      setLoadingYears(false);
    }
  }

  async function loadStudents() {
    try {
      const response = await fetch(
        "/api/students",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to load students."
        );
      }

      const studentList: Student[] =
        Array.isArray(data)
          ? data
          : data?.students || [];

      setStudents(studentList);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load students."
      );
    } finally {
      setLoadingStudents(false);
    }
  }

  useEffect(() => {
    // Both loaders update state only after their requests complete.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAcademicYears();
    loadStudents();
  }, []);

  useEffect(() => {
    if (!studentId || !academicYearId) {
      return;
    }

    const controller = new AbortController();

    async function loadExistingBalance() {
      try {
        const response = await fetch(
          `/api/students/${encodeURIComponent(studentId)}/profile?academicYearId=${encodeURIComponent(academicYearId)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Failed to load the student's existing balance."
          );
        }

        const totalDue = data?.financial?.summary?.totalDue;

        if (
          typeof totalDue !== "number" ||
          !Number.isFinite(totalDue) ||
          totalDue < 0
        ) {
          throw new Error(
            "The student's existing balance response is invalid."
          );
        }

        setExistingBalance({
          studentId,
          academicYearId,
          totalDue,
        });
      } catch (balanceError) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Failed to load the student's existing balance:",
          balanceError
        );
        setExistingBalance({
          studentId,
          academicYearId,
          errorMessage:
            balanceError instanceof Error
              ? balanceError.message
              : "Failed to load the student's existing balance.",
        });
      }
    }

    void loadExistingBalance();

    return () => controller.abort();
  }, [studentId, academicYearId]);

  useEffect(() => {
    if (!studentId || !academicYearId) {
      return;
    }

    const controller = new AbortController();
    void fetch(
      `/api/admission-fee-assessments?studentId=${encodeURIComponent(studentId)}&academicYearId=${encodeURIComponent(academicYearId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to load admission-fee assessment.");
        setAdmissionAssessments(Array.isArray(data?.assessments) ? data.assessments : []);
      })
      .catch((assessmentError) => {
        if (!controller.signal.aborted) {
          setAdmissionAssessments([]);
          setError(assessmentError instanceof Error ? assessmentError.message : "Failed to load admission-fee assessment.");
        }
      })

    return () => controller.abort();
  }, [studentId, academicYearId]);

  const selectedAcademicYear =
    useMemo(() => {
      return academicYears.find(
        (year) =>
          year.id === academicYearId
      );
    }, [
      academicYears,
      academicYearId,
    ]);

  const selectedStudent =
    useMemo(() => {
      return students.find(
        (student) =>
          student.id === studentId
      );
    }, [students, studentId]);

  const selectedBalance =
    existingBalance?.studentId === studentId &&
    existingBalance.academicYearId === academicYearId
      ? existingBalance
      : null;

  const bsYears = useMemo(
    () => getBSYears(academicYears),
    [academicYears]
  );

  function handleAcademicYearChange(
    value: string
  ) {
    setAcademicYearId(value);
    setAdmissionAssessments([]);

    const year = academicYears.find(
      (item) => item.id === value
    );

    if (!year) return;

    const range =
      getAcademicYearBSRange(year);

    setPeriodStartYear(range.start.year);
    setPeriodStartMonth(range.start.month);

    setPeriodEndYear(range.end.year);
    setPeriodEndMonth(range.end.month);

    setDueDateYear("");
    setDueDateMonth("");
    setDueDateDay("");
  }

  function validatePeriod() {
    if (
      periodStartYear === "" ||
      periodStartMonth === "" ||
      periodEndYear === "" ||
      periodEndMonth === ""
    ) {
      return "Please select the complete billing period.";
    }

    const comparison = compareBSMonths(
      {
        year: Number(periodStartYear),
        month: Number(periodStartMonth),
      },
      {
        year: Number(periodEndYear),
        month: Number(periodEndMonth),
      }
    );

    if (comparison > 0) {
      return "Billing period start cannot be after billing period end.";
    }

    return null;
  }

  function validateDueDate() {
    if (
      dueDateYear === "" &&
      dueDateMonth === "" &&
      dueDateDay === ""
    ) {
      return null;
    }

    if (
      dueDateYear === "" ||
      dueDateMonth === "" ||
      dueDateDay === ""
    ) {
      return "Please select the complete due date.";
    }

    if (
      Number(dueDateDay) < 1 ||
      Number(dueDateDay) > 32
    ) {
      return "Invalid Nepali due date day.";
    }

    try {
      bsToDate(
        Number(dueDateYear),
        Number(dueDateMonth),
        Number(dueDateDay)
      );
    } catch {
      return "The selected Nepali due date is invalid.";
    }

    if (
      periodStartYear !== "" &&
      periodStartMonth !== ""
    ) {
      const comparison = compareBSMonths(
        {
          year: Number(dueDateYear),
          month: Number(dueDateMonth),
        },
        {
          year: Number(periodStartYear),
          month: Number(periodStartMonth),
        }
      );

      if (comparison < 0) {
        return "Due date cannot be before the billing period starts.";
      }
    }

    return null;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!academicYearId) {
      setError(
        "Please select an academic year."
      );
      return;
    }

    if (!studentId) {
      setError("Please select a student.");
      return;
    }

    const periodError = validatePeriod();

    if (periodError) {
      setError(periodError);
      return;
    }

    const dueDateError = validateDueDate();

    if (dueDateError) {
      setError(dueDateError);
      return;
    }

    if (
      admissionAssessments.length === 0 &&
      admissionStatus === "PARTIAL_PAID"
    ) {
      const amount = Number(historicalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError("Enter the positive historical payment amount.");
        return;
      }
    }

    if (
      admissionAssessments.length === 0 &&
      admissionStatus === "EXEMPTED" &&
      !exemptionReason.trim()
    ) {
      setError("Enter the reason for the admission-fee exemption.");
      return;
    }

    let dueDateISO: string | undefined;

    if (
      dueDateYear !== "" &&
      dueDateMonth !== "" &&
      dueDateDay !== ""
    ) {
      try {
        const dueDate = bsToDate(
          Number(dueDateYear),
          Number(dueDateMonth),
          Number(dueDateDay)
        );

        dueDateISO = dueDate.toISOString();
      } catch {
        setError(
          "The selected Nepali due date is invalid."
        );
        return;
      }
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        "/api/bills",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            studentId,
            academicYearId,
            periodStartYear:
              Number(periodStartYear),
            periodStartMonth:
              Number(periodStartMonth),
            periodEndYear:
              Number(periodEndYear),
            periodEndMonth:
              Number(periodEndMonth),
            dueDate:
              dueDateISO || undefined,
            notes:
              notes.trim() || undefined,
            admissionFeeReconciliation:
              admissionAssessments.length === 0
                ? {
                    status: admissionStatus,
                    historicalAmount:
                      admissionStatus === "PARTIAL_PAID"
                        ? Number(historicalAmount)
                        : undefined,
                    paymentDate:
                      historicalPaymentDate || undefined,
                    reference:
                      historicalReference.trim() || undefined,
                    remarks:
                      historicalRemarks.trim() || undefined,
                    reason:
                      admissionStatus === "EXEMPTED"
                        ? exemptionReason.trim()
                        : undefined,
                  }
                : undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "Failed to create bill."
        );
      }

      const createdBill = data?.bill;

      if (!createdBill?.id) {
        throw new Error(
          "Bill was created, but no bill ID was returned."
        );
      }

      setSuccess(
        "Bill created successfully. Redirecting..."
      );

      router.push(
        `/dashboard/finance/bills/${createdBill.id}`
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to create bill."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/finance/bills"
          className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Bills
        </Link>

        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-red-50 p-3 text-red-700">
            <FileText className="h-6 w-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Create New Bill
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Generate a bill using the student&apos;s
              active fees, charges and applicable
              discounts.
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main form */}
          <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-50 p-2 text-red-700">
                  <FileText className="h-5 w-5" />
                </div>

                <div>
                  <h2 className="font-semibold text-gray-900">
                    Bill Details
                  </h2>

                  <p className="text-sm text-gray-500">
                    Select the student and Nepali
                    billing period.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              {/* Academic Year */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Academic Year{" "}
                  <span className="text-red-600">
                    *
                  </span>
                </label>

                <select
                  value={academicYearId}
                  onChange={(event) =>
                    handleAcademicYearChange(
                      event.target.value
                    )
                  }
                  disabled={
                    loadingYears ||
                    submitting
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                  required
                >
                  <option value="">
                    {loadingYears
                      ? "Loading academic years..."
                      : "Select academic year"}
                  </option>

                  {academicYears.map(
                    (year) => (
                      <option
                        key={year.id}
                        value={year.id}
                      >
                        {year.name}
                        {year.isActive
                          ? " (Active)"
                          : ""}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Student */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Student{" "}
                  <span className="text-red-600">
                    *
                  </span>
                </label>

                <div className="relative">
                  <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                  <select
                    value={studentId}
                    onChange={(event) =>
                      {
                        setStudentId(event.target.value);
                        setAdmissionAssessments([]);
                      }
                    }
                    disabled={
                      loadingStudents ||
                      submitting
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                    required
                  >
                    <option value="">
                      {loadingStudents
                        ? "Loading students..."
                        : "Select student"}
                    </option>

                    {students.map(
                      (student) => (
                        <option
                          key={student.id}
                          value={student.id}
                        >
                          {getStudentName(
                            student
                          )}{" "}
                          —{" "}
                          {
                            student.admissionNumber
                          }
                        </option>
                      )
                    )}
                  </select>
                </div>

                {studentId && academicYearId && (
                  <div
                    className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"
                    aria-live="polite"
                  >
                    {!selectedBalance && (
                      <p className="text-gray-600" role="status">
                        Checking outstanding on existing bills...
                      </p>
                    )}

                    {selectedBalance &&
                      "errorMessage" in selectedBalance && (
                        <div>
                          <p className="text-red-700" role="alert">
                            Could not check the existing balance:{" "}
                            {selectedBalance.errorMessage}
                          </p>
                          <Link
                            href={`/dashboard/students/${studentId}`}
                            className="mt-1 inline-block font-medium text-red-800 underline"
                          >
                            Review the student&apos;s bill history
                          </Link>
                        </div>
                      )}

                    {selectedBalance &&
                      "totalDue" in selectedBalance && (
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-900">
                              Outstanding on existing bills:{" "}
                              {formatCurrency(selectedBalance.totalDue)}
                            </p>
                            <p className="mt-1 text-xs text-gray-600">
                              This balance stays on those bills and is not
                              added to the new bill.
                            </p>
                          </div>
                          <Link
                            href={`/dashboard/students/${studentId}`}
                            className="font-medium text-red-800 underline"
                          >
                            View bill history
                          </Link>
                        </div>
                      )}
                  </div>
                )}
              </div>

              {studentId && academicYearId && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="mb-3 text-sm font-semibold text-gray-900">
                    Annual Admission-Fee Reconciliation
                  </p>
                  {admissionAssessments.length > 0 ? (
                    <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                      This student already has a reconciled admission-fee assessment for this academic year.
                      {" "}Assessment status: {admissionAssessments[0].status.replaceAll("_", " ")}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={admissionStatus}
                        onChange={(event) =>
                          setAdmissionStatus(
                            event.target.value as typeof admissionStatus,
                          )
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                        disabled={submitting}
                      >
                        <option value="NOT_PAID">Not paid</option>
                        <option value="PARTIAL_PAID">Partially paid outside the software</option>
                        <option value="FULL_PAID">Fully paid outside the software</option>
                        <option value="EXEMPTED">Exempted</option>
                      </select>
                      {(admissionStatus === "PARTIAL_PAID" ||
                        admissionStatus === "FULL_PAID") && (
                        <div className="grid gap-3 md:grid-cols-2">
                          {admissionStatus === "PARTIAL_PAID" && (
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={historicalAmount}
                              onChange={(event) => setHistoricalAmount(event.target.value)}
                              placeholder="Historical amount (Rs.)"
                              className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                            />
                          )}
                          <input
                            type="date"
                            value={historicalPaymentDate}
                            onChange={(event) => setHistoricalPaymentDate(event.target.value)}
                            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                          />
                          <input
                            value={historicalReference}
                            onChange={(event) => setHistoricalReference(event.target.value)}
                            placeholder="Receipt/reference"
                            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                          />
                          <input
                            value={historicalRemarks}
                            onChange={(event) => setHistoricalRemarks(event.target.value)}
                            placeholder="Remarks"
                            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                          />
                        </div>
                      )}
                      {admissionStatus === "EXEMPTED" && (
                        <input
                          value={exemptionReason}
                          onChange={(event) => setExemptionReason(event.target.value)}
                          placeholder="Required exemption reason"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Billing Period */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Billing Period{" "}
                    <span className="text-red-600">
                      *
                    </span>
                  </label>

                  <span className="text-xs font-medium text-red-700">
                    Nepali Calendar (BS)
                  </span>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  {/* Start */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Period Start
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Year
                        </label>

                        <select
                          value={
                            periodStartYear
                          }
                          onChange={(event) =>
                            setPeriodStartYear(
                              event.target
                                .value
                                ? Number(
                                    event.target
                                      .value
                                  )
                                : ""
                            )
                          }
                          disabled={submitting}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                          required
                        >
                          <option value="">
                            Year
                          </option>

                          {bsYears.map(
                            (year) => (
                              <option
                                key={year}
                                value={year}
                              >
                                {year}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Month
                        </label>

                        <select
                          value={
                            periodStartMonth
                          }
                          onChange={(event) =>
                            setPeriodStartMonth(
                              event.target
                                .value
                                ? Number(
                                    event.target
                                      .value
                                  )
                                : ""
                            )
                          }
                          disabled={submitting}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                          required
                        >
                          <option value="">
                            Month
                          </option>

                          {BS_MONTHS.map(
                            (
                              month,
                              index
                            ) => (
                              <option
                                key={month}
                                value={
                                  index + 1
                                }
                              >
                                {month}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* End */}
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Period End
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Year
                        </label>

                        <select
                          value={
                            periodEndYear
                          }
                          onChange={(event) =>
                            setPeriodEndYear(
                              event.target
                                .value
                                ? Number(
                                    event.target
                                      .value
                                  )
                                : ""
                            )
                          }
                          disabled={submitting}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                          required
                        >
                          <option value="">
                            Year
                          </option>

                          {bsYears.map(
                            (year) => (
                              <option
                                key={year}
                                value={year}
                              >
                                {year}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs text-gray-500">
                          Month
                        </label>

                        <select
                          value={
                            periodEndMonth
                          }
                          onChange={(event) =>
                            setPeriodEndMonth(
                              event.target
                                .value
                                ? Number(
                                    event.target
                                      .value
                                  )
                                : ""
                            )
                          }
                          disabled={submitting}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                          required
                        >
                          <option value="">
                            Month
                          </option>

                          {BS_MONTHS.map(
                            (
                              month,
                              index
                            ) => (
                              <option
                                key={month}
                                value={
                                  index + 1
                                }
                              >
                                {month}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Due Date
                  </label>

                  <span className="text-xs font-medium text-red-700">
                    BS
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={dueDateDay}
                      onChange={(event) =>
                        setDueDateDay(
                          event.target
                            .value
                            ? Number(
                                event.target
                                  .value
                              )
                            : ""
                        )
                      }
                      placeholder="Day"
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                    />
                  </div>

                  <select
                    value={dueDateMonth}
                    onChange={(event) =>
                      setDueDateMonth(
                        event.target.value
                          ? Number(
                              event.target
                                .value
                            )
                          : ""
                      )
                    }
                    disabled={submitting}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                  >
                    <option value="">
                      Month
                    </option>

                    {BS_MONTHS.map(
                      (month, index) => (
                        <option
                          key={month}
                          value={index + 1}
                        >
                          {month}
                        </option>
                      )
                    )}
                  </select>

                  <select
                    value={dueDateYear}
                    onChange={(event) =>
                      setDueDateYear(
                        event.target.value
                          ? Number(
                              event.target
                                .value
                            )
                          : ""
                      )
                    }
                    disabled={submitting}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                  >
                    <option value="">
                      Year
                    </option>

                    {bsYears.map(
                      (year) => (
                        <option
                          key={year}
                          value={year}
                        >
                          {year}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <p className="mt-1.5 text-xs text-gray-500">
                  Optional. The due date is entered
                  in the Nepali Bikram Sambat calendar.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Notes
                </label>

                <textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(
                      event.target.value
                    )
                  }
                  disabled={submitting}
                  rows={4}
                  placeholder="Optional notes for this bill..."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-6">
            {/* Selected Student */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-red-50 p-2 text-red-700">
                    <User className="h-5 w-5" />
                  </div>

                  <h2 className="font-semibold text-gray-900">
                    Selected Student
                  </h2>
                </div>
              </div>

              <div className="p-5">
                {selectedStudent ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Name
                      </p>

                      <p className="mt-1 font-semibold text-gray-900">
                        {getStudentName(
                          selectedStudent
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Admission Number
                      </p>

                      <p className="mt-1 text-sm text-gray-700">
                        {
                          selectedStudent.admissionNumber
                        }
                      </p>
                    </div>

                    {selectedStudent.phone && (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Phone
                        </p>

                        <p className="mt-1 text-sm text-gray-700">
                          {
                            selectedStudent.phone
                          }
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Select a student to see their
                    information.
                  </p>
                )}
              </div>
            </div>

            {/* Billing Period Summary */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-5 py-4">
                <h2 className="font-semibold text-gray-900">
                  Billing Period
                </h2>
              </div>

              <div className="space-y-4 p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Academic Year
                  </p>

                  <p className="mt-1 font-medium text-gray-900">
                    {selectedAcademicYear?.name ||
                      "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Period
                  </p>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {periodStartYear !== "" &&
                    periodStartMonth !== ""
                      ? formatBSMonth(
                          Number(
                            periodStartYear
                          ),
                          Number(
                            periodStartMonth
                          )
                        )
                      : "-"}

                    {" → "}

                    {periodEndYear !== "" &&
                    periodEndMonth !== ""
                      ? formatBSMonth(
                          Number(
                            periodEndYear
                          ),
                          Number(
                            periodEndMonth
                          )
                        )
                      : "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Due Date
                  </p>

                  <p className="mt-1 text-sm text-gray-700">
                    {dueDateYear !== "" &&
                    dueDateMonth !== "" &&
                    dueDateDay !== ""
                      ? formatBSDate(
                          Number(
                            dueDateYear
                          ),
                          Number(
                            dueDateMonth
                          ),
                          Number(
                            dueDateDay
                          )
                        )
                      : "Not specified"}
                  </p>
                </div>
              </div>
            </div>

            {/* Calculation information */}
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5">
              <h3 className="font-semibold text-gray-900">
                Before You Generate
              </h3>

              <p className="mt-2 text-sm leading-6 text-gray-700">
                The system will automatically
                calculate active class fees,
                student-specific charges and
                applicable discounts for the
                selected Nepali billing period.
              </p>

              <div className="mt-4 rounded-lg border border-yellow-200 bg-white/60 p-3">
                <p className="text-xs font-medium text-gray-500">
                  Selected period
                </p>

                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {periodStartYear !== "" &&
                  periodStartMonth !== "" &&
                  periodEndYear !== "" &&
                  periodEndMonth !== ""
                    ? `${formatBSMonth(
                        Number(
                          periodStartYear
                        ),
                        Number(
                          periodStartMonth
                        )
                      )} → ${formatBSMonth(
                        Number(periodEndYear),
                        Number(periodEndMonth)
                      )}`
                    : "Select a billing period"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:flex-row sm:justify-end">
          <Link
            href="/dashboard/finance/bills"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={
              submitting ||
              loadingYears ||
              loadingStudents
            }
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Bill...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Generate Bill
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}