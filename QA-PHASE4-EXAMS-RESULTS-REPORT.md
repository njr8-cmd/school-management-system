# Phase 4 Examination, Marks, Results, and Marksheet QA

**Assessment date:** 2026-11-24  
**Status:** Phase 4 verification completed for the scenarios listed below; broader school-use readiness remains partial and Phase 5 is gated on user review.  
**Environment:** Only the existing guarded isolated QA database (`neondb`) and a local app server were used. No production access, reset, reseed, migration, or edits to historical published results or financial records occurred.

## Executive summary

The approved grade boundaries, raw-percentage grading, arithmetic-mean GPA, aggregate overall percentage, configured per-subject full marks, and publication locking behaved as required in focused unit, database-backed, and browser verification.

One low-severity usability defect was found and fixed: the marks page showed enabled inputs and an enabled save button for a published, locked exam. The API rejected those writes with HTTP 409, so historical marks were protected, but the UI did not communicate the locked state. The page now shows a read-only notice and disables mark inputs and saving. Browser verification confirmed the locked state.

No evidence was found that published results can be unpublished. The exam API supports editing only name and dates, rejects edits and deletion of published/locked exams, and exposes no unpublish route. Published exams retain their saved grade-scale ID; attempts to use a different scale or modify the default scale are rejected.

## Scope and implementation map

| Workflow | API / implementation reviewed |
|---|---|
| Exam creation, listing, editing, and deletion | `src/app/api/exams/route.ts`, `src/app/api/exams/[id]/route.ts` |
| Publication and locking | `src/app/api/exams/[id]/publish/route.ts` |
| Marks reading, validation, and saving | `src/app/api/marks/route.ts`, `src/app/dashboard/marks/page.tsx` |
| Grade-scale protection | `src/app/api/grade-scales/[id]/route.ts` |
| Result calculations and publication snapshot | `src/app/api/results/route.ts`, `src/lib/grade-calculation.ts` |
| Browser results and individual marksheets | `src/app/dashboard/results/page.tsx`, `src/app/dashboard/results/report-card/page.tsx` |
| Database relationships | `prisma/schema.prisma` (`Exam`, `ExamSubject`, `Mark`, `Enrollment`, `GradeScale`) |

`ClassSubject` configures subjects for a class and academic year. The current schema has no student-specific subject-selection model; every enrolled student in the exam class is therefore expected to have a mark for every subject configured on that exam. This is an implementation limitation, not a defect under the current data model.

## Verification results

### Unit and regression tests

| Check | Result |
|---|---|
| `node --import tsx --test tests/grade-scale-validation.test.ts tests/grade-calculation.test.ts` | **PASS — 9/9.** All approved grade boundaries, raw-percentage selection, and legacy inclusive-scale behavior passed. |
| `node --import tsx --test tests/school-configuration.test.js tests/teacher-assignment-validation.test.ts` | **PASS — 10/10.** Adjacent single-school and assignment validation regressions passed. |
| Guarded `tests/academic-risk-qa.test.js` | **PASS — 1/1.** Database-backed exam, marks, publication, multi-term results, cleanup, and historical snapshots passed. |
| `npm run lint` | **PASS.** |
| `npm run build -- --webpack` | **PASS.** Production build and its TypeScript stage completed. |
| `npx tsc --noEmit` | **PASS.** Run after the successful build. |

The database test emitted a `pg` overlapping-query deprecation warning from the adapter. It did not fail the test and did not indicate a failed assertion.

### Database-backed exam and results scenarios

The integration test verified the approved exact QA host/database guard before connecting. It created uniquely marked temporary records under the configured primary QA school, then removed and verified cleanup of those records.

**Exam and relationship checks — PASS**

- Valid exam creation with distinct configured maxima (200 theory marks for one subject; 40 theory plus 10 practical for another).
- Successful name/date edit; reversed dates rejected without changing the saved exam.
- Duplicate exam name, zero/negative/non-finite full marks, duplicate subjects, unconfigured subject, invalid/reversed dates, foreign-school term/class, and a class-subject from another academic year were rejected.
- Rejected create requests left the exam count unchanged.
- Deleting a temporary exam with no marks succeeded. Deleting an exam with marks and deleting a published exam returned HTTP 409.

**Marks and publication — PASS**

- GET returned blank values and `markId: null` for students without mark records; those missing values were not treated as zeros.
- Missing, blank, non-finite, negative, over-theory-limit, and over-practical-limit marks were rejected without creating mark rows.
- A billing-school student could not receive a mark for the primary-school exam.
- Re-entering marks updated the unique student-subject record rather than creating a duplicate row.
- Explicit zero marks were accepted and counted as present. Publication failed while any student-subject records were missing and succeeded only after all four expected marks existed.
- A full-mark result of 100/100 was accepted.
- Published marks could not be changed; published exam edits/deletion were blocked. Repeated publication remained safe and retained the pinned grade-scale ID.
- Results requests with a different scale ID were rejected. Updating/deleting the default scale was rejected.
- A second exam in a different term for the same students returned only its own subject and marks; querying the first published exam again produced the original result.

**Calculated examples from the temporary database dataset**

| Student/test case | Subject results | Aggregate | GPA / grade |
|---|---|---|---|
| Weighted example | 179.99/200 = **89.995%**, grade **A**, 3.6 points; and 20/50 = **40%**, grade **C**, 2.0 points | 199.99/250 = **79.996%**, overall grade **B+** | Arithmetic mean `(3.6 + 2.0)/2` = **2.8** |
| Explicit-zero example | Both subjects saved as actual 0/maximum marks | 0 obtained; overall grade **NG** | **0.0** |
| Full-marks example in the second term | 100/100 | **100%**, overall grade **A+** | **4.0** |

The weighted example’s unweighted average of subject percentages is 64.9975%, which would be grade B. The returned overall grade was B+ because it correctly used aggregate obtained marks divided by aggregate full marks, not the average of subject percentages.

The focused unit suite also checked 34.99, 35, 39.99, 40, 89.99, and 90, along with all other approved boundaries. A raw 89.995% subject received grade A without rounding first. Display formatting can round a percentage to two decimals; it does not change grade selection.

### Browser verification

A temporary QA-only account was used to verify authenticated workflows; its record was removed afterward. No login credential is included in this report.

- **Results page:** Selected the existing published 2083 Grade 5 Term 1 QA exam. The page rendered eight students and five subject results per student. The authenticated results API returned the same eight students, the correct exam/class/term/year, and the exam’s saved scale.
- **Example existing result:** Milan Thapa’s result showed 223/450 = 49.56%, grade C, GPA 2.24, position 5. The individual marksheet rendered the configured school name, exam, year, term, class, subject marks, grade, GPA, and position.
- **Published marks UI:** Before the fix, the published exam’s 16 number inputs and Save All button were enabled. After the fix, the browser showed “This exam is published and locked. Its marks are read-only.”; all 16 inputs were disabled and the Save All button was disabled. No existing marks were edited.
- **Authentication:** An unauthenticated request to the protected results page redirected with HTTP 307; an unauthenticated results API request returned HTTP 401.

### Historical data and cleanup

- Before and after the integration run, a fingerprint of all pre-existing published exams, their marks, and all grade scales/entries matched exactly.
- Final guarded QA counts matched the inspected baseline: two school records; the primary school had 2 academic years, 12 classes, 52 students, 8 teachers, 60 exams, 300 exam subjects, and 1,239 marks.
- All temporary Phase 4 classes, terms, subjects, students, and exams were verified absent after cleanup.
- The separate artificial billing-test school remained present. Phase 4 tests did not call financial APIs or write billing, payment, credit, waiver, expense, or salary records. No reset or reseed occurred.
- The temporary browser account was removed by exact ID/email/name/role and verified absent. The local development server was stopped.

## Defect found and fixed

**Severity: Low — confusing UI; server-side data protection remained effective.**

- **Reproduction:** Sign in to the QA app; open Marks; select academic year 2083, Term 1, Grade 5, and the published “2083 Grade 5 Term 1 QA Examination — Computer Studies.”
- **Expected:** Marks for a published/locked exam are visibly read-only, with an explanation that they cannot be changed.
- **Actual before fix:** Inputs and the Save All button were enabled, although the marks API rejected updates with HTTP 409. This created a misleading editing affordance but did not change historical records.
- **Fix:** `src/app/dashboard/marks/page.tsx` now consumes the returned lock flag, displays a read-only notice, disables both mark inputs and the Save All button, and guards the update/save handlers.
- **Retest:** Browser UI verification confirmed the notice and disabled controls. The database integration test confirmed post-publication mark writes, exam edits, and deletion remain rejected.
- **API:** No change was required to `POST /api/marks`; its lock validation was already effective.

## Not executed / remaining limitations

- Student-specific subject combinations are not supported by the current model; publication requires marks for every configured exam subject for every enrolled student.
- Browser creation/editing of an unpublished exam and browser entry of new marks were not performed; those workflows were exercised through guarded database-backed API-handler integration tests to avoid retaining unnecessary test data.
- The exam publication/mark-write advisory-lock race was source-reviewed but not stress-tested concurrently.
- No separate non-default grade scale was available in the QA fixture, so the referenced non-default-scale edit case was not exercised. The pinned scale ID, rejection of a mismatched scale request, and protection of the existing default scale were verified.
- No unpublish endpoint was found; therefore there is no supported unpublish workflow to execute.
- Production, deployment, backup/restore, and broader permission matrices remain out of scope.

## Files changed for Phase 4

- `src/app/dashboard/marks/page.tsx`
- `tests/academic-risk-qa.test.js`
- `QA-TEST-INVENTORY.md`
- `DEPLOYMENT-READINESS.md`
- `QA-PHASE4-EXAMS-RESULTS-REPORT.md`

Phase 4 is ready for user review. Phase 5 has not started and will remain gated on approval of this report.
