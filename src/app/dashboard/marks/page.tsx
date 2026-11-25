"use client";

import { useEffect, useState } from "react";

type AcademicYear = {
  id: string;
  name: string;
  isActive: boolean;
};

type AcademicTerm = {
  id: string;
  name: string;
  order: number;
};

type SchoolClass = {
  id: string;
  name: string;
  order: number;
};

type ExamSubject = {
  id: string;
  subject: {
    id: string;
    name: string;
    code: string | null;
  };
  exam: {
    id: string;
    name: string;
  };
};

type StudentMark = {
  studentId: string;
  admissionNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  rollNumber: number | null;
  theoryMarks: string;
  practicalMarks: string;
  markId: string | null;
};

type MarksResponse = {
  examSubject: {
    id: string;
    subject: {
      id: string;
      name: string;
      code: string | null;
    };
    theoryFullMarks: string;
    practicalFullMarks: string;
    exam: {
      id: string;
      name: string;
      isLocked: boolean;
    };
  };
  students: StudentMark[];
};

export default function MarksPage() {
  const [academicYears, setAcademicYears] = useState<
    AcademicYear[]
  >([]);

  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [examSubjects, setExamSubjects] = useState<
    ExamSubject[]
  >([]);

  const [marksData, setMarksData] =
    useState<MarksResponse | null>(null);

  const [academicYearId, setAcademicYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [examSubjectId, setExamSubjectId] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function fetchAcademicYears() {
    const response = await fetch("/api/academic-years");

    if (!response.ok) {
      throw new Error("Failed to fetch academic years.");
    }

    const data = await response.json();

    setAcademicYears(data);

    const activeYear = data.find(
      (year: AcademicYear) => year.isActive
    );

    if (activeYear) {
      setAcademicYearId(activeYear.id);
    } else if (data.length > 0) {
      setAcademicYearId(data[0].id);
    }
  }

  async function fetchClasses() {
    const response = await fetch("/api/classes");

    if (!response.ok) {
      throw new Error("Failed to fetch classes.");
    }

    const data = await response.json();

    setClasses(data);

    if (data.length > 0) {
      setClassId(data[0].id);
    }
  }

  async function fetchTerms(yearId: string) {
    if (!yearId) {
      setTerms([]);
      setTermId("");
      return;
    }

    try {
      setLoadingTerms(true);

      const response = await fetch(
        `/api/academic-terms?academicYearId=${yearId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch academic terms.");
      }

      const data = await response.json();

      setTerms(data);

      if (data.length > 0) {
        setTermId(data[0].id);
      } else {
        setTermId("");
      }
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to fetch academic terms."
      );
    } finally {
      setLoadingTerms(false);
    }
  }

  async function fetchExamSubjects(
    selectedTermId: string,
    selectedClassId: string
  ) {
    if (!selectedTermId || !selectedClassId) {
      setExamSubjects([]);
      setExamSubjectId("");
      return;
    }

    try {
      setLoadingExams(true);

      const response = await fetch(
        `/api/exams?termId=${selectedTermId}&classId=${selectedClassId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch exams.");
      }

      const exams = await response.json();

      const subjects: ExamSubject[] = [];

      for (const exam of exams) {
        for (const examSubject of exam.subjects) {
          subjects.push({
            id: examSubject.id,
            subject: examSubject.subject,
            exam: {
              id: exam.id,
              name: exam.name,
            },
          });
        }
      }

      setExamSubjects(subjects);

      if (subjects.length > 0) {
        setLoadingMarks(true);
        setError("");
        setSuccess("");
        setExamSubjectId(subjects[0].id);
      } else {
        setLoadingMarks(false);
        setExamSubjectId("");
      }
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to fetch exams."
      );
    } finally {
      setLoadingExams(false);
    }
  }

  async function fetchMarks(selectedExamSubjectId: string) {
    if (!selectedExamSubjectId) {
      setMarksData(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/marks?examSubjectId=${selectedExamSubjectId}`
      );

      if (!response.ok) {
        const data = await response.json();

        throw new Error(
          data.error || "Failed to fetch marks."
        );
      }

      const data = await response.json();

      setMarksData(data);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to fetch marks."
      );

      setMarksData(null);
    } finally {
      setLoadingMarks(false);
    }
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        await Promise.all([
          fetchAcademicYears(),
          fetchClasses(),
        ]);
        setError("");
      } catch (error) {
        console.error(error);

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load marks data."
        );
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();
  }, []);

  useEffect(() => {
    if (academicYearId) {
      // The loader applies state only after the request completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchTerms(academicYearId);
    }
  }, [academicYearId]);

  useEffect(() => {
    if (termId && classId) {
      // The loader applies state only after the request completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchExamSubjects(termId, classId);
    }
  }, [termId, classId]);

  useEffect(() => {
    if (examSubjectId) {
      // The loader applies state only after the request completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMarks(examSubjectId);
    }
  }, [examSubjectId]);

  function updateStudentMark(
    studentId: string,
    field: "theoryMarks" | "practicalMarks",
    value: string
  ) {
    setMarksData((current) => {
      if (!current || current.examSubject.exam.isLocked) {
        return current;
      }

      return {
        ...current,
        students: current.students.map((student) =>
          student.studentId === studentId
            ? {
                ...student,
                [field]: value,
              }
            : student
        ),
      };
    });
  }

  function validateStudentMarks(student: StudentMark) {
    if (!marksData) {
      return "Marks data is unavailable.";
    }

    if (
      student.theoryMarks.trim() === "" ||
      student.practicalMarks.trim() === ""
    ) {
      return "Enter theory and practical marks. Enter 0 explicitly when applicable.";
    }

    const theoryMarks = Number(student.theoryMarks);
    const practicalMarks = Number(student.practicalMarks);

    if (
      !Number.isFinite(theoryMarks) ||
      !Number.isFinite(practicalMarks)
    ) {
      return "Marks must be valid numbers.";
    }

    if (theoryMarks < 0) {
      return "Theory marks cannot be negative.";
    }

    if (practicalMarks < 0) {
      return "Practical marks cannot be negative.";
    }

    const theoryFullMarks = Number(
      marksData.examSubject.theoryFullMarks
    );

    const practicalFullMarks = Number(
      marksData.examSubject.practicalFullMarks
    );

    if (theoryMarks > theoryFullMarks) {
      return `Theory marks cannot exceed ${theoryFullMarks}.`;
    }

    if (practicalMarks > practicalFullMarks) {
      return `Practical marks cannot exceed ${practicalFullMarks}.`;
    }

    return null;
  }

  async function handleSaveAll() {
    if (!marksData || marksData.examSubject.exam.isLocked) {
      return;
    }

    try {
      setSavingAll(true);
      setError("");
      setSuccess("");

      for (const student of marksData.students) {
        const validationError =
          validateStudentMarks(student);

        if (validationError) {
          throw new Error(
            `${student.firstName} ${student.lastName}: ${validationError}`
          );
        }
      }

      for (const student of marksData.students) {
        const response = await fetch("/api/marks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            examSubjectId: marksData.examSubject.id,
            studentId: student.studentId,
            theoryMarks: Number(student.theoryMarks),
            practicalMarks: Number(student.practicalMarks),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Failed to save marks."
          );
        }
      }

      setSuccess(
        `Marks saved successfully for ${marksData.students.length} students.`
      );

      await fetchMarks(examSubjectId);
    } catch (error) {
      console.error(error);

      setError(
        error instanceof Error
          ? error.message
          : "Failed to save marks."
      );
    } finally {
      setSavingAll(false);
    }
  }

  const totalFullMarks = marksData
    ? Number(marksData.examSubject.theoryFullMarks) +
      Number(marksData.examSubject.practicalFullMarks)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Marks Entry
        </h1>

        <p className="text-sm text-gray-500">
          Enter theory and practical marks for students.
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

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">
          Select Examination
        </h2>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Academic Year
            </label>

            <select
              value={academicYearId}
              onChange={(e) =>
                setAcademicYearId(e.target.value)
              }
              disabled={loading}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none"
            >
              <option value="">
                Select academic year
              </option>

              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isActive ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Term
            </label>

            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              disabled={
                loadingTerms || !academicYearId
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none"
            >
              <option value="">
                Select term
              </option>

              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Class
            </label>

            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none"
            >
              <option value="">
                Select class
              </option>

              {classes.map((schoolClass) => (
                <option
                  key={schoolClass.id}
                  value={schoolClass.id}
                >
                  {schoolClass.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Exam / Subject
            </label>

            <select
              value={examSubjectId}
               onChange={(e) => {
                 setLoadingMarks(Boolean(e.target.value));
                 setError("");
                 setSuccess("");
                 setExamSubjectId(e.target.value);
               }}
              disabled={
                loadingExams ||
                !termId ||
                !classId
              }
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 outline-none"
            >
              <option value="">
                Select exam subject
              </option>

              {examSubjects.map((examSubject) => (
                <option
                  key={examSubject.id}
                  value={examSubject.id}
                >
                  {examSubject.exam.name} —{" "}
                  {examSubject.subject.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loadingMarks ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Loading students and marks...
        </div>
      ) : marksData ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {marksData.examSubject.exam.name}
                </h2>

                <p className="text-sm text-gray-500">
                  {marksData.examSubject.subject.name}
                </p>
              </div>

              <div className="text-sm text-gray-500">
                Theory:{" "}
                {marksData.examSubject.theoryFullMarks}{" "}
                • Practical:{" "}
                {marksData.examSubject.practicalFullMarks}{" "}
                • Total: {totalFullMarks}
              </div>
            </div>
          </div>

          {marksData.students.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No students are enrolled in this class
              for the selected academic year.
            </div>
          ) : (
            <>
              {marksData.examSubject.exam.isLocked && (
                <div
                  role="status"
                  className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"
                >
                  This exam is published and locked. Its marks are read-only.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-212.5 text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-4 py-3">
                        Roll
                      </th>

                      <th className="px-4 py-3">
                        Admission No.
                      </th>

                      <th className="px-4 py-3">
                        Student
                      </th>

                      <th className="px-4 py-3">
                        Theory /{" "}
                        {
                          marksData.examSubject
                            .theoryFullMarks
                        }
                      </th>

                      <th className="px-4 py-3">
                        Practical /{" "}
                        {
                          marksData.examSubject
                            .practicalFullMarks
                        }
                      </th>

                      <th className="px-4 py-3">
                        Total / {totalFullMarks}
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {marksData.students.map((student) => {
                      const hasCompleteMarks =
                        student.theoryMarks.trim() !== "" &&
                        student.practicalMarks.trim() !== "";
                      const total = hasCompleteMarks
                        ? Number(student.theoryMarks) +
                          Number(student.practicalMarks)
                        : null;

                      return (
                        <tr
                          key={student.studentId}
                          className="border-b border-gray-100"
                        >
                          <td className="px-4 py-3">
                            {student.rollNumber ?? "-"}
                          </td>

                          <td className="px-4 py-3">
                            {student.admissionNumber}
                          </td>

                          <td className="px-4 py-3 font-medium">
                            {student.firstName}{" "}
                            {student.middleName
                              ? `${student.middleName} `
                              : ""}
                            {student.lastName}
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={Number(
                                marksData.examSubject
                                  .theoryFullMarks
                              )}
                              value={student.theoryMarks}
                              disabled={marksData.examSubject.exam.isLocked}
                              onChange={(e) =>
                                updateStudentMark(
                                  student.studentId,
                                  "theoryMarks",
                                  e.target.value
                                )
                              }
                              className="w-28 rounded-lg border border-gray-200 px-3 py-2 outline-none"
                            />
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={Number(
                                marksData.examSubject
                                  .practicalFullMarks
                              )}
                              value={
                                student.practicalMarks
                              }
                              disabled={marksData.examSubject.exam.isLocked}
                              onChange={(e) =>
                                updateStudentMark(
                                  student.studentId,
                                  "practicalMarks",
                                  e.target.value
                                )
                              }
                              className="w-28 rounded-lg border border-gray-200 px-3 py-2 outline-none"
                            />
                          </td>

                          <td className="px-4 py-3 text-base font-semibold">
                            {total ?? "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end border-t border-gray-200 p-5">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={
                    savingAll || marksData.examSubject.exam.isLocked
                  }
                  className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingAll
                    ? "Saving All Marks..."
                    : "Save All Marks"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
          Select an exam and subject to begin entering
          marks.
        </div>
      )}
    </div>
  );
}