import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { getVerifiedTestTarget } from "./billing/helpers/database.js";

async function publishedExamAndGradeScaleSnapshot(prisma) {
  const [exams, gradeScales] = await Promise.all([
    prisma.exam.findMany({
      where: { isPublished: true },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        isPublished: true,
        isLocked: true,
        gradeScaleId: true,
        updatedAt: true,
        subjects: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            theoryFullMarks: true,
            practicalFullMarks: true,
            marks: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                studentId: true,
                theoryMarks: true,
                practicalMarks: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    }),
    prisma.gradeScale.findMany({
      orderBy: { id: "asc" },
      include: {
        entries: { orderBy: { id: "asc" } },
      },
    }),
  ]);
  return createHash("sha256")
    .update(JSON.stringify({ exams, gradeScales }))
    .digest("hex");
}

function jsonRequest(url, body, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function gradeForAverageSubjectPercentage(subjects, entries) {
  const average =
    subjects.reduce((total, subjectResult) => total + subjectResult.percentage, 0) /
    subjects.length;
  return entries.find(
    (entry) =>
      average >= Number(entry.minPercentage) &&
      average < Number(entry.maxPercentage),
  )?.grade;
}

test("exam protection and mark publication work on QA database", async () => {
  const target = getVerifiedTestTarget();
  const primarySchoolId = "cmwtatkm10000row42cgw4b64";
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousSchoolId = process.env.SCHOOL_ID;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DATABASE_URL = target.connectionString;
  process.env.SCHOOL_ID = primarySchoolId;
  process.env.NODE_ENV = "test";
  let appPrisma;
  let fixture;
  let protectedRecordsBefore;

  try {
    const [
      { prisma },
      examsApi,
      examApi,
      publishApi,
      marksApi,
      resultsApi,
      gradeScaleApi,
    ] =
      await Promise.all([
        import("../src/lib/prisma.ts"),
        import("../src/app/api/exams/route.ts"),
        import("../src/app/api/exams/[id]/route.ts"),
        import("../src/app/api/exams/[id]/publish/route.ts"),
        import("../src/app/api/marks/route.ts"),
        import("../src/app/api/results/route.ts"),
        import("../src/app/api/grade-scales/[id]/route.ts"),
      ]);
    appPrisma = prisma;
    const [databaseInfo] = await appPrisma.$queryRaw`
      SELECT current_database() AS database
    `;
    assert.equal(databaseInfo.database, target.database);
    protectedRecordsBefore =
      await publishedExamAndGradeScaleSnapshot(appPrisma);

    const marker = `ACADEMIC_RISK_QA_${randomUUID()}`;
    const school = await appPrisma.school.findUniqueOrThrow({
      where: { id: primarySchoolId },
    });
    const academicYear =
      await appPrisma.academicYear.findFirstOrThrow({
        where: { schoolId: school.id, isActive: true },
      });
    fixture = {
      termIds: [],
      classId: null,
      subjectIds: [],
      classSubjectIds: [],
      examId: null,
      secondExamId: null,
      emptyExamId: null,
      studentIds: [],
    };
    const maxTermOrder = await appPrisma.academicTerm.aggregate({
      where: { academicYearId: academicYear.id },
      _max: { order: true },
    });
    const term = await appPrisma.academicTerm.create({
      data: {
        academicYearId: academicYear.id,
        name: marker,
        order: (maxTermOrder._max.order ?? 0) + 1,
      },
    });
    fixture.termIds.push(term.id);
    const secondTerm = await appPrisma.academicTerm.create({
      data: {
        academicYearId: academicYear.id,
        name: `${marker} Later Term`,
        order: (maxTermOrder._max.order ?? 0) + 2,
      },
    });
    fixture.termIds.push(secondTerm.id);
    const classRecord = await appPrisma.class.create({
      data: { schoolId: school.id, name: marker, order: 1 },
    });
    fixture.classId = classRecord.id;
    const subject = await appPrisma.subject.create({
      data: { name: marker },
    });
    fixture.subjectIds.push(subject.id);
    const practicalSubject = await appPrisma.subject.create({
      data: { name: `${marker} Practical` },
    });
    fixture.subjectIds.push(practicalSubject.id);
    const unconfiguredSubject = await appPrisma.subject.create({
      data: { name: `${marker} Unconfigured` },
    });
    fixture.subjectIds.push(unconfiguredSubject.id);
    const classSubjects = await appPrisma.classSubject.createMany({
      data: [subject, practicalSubject].map((item) => ({
        classId: classRecord.id,
        subjectId: item.id,
        academicYearId: academicYear.id,
      })),
    });
    assert.equal(classSubjects.count, 2);
    fixture.classSubjectIds.push(
      ...[subject.id, practicalSubject.id],
    );
    const students = [];
    for (const number of [1, 2]) {
      const student = await appPrisma.student.create({
        data: {
          schoolId: school.id,
          admissionNumber: `${marker}_${number}`,
          firstName: `${marker} ${number}`,
        },
      });
      students.push(student);
      fixture.studentIds.push(student.id);
    }
    await appPrisma.enrollment.createMany({
      data: students.map((student, index) => ({
        studentId: student.id,
        academicYearId: academicYear.id,
        classId: classRecord.id,
        rollNumber: index + 1,
      })),
    });
    const examPayload = {
      termId: term.id,
      classId: classRecord.id,
      name: marker,
      startDate: "2026-01-05",
      endDate: "2026-01-30",
      subjects: [
        {
          subjectId: subject.id,
          theoryFullMarks: 200,
          practicalFullMarks: 0,
        },
        {
          subjectId: practicalSubject.id,
          theoryFullMarks: 40,
          practicalFullMarks: 10,
        },
      ],
    };
    const examCountBeforeInvalidRequests = await appPrisma.exam.count({
      where: { termId: term.id, classId: classRecord.id },
    });
    const invalidExamResponses = await Promise.all([
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid zero`,
          subjects: [{
            subjectId: subject.id,
            theoryFullMarks: 0,
            practicalFullMarks: 0,
          }],
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid negative`,
          subjects: [{
            subjectId: subject.id,
            theoryFullMarks: -1,
            practicalFullMarks: 0,
          }],
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid non-finite`,
          subjects: [{
            subjectId: subject.id,
            theoryFullMarks: "NaN",
            practicalFullMarks: 0,
          }],
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid duplicate`,
          subjects: [
            examPayload.subjects[0],
            examPayload.subjects[0],
          ],
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid unconfigured`,
          subjects: [{
            subjectId: unconfiguredSubject.id,
            theoryFullMarks: 100,
            practicalFullMarks: 0,
          }],
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} invalid date`,
          startDate: "not-a-date",
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} reversed dates`,
          startDate: "2026-02-01",
          endDate: "2026-01-01",
        }),
      ),
    ]);
    assert.deepEqual(
      invalidExamResponses.map((response) => response.status),
      [400, 400, 400, 400, 400, 400, 400],
    );
    assert.equal(
      await appPrisma.exam.count({
        where: { termId: term.id, classId: classRecord.id },
      }),
      examCountBeforeInvalidRequests,
      "rejected exam creation must not persist a partial exam",
    );

    const createdResponse = await examsApi.POST(
      jsonRequest("http://qa.local/api/exams", examPayload),
    );
    assert.equal(createdResponse.status, 201);
    const exam = await createdResponse.json();
    fixture.examId = exam.id;
    assert.equal(exam.subjects.length, 2);
    assert.equal(Number(exam.subjects[0].theoryFullMarks), 200);
    const examSubjectById = new Map(
      exam.subjects.map((item) => [item.subjectId, item]),
    );
    const examSubject = examSubjectById.get(subject.id);
    const practicalExamSubject = examSubjectById.get(practicalSubject.id);
    assert.ok(examSubject);
    assert.ok(practicalExamSubject);

    const duplicateCreateResponse = await examsApi.POST(
      jsonRequest("http://qa.local/api/exams", examPayload),
    );
    assert.equal(duplicateCreateResponse.status, 409);

    const foreignSchool = await appPrisma.school.findUniqueOrThrow({
      where: { id: "cmwtawdr10000scw4moape0b6" },
      include: { academicYears: { take: 1 }, classes: { take: 1 }, students: { take: 1 } },
    });
    const foreignYear = foreignSchool.academicYears[0];
    const foreignClass = foreignSchool.classes[0];
    const foreignStudent = foreignSchool.students[0];
    assert.ok(foreignYear && foreignClass && foreignStudent);
    const foreignTerm = await appPrisma.academicTerm.findFirstOrThrow({
      where: { academicYearId: foreignYear.id },
    });
    const anotherPrimaryYear = await appPrisma.academicYear.findFirst({
      where: {
        schoolId: primarySchoolId,
        id: { not: academicYear.id },
      },
    });
    const anotherPrimaryTerm = anotherPrimaryYear
      ? await appPrisma.academicTerm.findFirst({
          where: { academicYearId: anotherPrimaryYear.id },
        })
      : null;
    const schoolRelationshipFailures = await Promise.all([
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} foreign term`,
          termId: foreignTerm.id,
        }),
      ),
      examsApi.POST(
        jsonRequest("http://qa.local/api/exams", {
          ...examPayload,
          name: `${marker} foreign class`,
          classId: foreignClass.id,
        }),
      ),
      ...(anotherPrimaryTerm
        ? [
            examsApi.POST(
              jsonRequest("http://qa.local/api/exams", {
                ...examPayload,
                name: `${marker} wrong primary year`,
                termId: anotherPrimaryTerm.id,
              }),
            ),
          ]
        : []),
    ]);
    assert.deepEqual(
      schoolRelationshipFailures.map((response) => response.status),
      anotherPrimaryTerm ? [404, 404, 400] : [404, 404],
    );

    const updatedExamResponse = await examApi.PATCH(
      jsonRequest(
        `http://qa.local/api/exams/${exam.id}`,
        { name: `${marker} Edited`, startDate: "2026-01-06", endDate: "2026-01-29" },
        "PATCH",
      ),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(updatedExamResponse.status, 200);
    const updatedExam = await updatedExamResponse.json();
    assert.equal(updatedExam.name, `${marker} Edited`);
    const invalidUpdateResponse = await examApi.PATCH(
      jsonRequest(
        `http://qa.local/api/exams/${exam.id}`,
        { startDate: "2026-02-01", endDate: "2026-01-01" },
        "PATCH",
      ),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(invalidUpdateResponse.status, 400);
    assert.equal(
      (await appPrisma.exam.findUniqueOrThrow({ where: { id: exam.id } })).name,
      `${marker} Edited`,
      "rejected exam updates must leave persisted exam data unchanged",
    );

    const emptyExamResponse = await examsApi.POST(
      jsonRequest("http://qa.local/api/exams", {
        ...examPayload,
        name: `${marker} Empty`,
        subjects: [examPayload.subjects[0]],
      }),
    );
    assert.equal(emptyExamResponse.status, 201);
    fixture.emptyExamId = (await emptyExamResponse.json()).id;
    const emptyExamDeleteResponse = await examApi.DELETE(
      new Request(`http://qa.local/api/exams/${fixture.emptyExamId}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: fixture.emptyExamId }) },
    );
    assert.equal(emptyExamDeleteResponse.status, 200);
    assert.equal(
      await appPrisma.exam.count({ where: { id: fixture.emptyExamId } }),
      0,
    );

    const gradeScale = await appPrisma.gradeScale.findFirstOrThrow({
      where: { isDefault: true },
      include: { entries: true },
    });
    const examReadResponse = await examApi.GET(
      new Request(`http://qa.local/api/exams/${exam.id}`),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(examReadResponse.status, 200);
    const examRead = await examReadResponse.json();
    assert.equal(examRead.term.academicYear.schoolId, primarySchoolId);
    assert.equal(examRead.subjects.length, 2);
    const initialMarksRead = await marksApi.GET(
      new Request(`http://qa.local/api/marks?examSubjectId=${examSubject.id}`),
    );
    assert.equal(initialMarksRead.status, 200);
    const initialMarks = await initialMarksRead.json();
    assert.equal(initialMarks.students.length, 2);
    assert.ok(initialMarks.students.every((student) => student.markId === null));
    const unpublishedResultsResponse = await resultsApi.GET(
      new Request(`http://qa.local/api/results?examId=${exam.id}`),
    );
    assert.equal(unpublishedResultsResponse.status, 409);

    const missingMarksResponse = await publishApi.POST(
      new Request(`http://qa.local/api/exams/${exam.id}/publish`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    const missingMarks = await missingMarksResponse.json();
    assert.equal(missingMarksResponse.status, 409);
    assert.match(missingMarks.error, /4 student-subject mark entries are missing/);

    const markRequest = (payload) =>
      jsonRequest("http://qa.local/api/marks", payload);
    const omittedMarkResponse = await marksApi.POST(
      markRequest({
          examSubjectId: examSubject.id,
          studentId: students[0].id,
        }),
    );
    assert.equal(omittedMarkResponse.status, 400);
    assert.equal(
      await appPrisma.mark.count({
        where: {
          examSubjectId: examSubject.id,
          studentId: students[0].id,
        },
      }),
      0,
    );

    const blankMarkResponse = await marksApi.POST(
      markRequest({
          examSubjectId: examSubject.id,
          studentId: students[0].id,
          theoryMarks: "",
          practicalMarks: 0,
        }),
    );
    assert.equal(blankMarkResponse.status, 400);

    const foreignStudentMarkResponse = await marksApi.POST(
      markRequest({
        examSubjectId: examSubject.id,
        studentId: foreignStudent.id,
        theoryMarks: 0,
        practicalMarks: 0,
      }),
    );
    assert.equal(foreignStudentMarkResponse.status, 400);

    const invalidMarksResponses = await Promise.all([
      marksApi.POST(markRequest({
        examSubjectId: examSubject.id,
        studentId: students[0].id,
        theoryMarks: 201,
        practicalMarks: 0,
      })),
      marksApi.POST(markRequest({
        examSubjectId: practicalExamSubject.id,
        studentId: students[0].id,
        theoryMarks: 41,
        practicalMarks: 0,
      })),
      marksApi.POST(markRequest({
        examSubjectId: practicalExamSubject.id,
        studentId: students[0].id,
        theoryMarks: 40,
        practicalMarks: 11,
      })),
      marksApi.POST(markRequest({
        examSubjectId: examSubject.id,
        studentId: students[0].id,
        theoryMarks: -1,
        practicalMarks: 0,
      })),
      marksApi.POST(markRequest({
        examSubjectId: examSubject.id,
        studentId: students[0].id,
        theoryMarks: "NaN",
        practicalMarks: 0,
      })),
    ]);
    assert.deepEqual(
      invalidMarksResponses.map((response) => response.status),
      [400, 400, 400, 400, 400],
    );
    assert.equal(
      await appPrisma.mark.count({
        where: { examSubjectId: { in: [examSubject.id, practicalExamSubject.id] } },
      }),
      0,
      "rejected marks must not create records",
    );

    const firstMarkResponse = await marksApi.POST(
      markRequest({
          examSubjectId: examSubject.id,
          studentId: students[0].id,
          theoryMarks: 100,
          practicalMarks: 0,
        }),
    );
    assert.equal(firstMarkResponse.status, 200);
    const editedMarkResponse = await marksApi.POST(
      markRequest({
        examSubjectId: examSubject.id,
        studentId: students[0].id,
        theoryMarks: 179.99,
        practicalMarks: 0,
      }),
    );
    assert.equal(editedMarkResponse.status, 200);
    assert.equal(
      await appPrisma.mark.count({
        where: {
          examSubjectId: examSubject.id,
          studentId: students[0].id,
        },
      }),
      1,
      "editing marks must update the unique student-subject record",
    );

    const missingAfterPartialMark = await publishApi.POST(
      new Request(`http://qa.local/api/exams/${exam.id}/publish`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(missingAfterPartialMark.status, 409);
    assert.match(
      (await missingAfterPartialMark.json()).error,
      /3 student-subject mark entries are missing/,
    );

    const blockedDeleteResponse = await examApi.DELETE(
      new Request(`http://qa.local/api/exams/${exam.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(blockedDeleteResponse.status, 409);

    const markWrites = await Promise.all([
      marksApi.POST(
        markRequest({
          examSubjectId: examSubject.id,
          studentId: students[1].id,
          theoryMarks: 0,
          practicalMarks: 0,
        }),
      ),
      marksApi.POST(
        markRequest({
          examSubjectId: practicalExamSubject.id,
          studentId: students[0].id,
          theoryMarks: 16,
          practicalMarks: 4,
        }),
      ),
      marksApi.POST(
        markRequest({
          examSubjectId: practicalExamSubject.id,
          studentId: students[1].id,
          theoryMarks: 0,
          practicalMarks: 0,
        }),
      ),
    ]);
    assert.deepEqual(markWrites.map((response) => response.status), [200, 200, 200]);
    const marksReadResponse = await marksApi.GET(
      new Request(`http://qa.local/api/marks?examSubjectId=${practicalExamSubject.id}`),
    );
    assert.equal(marksReadResponse.status, 200);
    const marksRead = await marksReadResponse.json();
    assert.equal(marksRead.examSubject.theoryFullMarks, "40");
    assert.equal(marksRead.examSubject.practicalFullMarks, "10");
    assert.equal(marksRead.students.length, 2);
    assert.ok(marksRead.students.every((student) => student.markId));

    const publishResponse = await publishApi.POST(
      new Request(`http://qa.local/api/exams/${exam.id}/publish`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(publishResponse.status, 200);
    const published = await appPrisma.exam.findUniqueOrThrow({
      where: { id: exam.id },
    });
    assert.equal(published.isPublished, true);
    assert.equal(published.isLocked, true);
    assert.equal(published.gradeScaleId, gradeScale.id);
    const repeatedPublishResponse = await publishApi.POST(
      new Request(`http://qa.local/api/exams/${exam.id}/publish`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(repeatedPublishResponse.status, 200);

    const resultsResponse = await resultsApi.GET(
      new Request(
        `http://qa.local/api/results?examId=${exam.id}&gradeScaleId=${gradeScale.id}`,
      ),
    );
    assert.equal(resultsResponse.status, 200);
    const results = await resultsResponse.json();
    assert.equal(results.results.length, 2);
    const weightedResult = results.results.find(
      (result) => result.studentId === students[0].id,
    );
    const zeroMarkResult = results.results.find(
      (result) => result.studentId === students[1].id,
    );
    assert.equal(zeroMarkResult.subjects[0].grade, "NG");
    assert.equal(zeroMarkResult.subjects[0].performanceLevel, "Not Graded");
    assert.equal(zeroMarkResult.grade, "NG");
    assert.equal(zeroMarkResult.gpa, 0);
    const rawThresholdSubject = weightedResult.subjects.find(
      (item) => item.subjectId === subject.id,
    );
    const practicalSubjectResult = weightedResult.subjects.find(
      (item) => item.subjectId === practicalSubject.id,
    );
    assert.equal(rawThresholdSubject.percentage, 89.995);
    assert.equal(rawThresholdSubject.grade, "A");
    assert.equal(practicalSubjectResult.percentage, 40);
    assert.equal(practicalSubjectResult.grade, "C");
    assert.equal(weightedResult.totalObtained, 199.99);
    assert.equal(weightedResult.totalFullMarks, 250);
    assert.ok(Math.abs(weightedResult.overallPercentage - 79.996) < 1e-10);
    assert.equal(weightedResult.grade, "B+");
    assert.equal(weightedResult.gpa, 2.8);
    assert.equal(weightedResult.position, 1);
    assert.equal(zeroMarkResult.position, 2);
    assert.equal(
      gradeForAverageSubjectPercentage(
        weightedResult.subjects,
        gradeScale.entries,
      ),
      "B",
      "the weighted aggregate grade differs from the unweighted average of subject percentages",
    );

    const laterTermExamResponse = await examsApi.POST(
      jsonRequest("http://qa.local/api/exams", {
        ...examPayload,
        termId: secondTerm.id,
        name: `${marker} Later Term Exam`,
        subjects: [{
          subjectId: subject.id,
          theoryFullMarks: 100,
          practicalFullMarks: 0,
        }],
      }),
    );
    assert.equal(laterTermExamResponse.status, 201);
    const laterTermExam = await laterTermExamResponse.json();
    fixture.secondExamId = laterTermExam.id;
    assert.equal(laterTermExam.term.name, secondTerm.name);
    assert.equal(laterTermExam.subjects.length, 1);
    const laterTermExamSubjectId = laterTermExam.subjects[0].id;
    const laterTermMarkWrites = await Promise.all(
      students.map((student, index) =>
        marksApi.POST(
          markRequest({
            examSubjectId: laterTermExamSubjectId,
            studentId: student.id,
            theoryMarks: index === 0 ? 100 : 40,
            practicalMarks: 0,
          }),
        ),
      ),
    );
    assert.deepEqual(
      laterTermMarkWrites.map((response) => response.status),
      [200, 200],
    );
    const laterTermPublishResponse = await publishApi.POST(
      new Request(
        `http://qa.local/api/exams/${laterTermExam.id}/publish`,
        { method: "POST" },
      ),
      { params: Promise.resolve({ id: laterTermExam.id }) },
    );
    assert.equal(laterTermPublishResponse.status, 200);
    const laterTermResultsResponse = await resultsApi.GET(
      new Request(
        `http://qa.local/api/results?examId=${laterTermExam.id}&gradeScaleId=${gradeScale.id}`,
      ),
    );
    assert.equal(laterTermResultsResponse.status, 200);
    const laterTermResults = await laterTermResultsResponse.json();
    assert.equal(laterTermResults.exam.termName, secondTerm.name);
    assert.equal(laterTermResults.results.length, 2);
    assert.ok(
      laterTermResults.results.every(
        (result) => result.totalFullMarks === 100 && result.subjects.length === 1,
      ),
    );
    const fullMarksResult = laterTermResults.results.find(
      (result) => result.studentId === students[0].id,
    );
    assert.equal(fullMarksResult.totalObtained, 100);
    assert.equal(fullMarksResult.overallPercentage, 100);
    assert.equal(fullMarksResult.grade, "A+");
    assert.equal(fullMarksResult.gpa, 4);
    const firstTermRetest = await resultsApi.GET(
      new Request(
        `http://qa.local/api/results?examId=${exam.id}&gradeScaleId=${gradeScale.id}`,
      ),
    );
    assert.equal(firstTermRetest.status, 200);
    const firstTermRetestBody = await firstTermRetest.json();
    assert.equal(
      firstTermRetestBody.results.find(
        (result) => result.studentId === students[0].id,
      ).totalObtained,
      199.99,
      "marks from a later term must not affect earlier published results",
    );

    const incorrectScaleResponse = await resultsApi.GET(
      new Request(
        `http://qa.local/api/results?examId=${exam.id}&gradeScaleId=not-the-published-scale`,
      ),
    );
    assert.equal(incorrectScaleResponse.status, 409);

    const defaultScalePayload = {
      name: gradeScale.name,
      entries: gradeScale.entries.map((entry) => ({
        minPercentage: Number(entry.minPercentage),
        maxPercentage: Number(entry.maxPercentage),
        grade: entry.grade,
        gradePoint: Number(entry.gradePoint),
      })),
    };
    const protectedScaleUpdate = await gradeScaleApi.PUT(
      jsonRequest(
        `http://qa.local/api/grade-scales/${gradeScale.id}`,
        defaultScalePayload,
        "PUT",
      ),
      { params: Promise.resolve({ id: gradeScale.id }) },
    );
    assert.equal(protectedScaleUpdate.status, 409);
    const protectedScaleDelete = await gradeScaleApi.DELETE(
      new Request(`http://qa.local/api/grade-scales/${gradeScale.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: gradeScale.id }) },
    );
    assert.equal(protectedScaleDelete.status, 409);

    const blockedMarkResponse = await marksApi.POST(
      markRequest({
          examSubjectId: examSubject.id,
          studentId: students[0].id,
          theoryMarks: 90,
          practicalMarks: 0,
        }),
    );
    assert.equal(blockedMarkResponse.status, 409);
    const blockedUpdateResponse = await examApi.PATCH(
      jsonRequest(
        `http://qa.local/api/exams/${exam.id}`,
        { name: `${marker} Changed After Publish` },
        "PATCH",
      ),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(blockedUpdateResponse.status, 409);

    const finalDeleteResponse = await examApi.DELETE(
      new Request(`http://qa.local/api/exams/${exam.id}`, {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: exam.id }) },
    );
    assert.equal(finalDeleteResponse.status, 409);
  } finally {
    if (fixture) {
      const fixtureExamIds = [
        fixture.examId,
        fixture.secondExamId,
        fixture.emptyExamId,
      ].filter(Boolean);
      if (fixtureExamIds.length > 0) {
        await appPrisma.exam.deleteMany({
          where: { id: { in: fixtureExamIds } },
        });
      }
      if (fixture.classId) {
        await appPrisma.classSubject.deleteMany({
          where: {
            classId: fixture.classId,
            subjectId: { in: fixture.subjectIds },
          },
        });
      }
      if (fixture.subjectIds.length > 0) {
        await appPrisma.subject.deleteMany({
          where: { id: { in: fixture.subjectIds } },
        });
      }
      if (fixture.studentIds.length > 0) {
        await appPrisma.enrollment.deleteMany({
          where: { studentId: { in: fixture.studentIds } },
        });
        await appPrisma.student.deleteMany({
          where: { id: { in: fixture.studentIds } },
        });
      }
      if (fixture.termIds.length > 0) {
        await appPrisma.academicTerm.deleteMany({
          where: { id: { in: fixture.termIds } },
        });
      }
      if (fixture.classId) {
        await appPrisma.class.deleteMany({
          where: { id: fixture.classId, schoolId: primarySchoolId },
        });
      }
      assert.equal(
        await appPrisma.exam.count({
          where: {
            id: {
              in: [
                fixture.examId,
                fixture.secondExamId,
                fixture.emptyExamId,
              ].filter(Boolean),
            },
          },
        }),
        0,
        "temporary exam records must be removed",
      );
      assert.equal(
        await appPrisma.student.count({
          where: { id: { in: fixture.studentIds } },
        }),
        0,
        "temporary students must be removed",
      );
      assert.equal(
        await appPrisma.subject.count({
          where: { id: { in: fixture.subjectIds } },
        }),
        0,
        "temporary subjects must be removed",
      );
    }
    if (appPrisma && protectedRecordsBefore) {
      assert.equal(
        await publishedExamAndGradeScaleSnapshot(appPrisma),
        protectedRecordsBefore,
        "pre-existing published exams, marks, and grade-scale records must remain unchanged",
      );
    }
    if (appPrisma) await appPrisma.$disconnect();
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    if (previousSchoolId === undefined) {
      delete process.env.SCHOOL_ID;
    } else {
      process.env.SCHOOL_ID = previousSchoolId;
    }
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});
