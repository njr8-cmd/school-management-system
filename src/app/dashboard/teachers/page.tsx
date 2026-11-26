"use client";

import { useEffect, useState } from "react";
import { BikramDatePicker } from "@inicrea/bikram-sambat-react";
import "@inicrea/bikram-sambat-react/styles.css";
import {
  BS_MONTHS,
  adDateToBSInput,
  bsInputToADDate,
  formatBSDate,
} from "@/lib/nepali-date";

type Teacher = {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  joiningDate: string | null;
  basicSalary: string | null;
};

type SalaryPayment = {
  id: string;
  amount: string | number;
  paymentDate: string;
  createdAt: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recordedBy: { id: string; name: string } | null;
};

type SalaryRecord = {
  id: string;
  month: number;
  year: number;
  salaryAmount: string | number;
  deduction: string | number;
  netAmount: string | number;
  status: "PENDING" | "PARTIAL" | "PAID";
  academicYear: {
    name: string;
  };
  payments: SalaryPayment[];
};

type TeacherProfile = Teacher & {
  salaryRecords: SalaryRecord[];
};

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [basicSalary, setBasicSalary] = useState("");

  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profileId, setProfileId] =
    useState<string | null>(null);
  const [profile, setProfile] =
    useState<TeacherProfile | null>(null);
  const [loadingProfile, setLoadingProfile] =
    useState(false);

  async function fetchTeachers() {
    const response = await fetch("/api/teachers");

    if (!response.ok) {
      throw new Error("Failed to fetch teachers.");
    }

    const data = await response.json();
    setTeachers(data);
  }

  async function openProfile(teacherId: string) {
    if (profileId === teacherId) {
      setProfileId(null);
      setProfile(null);
      return;
    }

    try {
      setLoadingProfile(true);
      setError("");
      setProfileId(teacherId);

      const response = await fetch(
        `/api/teachers/${teacherId}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load teacher profile."
        );
      }

      setProfile(data);
    } catch (error) {
      setProfile(null);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load teacher profile."
      );
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    async function loadTeachers() {
      try {
        setError("");
        await fetchTeachers();
      } catch (error) {
        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load teachers."
        );
      } finally {
        setLoading(false);
      }
    }

    loadTeachers();
  }, []);

  function resetForm() {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setDateOfBirth("");
    setGender("");
    setAddress("");
    setPhone("");
    setEmail("");
    setPosition("");
    setJoiningDate("");
    setBasicSalary("");
    setEditingTeacherId(null);
  }

  function formatDateForInput(date: string | null) {
    return adDateToBSInput(date);
  }

  function handleEdit(teacher: Teacher) {
    setEditingTeacherId(teacher.id);

    setFirstName(teacher.firstName);
    setMiddleName(teacher.middleName || "");
    setLastName(teacher.lastName || "");
    setDateOfBirth(formatDateForInput(teacher.dateOfBirth));
    setGender(teacher.gender || "");
    setAddress(teacher.address || "");
    setPhone(teacher.phone || "");
    setEmail(teacher.email || "");
    setPosition(teacher.position || "");
    setJoiningDate(formatDateForInput(teacher.joiningDate));
    setBasicSalary(teacher.basicSalary || "");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function handleSubmit(
    e: React.SubmitEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const isEditing = editingTeacherId !== null;

      const response = await fetch(
        isEditing
          ? `/api/teachers/${editingTeacherId}`
          : "/api/teachers",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName,
            middleName,
            lastName,
            dateOfBirth: dateOfBirth
              ? bsInputToADDate(dateOfBirth)
              : "",
            gender,
            address,
            phone,
            email,
            position,
            joiningDate: joiningDate
              ? bsInputToADDate(joiningDate)
              : "",
            basicSalary,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            (isEditing
              ? "Failed to update teacher."
              : "Failed to create teacher.")
        );
      }

      if (isEditing) {
        setTeachers((current) =>
          current.map((teacher) =>
            teacher.id === data.id ? data : teacher
          )
        );

        setSuccess("Teacher updated successfully.");
      } else {
        setTeachers((current) => [...current, data]);

        setSuccess("Teacher added successfully.");
      }

      resetForm();
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to save teacher."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(teacher: Teacher) {
    const fullName = [
      teacher.firstName,
      teacher.middleName,
      teacher.lastName,
    ]
      .filter(Boolean)
      .join(" ");

    const confirmed = window.confirm(
      `Are you sure you want to delete ${fullName}?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(teacher.id);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/teachers/${teacher.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to delete teacher."
        );
      }

      setTeachers((current) =>
        current.filter((item) => item.id !== teacher.id)
      );

      if (editingTeacherId === teacher.id) {
        resetForm();
      }

      setSuccess("Teacher deleted successfully.");
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete teacher."
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Teachers</h1>

        <p className="text-sm text-gray-500">
          Manage teacher information and salary details.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {editingTeacherId ? "Edit Teacher" : "Add Teacher"}
          </h2>

          {editingTeacherId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">
              First Name
            </label>

            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Middle Name
            </label>

            <input
              type="text"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Last Name
            </label>

            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Date of Birth
            </label>

            <BikramDatePicker
              value={dateOfBirth}
              onChange={(value) => setDateOfBirth(value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Gender
            </label>

            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none"
            >
              <option value="">Select gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Position
            </label>

            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="e.g. Teacher"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Phone
            </label>

            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Joining Date
            </label>

            <BikramDatePicker
              value={joiningDate}
              onChange={(value) => setJoiningDate(value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Basic Salary
            </label>

            <input
              type="number"
              min="0"
              step="0.01"
              value={basicSalary}
              onChange={(e) => setBasicSalary(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium">
            Address
          </label>

          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 outline-none"
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : editingTeacherId
                ? "Save Changes"
                : "Add Teacher"}
          </button>

          {editingTeacherId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-5">
          <h2 className="font-semibold">Teachers</h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">
            Loading teachers...
          </div>
        ) : teachers.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No teachers have been configured yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {teachers.map((teacher) => {
              const fullName = [
                teacher.firstName,
                teacher.middleName,
                teacher.lastName,
              ]
                .filter(Boolean)
                .join(" ");

              const salaryRecords =
                profileId === teacher.id
                  ? profile?.salaryRecords ?? []
                  : [];

              const paidTotal = salaryRecords.reduce(
                (total, record) =>
                  total +
                  record.payments.reduce(
                    (sum, payment) =>
                      sum + Number(payment.amount),
                    0
                  ),
                0
              );

              const remainingTotal = salaryRecords.reduce(
                (total, record) => {
                  const paid = record.payments.reduce(
                    (sum, payment) =>
                      sum + Number(payment.amount),
                    0
                  );
                  return (
                    total +
                    Math.max(
                      0,
                      Number(record.netAmount) - paid
                    )
                  );
                },
                0
              );

              return (
                <div
                  key={teacher.id}
                  className="p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium">{fullName}</p>

                      <div className="mt-1 space-y-1 text-sm text-gray-500">
                        {teacher.position && (
                          <p>{teacher.position}</p>
                        )}

                        {teacher.phone && (
                          <p>Phone: {teacher.phone}</p>
                        )}

                        {teacher.email && (
                          <p>Email: {teacher.email}</p>
                        )}

                        {teacher.basicSalary && (
                          <p>
                            Basic Salary: Rs.{" "}
                            {Number(
                              teacher.basicSalary
                            ).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void openProfile(teacher.id)}
                        disabled={loadingProfile && profileId === teacher.id}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        {profileId === teacher.id
                          ? "Close Salary History"
                          : "View Salary History"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleEdit(teacher)}
                        disabled={deletingId === teacher.id}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(teacher)}
                        disabled={deletingId === teacher.id}
                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === teacher.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                    </div>
                  </div>

                  {profileId === teacher.id && profile && (
                    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <p className="text-xs text-gray-500">Monthly Records</p>
                          <p className="mt-1 text-xl font-bold text-gray-900">
                            {salaryRecords.length}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <p className="text-xs text-gray-500">Total Paid</p>
                          <p className="mt-1 text-xl font-bold text-green-700">
                            Rs. {paidTotal.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-white p-4">
                          <p className="text-xs text-gray-500">Total Remaining</p>
                          <p className="mt-1 text-xl font-bold text-red-700">
                            Rs. {remainingTotal.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {salaryRecords.length === 0 ? (
                        <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                          No salary records found for this teacher.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {salaryRecords.map((record) => {
                            const unreconciled =
                              record.payments.length === 0 &&
                              record.status !== "PENDING";
                            const paid = record.payments.reduce(
                              (sum, payment) =>
                                sum + Number(payment.amount),
                              0
                            );
                            const remaining = Math.max(
                              0,
                              Number(record.netAmount) - paid
                            );

                            return (
                              <div
                                key={record.id}
                                className="rounded-lg border border-gray-200 bg-white p-4"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div>
                                    <p className="font-semibold text-gray-900">
                                      {BS_MONTHS[record.month - 1] ?? record.month}{" "}
                                      {record.year}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500">
                                      {record.academicYear.name}
                                    </p>
                                    {unreconciled && (
                                      <p className="mt-2 max-w-xl rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                                        Legacy salary status is {record.status.toLowerCase()}, but no payment transactions are recorded. Paid and remaining amounts are unverified; reconcile historical evidence before recording more payments.
                                      </p>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
                                    <p>
                                      <span className="text-gray-500">Gross:</span>{" "}
                                      <strong>Rs. {Number(record.salaryAmount).toLocaleString()}</strong>
                                    </p>
                                    <p>
                                      <span className="text-gray-500">Deduction:</span>{" "}
                                      <strong>Rs. {Number(record.deduction).toLocaleString()}</strong>
                                    </p>
                                    <p>
                                      <span className="text-gray-500">Paid:</span>{" "}
                                      <strong className="text-green-700">Rs. {paid.toLocaleString()}</strong>
                                    </p>
                                    <p>
                                      <span className="text-gray-500">Remaining:</span>{" "}
                                      <strong className="text-red-700">Rs. {remaining.toLocaleString()}</strong>
                                    </p>
                                  </div>
                                </div>

                                {record.payments.length > 0 && (
                                  <div className="mt-3 border-t border-gray-200 pt-3">
                                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                                      Payment History
                                    </p>
                                    <div className="space-y-2">
                                      {record.payments.map((payment) => (
                                        <div
                                          key={payment.id}
                                          className="flex flex-col gap-1 rounded-lg bg-gray-50 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
                                        >
                                          <p className="font-semibold text-green-700">
                                            Rs. {Number(payment.amount).toLocaleString()}
                                          </p>
                                          <p className="text-gray-600">
                                            {formatBSDate(payment.paymentDate)}
                                          </p>
                                          <p className="text-gray-600">
                                            Recorded by {payment.recordedBy?.name ?? "not recorded"}
                                          </p>
                                          <p className="text-gray-600">
                                            Entered {new Date(payment.createdAt).toLocaleString()}
                                          </p>
                                          <p className="text-gray-600">
                                            {payment.method.replace("_", " ")}
                                          </p>
                                          {payment.reference && (
                                            <p className="text-gray-600">
                                              Ref: {payment.reference}
                                            </p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}