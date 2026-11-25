"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { bsToDate, formatBS } from "@/lib/nepali-date";
import {
  getSetupRequestError,
  readSetupResponse,
} from "@/lib/setup-request";

const requestTimeoutMs = 35_000;

type AcademicYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export default function AcademicYearsPage() {
  const router = useRouter();
  const submissionInProgress = useRef(false);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingYearId, setActivatingYearId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [startYear, setStartYear] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [startDay, setStartDay] = useState("");
  const [endYear, setEndYear] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [endDay, setEndDay] = useState("");

  const [error, setError] = useState("");

  async function activateAcademicYear(id: string) {
    if (activatingYearId !== null) {
      return;
    }

    setActivatingYearId(id);
    setError("");

    try {
      const response = await fetch(`/api/academic-years/${id}/activate`, {
        method: "PATCH",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      await readSetupResponse(response, "Failed to activate academic year.");
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        getSetupRequestError(error, "Failed to activate academic year."),
      );
    } finally {
      setActivatingYearId(null);
    }
  }

  async function fetchAcademicYears() {
    try {
      const response = await fetch("/api/academic-years", {
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      const data = await readSetupResponse(
        response,
        "Failed to fetch academic years.",
      );
      if (
        !Array.isArray(data) ||
        !data.every(
          (year) =>
            typeof year === "object" &&
            year !== null &&
            "id" in year &&
            typeof year.id === "string" &&
            "name" in year &&
            typeof year.name === "string" &&
            "startDate" in year &&
            typeof year.startDate === "string" &&
            "endDate" in year &&
            typeof year.endDate === "string" &&
            "isActive" in year &&
            typeof year.isActive === "boolean",
        )
      ) {
        throw new Error("The server returned invalid academic year data.");
      }

      setAcademicYears(data);
    } catch (error) {
      setError(getSetupRequestError(error, "Failed to load academic years."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(fetchAcademicYears);
  }, []);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    submissionInProgress.current = true;
    setSaving(true);
    setError("");

    try {
      const startDate = bsToDate(
        Number(startYear),
        Number(startMonth),
        Number(startDay)
      );

      const endDate = bsToDate(
        Number(endYear),
        Number(endMonth),
        Number(endDay)
      );

      if (endDate < startDate) {
        throw new Error("End date cannot be before the start date.");
      }

      const response = await fetch("/api/academic-years", {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });

      const data = await readSetupResponse(
        response,
        "Failed to create academic year.",
      );
      if (
        typeof data !== "object" ||
        data === null ||
        !("id" in data) ||
        typeof data.id !== "string"
      ) {
        throw new Error("The server returned an invalid academic year.");
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setError(
        getSetupRequestError(error, "Failed to create academic year."),
      );
    } finally {
      submissionInProgress.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Academic Years</h1>
          <p className="text-sm text-gray-500">
            Manage your school&apos;s academic years.
          </p>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => setShowForm((current) => !current)}
          className="rounded-lg bg-(--primary) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {showForm ? "Cancel" : "Add Academic Year"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-(--border) bg-white p-6 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold">New Academic Year</h2>
            <p className="text-sm text-gray-500">
              Enter the academic year using Nepali dates.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Academic Year
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              placeholder="2083"
              required
              className="w-full rounded-lg border border-(--border) px-3 py-2 outline-none"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                Start Date (BS)
              </label>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Year"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />

                <input
                  type="number"
                  placeholder="Month"
                  min="1"
                  max="12"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />

                <input
                  type="number"
                  placeholder="Day"
                  min="1"
                  max="32"
                  value={startDay}
                  onChange={(e) => setStartDay(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                End Date (BS)
              </label>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Year"
                  value={endYear}
                  onChange={(e) => setEndYear(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />

                <input
                  type="number"
                  placeholder="Month"
                  min="1"
                  max="12"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />

                <input
                  type="number"
                  placeholder="Day"
                  min="1"
                  max="32"
                  value={endDay}
                  onChange={(e) => setEndDay(e.target.value)}
                  disabled={saving}
                  required
                  className="rounded-lg border border-(--border) px-3 py-2"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-(--primary) px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create Academic Year"}
          </button>
        </form>
      )}

      <div className="rounded-xl border border-(--border) bg-white shadow-sm">
        <div className="border-b border-(--border) p-5">
          <h2 className="font-semibold">Academic Years</h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">
            Loading academic years...
          </div>
        ) : academicYears.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No academic years have been configured yet.
          </div>
        ) : (
          <div className="divide-y divide-(--border)">
            {academicYears.map((year) => (
              <div
                key={year.id}
                className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <h3 className="font-medium">{year.name}</h3>

                  <p className="text-sm text-gray-500">
                    {formatBS(new Date(year.startDate))} —{" "}
                    {formatBS(new Date(year.endDate))}
                  </p>
                </div>

                <div className="flex items-center gap-3">
  <span
    className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
      year.isActive
        ? "bg-green-100 text-green-700"
        : "bg-gray-100 text-gray-600"
    }`}
  >
    {year.isActive ? "Active" : "Inactive"}
  </span>

  {!year.isActive && (
    <button
      type="button"
      disabled={activatingYearId !== null}
      onClick={() => activateAcademicYear(year.id)}
      className="rounded-lg border border-(--border) px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
    >
      {activatingYearId === year.id ? "Activating..." : "Activate"}
    </button>
  )}
</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}