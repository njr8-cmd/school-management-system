# Deployment Readiness Report

**Assessment date:** 2026-11-24
**Decision:** **Not ready for school deployment yet.** The single-school/dashboard/teacher-assignment remediation is source-reviewed, unit-tested, and database-verified against the isolated QA database. Phases 4 and 5 are approved. The Phase 6 stale-session and school-settings authorization defects have been fixed and retested; the guarded ADMIN/ACCOUNTANT role migration is applied only to isolated QA. Temporary-role browser login and representative finance CRUD passed. Phase 6 remains NOT APPROVED pending user review. Existing QA Accountant credential login, a safe first-Admin bootstrap method, production configuration, and a production-like recovery rehearsal remain unverified. Phase 7 has not started; no deployment occurred.

## Current QA baseline after authorized reset (2026-11-23)

The user explicitly authorized replacing the isolated QA database after the earlier preservation-only instruction. The reset script guarded the exact QA hostname and database, truncated only the reviewed application-table allowlist in a transaction, and verified the replacement fixture and persisted counts. The 16 applied migrations were preserved. All pre-reset QA records and audit history were removed under that authorization. A separate marked billing fixture and a refreshed ignored test-ID mapping were then prepared; the stress and credit suites were not run after reset. No production system was accessed.

The detailed before/after counts and fixture contents are in [QA-RESET-REPORT.md](./QA-RESET-REPORT.md). The master workflow inventory is in [QA-TEST-INVENTORY.md](./QA-TEST-INVENTORY.md).

## Phase 1 authentication and authorization (2026-11-23)

Phase 1 completed against the isolated QA target using browser and API/database checks. Valid and invalid login, session persistence/expiry, protected pages and APIs, logout, and credit-role authorization were exercised. An initial direct access test found that a signed-in `BOARD_MEMBER` could open the student-credit page even though its APIs returned 403. A server-side page role guard was added; the non-ADMIN redirect and ADMIN access were both retested successfully. `BOARD_MEMBER` was the former role model and has since been removed from the active schema/runtime; current role results are in the Phase 6 remediation section below. In-app password-change/reset/recovery remains unimplemented.

Focused ESLint, TypeScript, and authorization unit-test checks passed. The one-time QA credential was rotated and verified; it is omitted from reports. Full Phase 1 evidence and the initial failure/retest history are in [QA-PHASE1-AUTH-REPORT.md](./QA-PHASE1-AUTH-REPORT.md). No financial calculations, database structure, migration, production system, or Phase 2 workflow was changed.

## Phase 2 school and academic management (2026-11-23)

Phase 2 was completed against the isolated QA target using browser, API, and read-only database checks. School settings now load and update the existing primary school; academic-year date-range and duplicate validation now reject invalid requests. School-scoped settings, academic-year, class, teacher, and student collection/creation routes now select the primary school deterministically. Focused ESLint, TypeScript, and the isolated student-registration regression passed.

The run found and fixed four application defects: blank school settings with an existing-school 409; accepted reversed academic-year dates; duplicate academic years returning HTTP 500; and unordered school selection that could target the separate billing QA school. One empty synthetic year was briefly created in that billing school during the scoping investigation, verified to have no dependents, and removed by exact ID. Final database counts matched the refreshed fixture baseline; the two credits and zero credit-application/audit rows were unchanged. No financial calculations or production systems were touched.

Coverage remains partial: direct academic-year/term editing, term date boundaries, class/subject/teacher activation controls, and direct teacher-assignment editing are unavailable or untested. The school has since confirmed that section selection for new enrollments is not required. Examination/results, billing, credits, comprehensive authorization, production configuration, and recovery testing were outside Phase 2. Full case evidence, severity, cleanup, and test-harness notes are in [QA-PHASE2-ACADEMIC-REPORT.md](./QA-PHASE2-ACADEMIC-REPORT.md); classifications are maintained in [QA-TEST-INVENTORY.md](./QA-TEST-INVENTORY.md).

## Phase 3 student-management QA (2026-11-23)

Phase 3 was completed against the existing isolated QA fixture using the browser, authenticated/anonymous APIs, and read-only database verification. No reset, reseed, schema change, migration, production access, or deployment occurred. Final student, enrollment, teacher, assignment, examination, and financial counts returned to the refreshed baseline; both existing credit rows remained unchanged, with zero credit applications, bills, and payments.

Two student defects were fixed and retested: impossible date-of-birth values were normalized instead of rejected, and deleting a student cascaded away enrollment history. Student APIs now use strict DOB parsing, and deletion is blocked when enrollment history exists. Focused regression tests, full lint, TypeScript validation, and the local production build passed.

At Phase 3 completion, the dashboard displayed the separate `BILL_QA_2083` school's data while student pages/APIs were scoped to the primary QA school, and teacher-assignment cross-school consistency remained unverified. Both code issues were addressed in the subsequent single-school remediation below.

## Single-school, dashboard, and teacher-assignment remediation (2026-11-24)

The application is configured for one school. `/api/school` is the only normal creation path and creates only during initial setup; repeated updates target the same record. School deletion and switching are unavailable. The shared `getConfiguredSchool()` helper uses the explicit deployment/test `SCHOOL_ID` when set. Production rejects multiple school rows even when that variable is set, rather than silently selecting one.

The isolated QA database contains the primary synthetic school (`cmwtatkm10000row42cgw4b64`) and a separate artificial billing-test school (`cmwtawdr10000scw4moape0b6`). The QA app is configured to the primary ID; that deployment setting does not expose a school selector or the billing fixture to normal workflows. The verified database still contains both existing schools; neither was removed, merged, or reset.

Final evidence is separated by type in [SINGLE-SCHOOL-REMEDIATION-REPORT.md](./SINGLE-SCHOOL-REMEDIATION-REPORT.md):

- **Source-reviewed:** school creation/deletion/switching surface, shared school resolution, production duplicate-record failure, dashboard query scoping.
- **Unit-tested:** explicit QA selection, missing/invalid ID and ambiguous-record behavior, create-once/update-on-repeat, no-school selector behavior, and teacher-assignment relationships/multiplicity (10 focused tests passed).
- **Mocked API-tested:** with an authenticated session and empty mocked school lookup, settings GET returned HTTP 404 with setup-required guidance; no live QA record was removed.
- **Database-verified:** guarded tests confirmed school-owned academic and finance APIs reject or omit artificial-school IDs; academic-year activation left both schools' active-year state unchanged; finance-overview totals/counts matched direct primary-school-only aggregates. Teacher-assignment create/read/delete, valid multiple-class/subject assignments, duplicate conflict, cross-school and unconfigured-subject rejection, unchanged rejection counts, student-registration regression, and artificial-school/financial snapshot preservation passed.
- **Prior browser-verified:** settings GET and repeated update returned success for one stable school ID; database school count stayed at two. The dashboard showed the primary school's name, 52 students, 8 teachers, 12 classes, active year 2083, 52 enrollments, and 0 outstanding bills, matching the APIs and database at that time. The dashboard was not reopened after the final API-wide scope changes; the user selected reuse of this prior browser evidence.

`npm run lint` passed without warnings, `npm run build -- --webpack` passed, `npx tsc --noEmit` passed after the build, all 10 focused selector/assignment unit tests passed, and the guarded isolated-QA regressions passed. The assignment test emitted a `pg` overlapping-query deprecation warning but passed. No production system was accessed; no QA reset, reseed, historical-record modification, or billing/payment/credit calculation change occurred. Phase 4 was subsequently authorized and is recorded below.

## Phase 4 examination, marks, results, and marksheet QA (2026-11-24)

The Phase 4 verification used only the existing isolated QA database and a local browser session. Its detailed evidence, defects, test cases, calculations, cleanup, and limitations are in [QA-PHASE4-EXAMS-RESULTS-REPORT.md](./QA-PHASE4-EXAMS-RESULTS-REPORT.md).

- **Unit-tested:** All 9 grading and grade-scale validation tests passed, including every approved boundary and raw-percentage grading.
- **Database-verified:** The guarded exam integration passed (1/1). It exercised valid/invalid exam configuration, class/year and cross-school relationship checks, full marks, theory/practical validation, missing/zero/updated marks, duplicate prevention, publication requirements, result calculations, scale pinning, locked-state protection, and students with exams in multiple terms. Pre-existing published-exam/marks and grade-scale snapshots matched after cleanup.
- **Browser-verified:** The published Grade 5 results page showed 8 students and 5 subjects per student, matching the API. An individual marksheet rendered the configured school and result details. Anonymous results-page access redirected (307) and the results API returned 401. A published-mark UI affordance was found and fixed; the page now explains the lock and disables all mark inputs and the Save All button.
- **Build/regression validation:** ESLint, production build with Webpack, and TypeScript passed. A `pg` overlapping-query deprecation warning appeared during database integration but the test passed.
- **QA safety:** Temporary primary-school test records and a temporary browser account were removed and verified absent. Final primary-school counts matched the inspected baseline (60 exams, 300 exam subjects, 1,239 marks). The separate artificial billing school remained present. Phase 4 did not reset/reseed QA or access production, and no financial API or record was written.
- **Remaining gaps:** Student-specific subject combinations are not supported by the current model; publication/mark concurrency was not stress-tested; browser creation/editing of unpublished exams and browser mark entry were not run. These are documented as partial/not executed, not inferred defects.

Phase 4 was reviewed and approved. Phase 5 was subsequently authorized, completed, reviewed, and approved.

## Phase 5 fees, billing, payments, and credits QA (2026-11-24)

The full evidence, defect details, safety verification, cleanup, and limitations are in [QA-PHASE5-FEES-BILLING-REPORT.md](./QA-PHASE5-FEES-BILLING-REPORT.md). The approved test matrix and individual case statuses are in [QA-PHASE5-FEES-BILLING-TEST-MATRIX.md](./QA-PHASE5-FEES-BILLING-TEST-MATRIX.md); the detailed stress-run case results are in [QA-PHASE5-BILLING-STRESS-RESULTS.md](./tests/billing/QA-PHASE5-BILLING-STRESS-RESULTS.md).

- **Database-backed:** There are 75 unique requested case IDs: 71 non-credit billing cases and four credit IDs (E05/E06/E07/I09). All 75 passed. The initial stress output had 76 rows because CLEAN-01 is an additional cleanup sentinel; its 70 PASS included 69 requested cases plus CLEAN-01, alongside two initial harness failures and four credit placeholders marked NOT EXECUTED. B08/H05 passed focused retests; the four credit IDs were executed once by the separate integration, not duplicated. The supplemental suite passed all 36 named database edge cases.
- **Dashboard/browser:** The configured single school, academic year, student/teacher/class counts, active enrollment count, and outstanding-bill count matched authenticated API results. Browser access used a temporary QA ADMIN because the existing Accountant password was unavailable; that account was deleted by exact ID and verified absent. The baseline had no bills, so positive-balance cross-school isolation was not exercised in the browser.
- **Defect remediation:** A shared numeric parser now rejects non-finite and non-numeric JSON shapes in fee, payment, charge, and discount APIs; the focused invalid-input/database regressions passed.
- **Static/build:** `npm run lint`, `npx tsc --noEmit`, and `npm run build -- --webpack` passed.
- **QA integrity:** Before/after finance snapshot hashes and counts matched. No existing school or financial records were changed, no QA reset/reseed occurred, and no production system was accessed. The pre-existing artificial billing fixture remained QA-only and untouched; the application still has one configured school and no school selector or switching workflow.
- **Remaining gaps:** Full finance-page browser CRUD verification; browser-level outstanding-bill isolation; existing Accountant login and permission verification; expanded credit-boundary coverage; comprehensive authorization matrix; production configuration; and backup/recovery rehearsal remain unverified. Phase 5 is approved; the requested follow-up items remain open.

## Phase 6 finance, expenses, salaries, and accounting QA (2026-11-24)

The full test matrix, exact temporary IDs, evidence classifications, findings, and limitations are in [QA-PHASE6-FINANCE-TEST-MATRIX.md](./QA-PHASE6-FINANCE-TEST-MATRIX.md) and [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). Phase 6 is submitted for review; Phase 7 has not started.

- **Source-reviewed:** Expense and salary APIs/models, finance overview, shared numeric validation, salary payment transaction helper, UI workflows, school scoping, and current role definitions.
- **Database-backed:** 22 unique Phase 6 integration cases passed. Expenses were created/updated/deleted with invalid and cross-school inputs rejected; salary arithmetic, period uniqueness, partial/full settlement, overpayment prevention, concurrent payment serialization, and repeated full-settlement protection passed. Annual and monthly finance summaries matched primary-school aggregates.
- **Regression:** The existing school/finance scope regression passed. Focused Phase 5 regressions EDGE-FEE-01 and EDGE-PAY-03 passed after adding exact-ID cleanup verification; the original finance snapshot remained unchanged.
- **Defect fixed:** Expense amounts submitted as JSON booleans/arrays had been coerced to numeric amounts. Shared finite-number validation now rejects nonnumeric input in expense, salary, and salary-payment APIs. Focused retests and current regression checks passed.
- **Initial authorization failure and remediation:** The original stale ADMIN JWT for a deleted user rendered 10 expense records. The shared session layer now reloads user existence/current role from the database, and the API proxy validates current identity/role. An expanded live QA retest rejected deleted ADMIN and ACCOUNTANT sessions, made database role changes override stale JWT roles, verified seven sampled operational APIs for both roles, denied Accountant account management/self-promotion, and allowed Admin account management. A simulated database outage returned API 401. The original FAIL is retained in the report/matrix; separate remediation rows passed.
- **Role model and migration:** Active Prisma/runtime roles are only ADMIN and ACCOUNTANT. The migration aborts if any BOARD_MEMBER accounts exist instead of silently remapping them; the isolated QA preflight found none, and the guarded migration was applied only to QA. The existing QA Accountant account was preserved and classified as ACCOUNTANT; its credentials were unchanged. No production migration or access occurred.
- **Browser and remaining role limitations:** Explicitly authorized temporary ADMIN and ACCOUNTANT accounts passed browser login, refresh/logout, role-specific page checks, expense CRUD, salary creation, partial/full settlement display, and finance-summary verification. Their exact-ID cleanup was verified. The pre-existing QA Accountant credentials were not changed and its login remains NOT RUN. No Admin account remains in QA; a safe approved first-Admin bootstrap path and comprehensive permission matrix are not yet documented/tested.
- **QA integrity:** Before/after finance snapshot hash and table counts matched. No production access, reset, reseed, or modification to pre-existing financial records occurred. The separate artificial billing-test school remained untouched and unavailable through normal configured-school workflows.
- **Validation:** ESLint passed. Production build passed. A standalone TypeScript run passed after an initial run overlapped with build generation of `.next/types` and transiently failed; the isolated rerun passed.

## Finalized school requirements and follow-up

| Topic | Classification / readiness impact |
|---|---|
| Sections | **Not required** for school operations. Preserve current section-linked enrollments and schema/data. Any removal or simplification requires a separate dependency review and approved migration; it is not part of Phase 3. |
| Term date boundaries | **Required**, but not implemented in the current `AcademicTerm` model. Schedule a separate academic-management change with date-range and overlap rules confirmed by the school. |
| Multiple teacher assignments | **Required** across subjects/classes, with exact duplicate prevention and valid class-subject links. Unit and guarded database route verification passed for valid multiplicity, reads/deletes, duplicates, cross-school links, and unconfigured subjects. |
| Academic-year editing | **Not required** as a routine workflow. An exceptional correction must first inventory dependent records and preserve an audit trail. |
| Teacher/class/subject activation | **Desirable**, lower priority; not implemented in the current models/UI. |
| Authorization and password recovery | Active code/QA schema implement ADMIN and ACCOUNTANT; sampled API checks and temporary-role browser sign-in/page checks passed. The existing QA Accountant credential login, comprehensive permission matrix, and safe first-Admin bootstrap remain blockers. In-app password recovery remains an existing product limitation. |

The full follow-up queue and section dependency analysis are in [SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md](./SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md). These decisions do not authorize a schema change or affect the Phase 3 student-management scope.

## Prior billing and finance regression results (pre-reset, 2026-11-23)

The results below were obtained before the latest QA reset. The fixture and records used for those runs no longer exist; the regression status requires retesting against the refreshed fixture. The initial stale mapping failure was a test-harness issue, not a financial-calculation defect.

| Focus | Latest finding |
|---|---|
| Billing suite | **Pre-reset full run: 71 PASS, 0 FAIL, 0 BLOCKED, 4 NOT EXECUTED by the stress runner.** The four credit cases are intentionally covered by the separately gated integration test, which passed. An initial run failed because the fixture mapping referenced records absent from this QA database; read-only checks identified a stale fixture, not an application defect. A new marked QA fixture was created and the full rerun passed. |
| Prior dues and multi-year billing | **Pass.** E01-E04 verified unpaid, partial, multiple-payment, and fully settled prior bills remain on their original bills; later bills do not duplicate prior balances. B06 verified separate prior/new academic-year balances and duplicate prevention. |
| Discounts and amounts | **Pass.** All seven date/overlap cases, BUS/MISC discount exclusion, fractional rounding, small/large values, zero/negative inputs, and excessive payment checks ran. |
| Transaction rollback | **Pass.** Test-only injected failures rolled back bill generation (I01), payment/balance update (I02), waiver processing (I07), and salary payment (I08). The failure injector is not present in production code. |
| Credits | **Pass in QA integration and browser UI.** The approved additive migration is applied and `prisma migrate status` previously reported the schema up to date. Issuance, retry, partial application, limits, same-year restriction, concurrency, rollback, reversal, and legacy ineligibility passed integration coverage again. The pre-existing database snapshot (one credit row, zero application/audit rows) was unchanged; no temporary credit test years remained. |
| Browser finance workflows | **Tested/partial.** Fee structure create/edit and duplicate validation; student charge create/edit/delete; individual and bulk discount submission; bulk BUS-charge submission; bill generation, detail, unpaid cancellation/regeneration, partial/full payments, waiver, payment history, and student statement; salary creation/payments; expense create/edit; UI overpayment validation; and student-credit issuance/application/reversal were exercised. |
| Browser-discovered fixes | The teacher selector is now scoped to the configured school. Bill/salary date pickers now use BS values, and expenses submit their BS date directly. Focused regression tests cover teacher scoping and expense BS-date persistence. Ordinary fee, discount, and payment calculations were not changed; settlement reads now exclude explicitly reversed credit applications. |
| Historical QA ledger note | A salary payment entered before the date-picker correction had an incorrect historical date. It was not altered before the subsequent authorized reset, which removed it with the rest of the prior QA dataset. |
| Pre-reset validation | `npm run lint`, `npx tsc --noEmit`, `npx prisma validate`, 21 unit tests, the complete billing stress suite, student-credit integration, and `npm run build -- --webpack` passed before reset. The stress run emitted a `pg` overlapping-query deprecation warning; expected validation rejections logged server stacks but passed. No production access/deployment occurred. |

The billing report contains the prior full-suite results, completed credit scenarios, and remaining regression follow-up: [BILLING-QA-REPORT.md](./tests/billing/BILLING-QA-REPORT.md).

## Historical QA baseline (2026-11-22; superseded by the 2026-11-23 reset above)

The user authorized a destructive reset of the confirmed test-only Neon database and a new fictional dataset. The guarded reset ran against that QA target only, preserved all 15 applied migrations and the database schema, and did not run a migration. This replaces the earlier QA dataset; the pre-reset counts and historical-data findings below are retained as an audit trail, not as statements about current QA records or production data.

The new dataset has 30 seeded students, 5 teachers, 12 classes, 5 subjects, and 6 complete examinations. UI QA added one fictional student and one paid bill. No billing logic or schema was changed.

| Focus | Latest finding |
|---|---|
| Section removal | **Pass.** Source searches find no `/api/sections` requests or `sectionId` references in student workflows. Semantic HTML `<section>` elements remain; legacy database records and columns are preserved outside the explicitly authorized QA-data reset. |
| Accountant login and access | **Historical pass only (pre-two-role migration).** A temporary Accountant authenticated in the browser and prior route smoke coverage returned HTTP 200 for 25 routes. That evidence does not verify the current `ACCOUNTANT` role. The current temporary-role browser results and the still-unverified pre-existing account credential login are recorded in the Phase 6 section below; no production credentials or systems were used. |
| Marks and publication | **Pass in browser UI.** The incomplete-publication guard rejected missing marks; saving 50 and explicit 0 for the two students then allowed publication. Four Grade 5 term exams and one Grade 8 exam were also published and locked from the UI. |
| Grades, boundaries, GPA, and position | **Pass in browser UI.** The Grade 5 result table showed all eight grades and all 16 configured percentage test values, including each lower/upper threshold pair. GPA and class positions rendered; Grade 8 results also showed 1st/2nd positions and the expected 3.44/3.36 GPAs. |
| Report cards and print | **Pass in browser UI.** Generated a Grade 5 report card and opened a Grade 8 report card; both displayed subject marks, grades, GPA, and position. Print media hid the print control while retaining the marksheet. |
| Billing UI | **Extended by the follow-up above.** This baseline exercise generated a Baisakh 2083 bill for a fictional student (Rs. 11,700), posted Rs. 1,000 then Rs. 10,700 through the UI, and verified PARTIAL then PAID status, two payment-history rows, and zero remaining. |
| Historic published exams | **Pre-reset QA snapshot only.** The prior inspection found no unassigned scale among 48 published QA exams. Those records were removed by the authorized QA reset; the six new QA exams are published with the approved scale. No production historic exams were examined. The previous Grade 5 missing-mark and legacy-scale observations apply only to that prior QA snapshot. |
| Validation | **Pass.** ESLint (no warnings), TypeScript, 9 focused grading unit tests, 2 QA integration tests, Prisma validation, 15-migration status, and production build. |
| Billing suite | **At this historical baseline:** the last full run before credit implementation reported 71 pass, 0 fail, 4 blocked; migration/QA-write approval was pending then. The later credit results are documented above. See [the billing QA report](./tests/billing/BILLING-QA-REPORT.md). |

## Pre-reset focused verification snapshot (2026-11-22; historical QA data)

The user confirmed the configured Neon database is test-only and authorized targeted QA writes and cleanup. All temporary accounts, exams, and marks created for this refresh were removed. The database returned to 49 exams / 48 published exams; no schema change or migration was made. No production credentials were exposed and no production system was accessed.

| Focus | Latest finding |
|---|---|
| Section removal | **Pass.** No `/api/sections` request or route remains under `src/app`; student registration, enrollment, and profile frontend/API paths contain no `sectionId` references. Legacy schema, migrations, seed references, and generated Prisma fields remain preserved. |
| Accountant setup and access | **Historical pass only (pre-two-role migration).** Prior provisioning created disposable `ADMIN` accounts that authenticated under the old “Accountant” display mapping, and 25 operational routes returned HTTP 200. This is not current ACCOUNTANT login evidence. Current temporary-role browser results and remaining credential/bootstrap gaps are summarized in the Phase 6 section below. |
| Grading logic and UI | **Pass in QA.** Marks were entered in the browser for 16 percentages spanning 0, 34.99, 35, 39.99, 40, 49.99, 50, 59.99, 60, 69.99, 70, 79.99, 80, 89.99, 90, and 100. All eight grades rendered correctly. Blank marks were rejected without rows; explicit zero was saved. |
| Publication, results, GPA, position, report cards, and printing | **Pass for the temporary exam.** UI publication locked marks; 8 result rows and 16 subject rows rendered; grade points, average GPA, and all 8 class positions matched expectations. A new report card and an existing report card opened. Print media hid the print controls and retained the marksheet. |
| Historical published exams | **No unassigned scales found.** All 48 pre-existing published exams had a scale assignment. However, the legacy `Grade Scale 1` contains only A+, A, B+, and B; some older marksheets therefore render `N/A`. Four Grade 5 term exams in year 2083 each have 15 missing student-subject mark entries for the currently enrolled cohort. Preserve all published marks and assignments pending evidence and school approval. |
| Billing and migrations | **Historical baseline.** The 2026-11-22 billing run reported 47/0/10/13; the 2026-11-23 pre-credit full run reported 71/0/4/0. Current credit migration and QA verification are summarized at the top of this report. |
| Local validation | Final lint, TypeScript, tests, Prisma validation, and production build are listed below after rerun. |

### Safe Accountant provisioning procedure

The script requires `DATABASE_URL`, `ACCOUNTANT_PROVISION_EXPECTED_HOST`, `ACCOUNTANT_PROVISION_EXPECTED_DATABASE`, `ACCOUNTANT_PROVISION_CONFIRMATION`, `ACCOUNTANT_NAME`, `ACCOUNTANT_EMAIL`, and `ACCOUNTANT_PASSWORD`. The confirmation must be exactly `CREATE_ACCOUNTANT`. The script parses the PostgreSQL URL and refuses to proceed unless its hostname and database name exactly match the expected-target variables. This is a guardrail, not a way to make production safe: use only an independently approved isolated QA configuration.

From the project directory, first populate `DATABASE_URL` in the current PowerShell process from the approved QA-only secret store; do not paste it into a command, source file, committed `.env` file, screenshot, or shell history. Then set the exact approved QA host/database, confirmation, and intended account identity in that process environment. Read the one-time password from a secure prompt or approved secret store into `ACCOUNTANT_PASSWORD` without echoing it, and run:

```powershell
npm run provision:accountant
```

Use a unique password of at least 14 characters. It is passed only through the process environment, hashed with bcrypt cost 12, and only the hash is stored; the plaintext is not printed or persisted. The script prints the account email on success. If the email already exists, it makes no account or password changes and exits with an error. Clear all temporary environment variables immediately afterward. Verify the selected host/database independently before supplying `DATABASE_URL`; never run this procedure against production.

## Historical validation and supporting evidence (2026-11-22)

| Area | Result |
|---|---|
| ESLint | Pass: `npm run lint`; no errors or warnings |
| TypeScript | Pass: `npx tsc --noEmit` |
| Grade calculation tests | Pass: 4/4 focused cases, including all 16 percentage points, raw percentage behavior, legacy inclusive ranges, and performance labels |
| Academic-risk integration test | Pass against the confirmed isolated QA database; missing, blank, and zero marks were checked; the test's temporary records were cleaned up |
| Prisma schema | Pass: `npx prisma validate`; generated client successfully |
| Prisma migrations | The 15 previously applied migrations were up to date at the last database check. A new additive student-credit migration is prepared but has not been applied; no status check or migration execution was run for this feature. |
| Production build | **Pass with Webpack.** The default Turbopack `npm run build` attempt timed out in Babel loader worker IPC on the changed client pages; `npm run build -- --webpack` then compiled, type-checked, generated all 58 pages, and completed route tracing. Its route inventory contained no `/api/sections`. |
| Billing QA report | Last full run before credit implementation: 71 passed, 0 failed, 4 blocked. Credit-focused static tests pass; the database integration test is gated and has not run. See [the billing QA report](./tests/billing/BILLING-QA-REPORT.md). |
| Accountant route smoke test | 25 dashboard routes returned HTTP 200. One initial compile timeout was resolved by retrying; class-subjects loaded its data. |
| QA cleanup | Prior grading-test accounts, exams, and marks were cleaned up. The marked billing fixture was removed and its saved test-ID mapping restored. The fictional QA dataset, working Accountant account, and UI-generated financial ledger records were retained. |

No database migration was run during the prior QA baseline, and the destructive production seed was not run. The later credit feature adds an unapplied Prisma migration.

## End-to-end workflow checklist

Status meanings: **Tested** means exercised through the UI or a focused test; **Partial** means only a subset of the workflow was exercised; **Not tested** means no meaningful execution; **Incomplete** means a product or deployment gap exists.

| Role / workflow | Status | Evidence and remaining coverage |
|---|---|---|
| Accountant sign-in and protected API access | Partial | Historical route evidence used the old role display mapping. Current temporary ACCOUNTANT browser sign-in, refresh, sampled operational routes, Admin-only page denial, and deleted-session rejection passed; the pre-existing QA Accountant credentials remain unverified. |
| Student registration and enrollment | Partial | Created a temporary student and Grade 5 enrollment through the UI, then removed the QA record. The school confirmed it does not use sections; section selection was removed from the student UI/profile path while legacy database columns and data are preserved. |
| Student profile and account statement | Partial | Existing student profile showed enrollment, bills, payments, discounts, and a separate `Remaining Due` amount. Profile edit, transfer, and other account-history cases were not exercised. |
| Teacher, class, subject, academic year/term, class-subject, and teacher-assignment management | Partial | Pages and existing records rendered. Create, edit, delete, activation, and relationship validation were not submitted through the UI. |
| Fee structure management | Partial | UI create/edit succeeded and duplicate creation showed HTTP 409; temporary test fees were removed. Deactivation and cross-year UI editing were not tested. Historical snapshots have API-level coverage. |
| Student charges and frequency/date rules | Partial | UI create/edit/delete succeeded; a shared one-student BUS charge was also submitted and removed. Deactivation and every frequency through the UI were not tested; API tests cover MONTHLY, TERM, ANNUAL, ONE_TIME, dates, cancellation replacement, and concurrency. |
| Discounts | Partial | UI individual edit from 12.5% to 15% and a one-student bulk discount succeeded; both test discounts were removed. API coverage includes all seven date/overlap cases and BUS/MISC exclusion; individualized sheet-mode bulk entry was not tested. |
| Bill generation, detail, cancellation, and regeneration | Tested for core flow | Generated bills through the UI, inspected detail, cancelled an unpaid bill, regenerated it, and recorded a partial payment. API tests cover overlap, duplicate requests, charge release, and paid/partial cancellation protection. |
| Student payments and outstanding balances | Tested for core flow | UI partial/full payments, waiver, payment history, zero balance, and student statement were verified. Reversal/refund workflows were not tested. |
| Salary records and salary payments | Partial | Salary creation and partial/full UI payments succeeded before reset. A payment made before the BS date-picker fix had an incorrect historical date; the record was removed in the later authorized reset. |
| Expenses and bulk adjustments | Partial | Expense create/edit succeeded with BS date persistence and temporary expense cleanup. Shared bulk discount and BUS-charge submissions succeeded; sheet-row mode and partial-failure handling were not tested. |
| Exams and marks | Tested | Created a temporary two-subject Grade 5 / Term 4 exam through the UI, entered marks for 8 students at 16 boundary percentages, and saved explicit zeros. The UI rejected blank input; API verification found no row from the rejected save. Published and locked the exam through the UI. |
| Results, GPA, position, and marksheets | Tested for temporary exam | Verified 8 result rows, 16 subject grades, all eight grades, matching arithmetic-mean GPA, and 8 unique positions matching percentage ranking. Generated a new report card and checked print media. An existing Grade 8 / Term 4 report card opened; grades below its legacy scale's lowest defined band showed `N/A`. |
| School settings | Partial | Settings form rendered; save and validation were not tested. |
| BOARD_MEMBER authorization | Removed from active role model | The migration preflight found no BOARD_MEMBER QA accounts; the guarded migration replaced the enum with ADMIN and ACCOUNTANT without mapping accounts. Historical migration files still contain their old enum text. No Board Member page, selector, or permission exists in the active app. |

### Results and grade-scale configuration

The approved default scale has thresholds A+ 90-100, A 80-<90, B+ 70-<80, B 60-<70, C+ 50-<60, C 40-<50, D 35-<40, and NG 0-<35, with grade points 4.0, 3.6, 3.2, 2.8, 2.4, 2.0, 1.6, and 0.0. Grade choice uses the raw percentage; display formatting does not influence it. Published exams save their scale so later scale edits/deletion cannot rewrite historical results. Existing published exams are linked to the former scale only when exactly one legacy scale exists; if multiple scales existed during migration, those exams remain unassigned and results are intentionally blocked until an explicit historical assignment is made. The approved scale is seeded by migration and is not editable/deletable.

The current result method remains unchanged: each subject uses its own theory/practical full marks; GPA is the arithmetic mean of subject grade points (including NG as zero); overall percentage and overall grade use total obtained marks divided by total full marks. Publication requires an actual mark row for every student/subject; a saved zero is therefore a real NG result, not a missing mark.

### Historical published exams and scale issues

The inventory found **zero of 48 previously published exams with a null grading-scale assignment**. No assignment repair is needed. Do not assign the new default scale to published exams or recalculate their grades.

Two separate historical-data limitations were observed:

- The affected exams are **Grade 5 / 2083 / Term 1 Examination**, **Term 2 Examination**, **Term 3 Examination**, and **Term 4 Examination**. Each has 15 missing student-subject mark entries when compared with the current enrolled cohort. Compare the original roster/enrollment at publication time and preserved mark sheets. If a mark is genuinely missing, restore it only from authoritative source records with school approval; do not insert zero or change existing published grades to make results calculate. Preserve each exam's locked state until reconciled.
- The legacy `Grade Scale 1` defines only A+, A, B+, and B. An existing Grade 8 / Term 4 report card therefore displays `N/A` for grades below 60%. Retrieve the original scale and published artifacts, then obtain a documented school decision before any repair. Do not extend or replace the pinned scale or recalculate the historical results arbitrarily.

## Billing evidence and limitations

The user's confirmed frequency rules are reflected in the prior isolated QA report: MONTHLY is rate x quantity x eligible months; TERM, ANNUAL, and ONE_TIME are rate x quantity once on the first eligible bill. At that time, no billing calculations, API logic, or schema were changed. The later credit implementation changes only credit issuance/application and active-versus-reversed settlement reads.

Prior QA examples:

- An unpaid first bill remained at Rs. 26,700; the next bill contained only new charges totaling Rs. 17,300. The statement showed Rs. 44,000 outstanding across the original bills without carrying the earlier charge forward.
- With a Rs. 100 partial payment, the first bill's remaining amount stayed on that bill; the next bill was Rs. 17,300 and the statement total was Rs. 43,900.
- The frequency test verified monthly quantity 3 = Rs. 4,500, term quantity 2 = Rs. 800, annual quantity 3 = Rs. 600, and a one-time amount of Rs. 700.

The **pre-reset 2026-11-23** billing stress run reported 71 PASS, 0 FAIL, 0 BLOCKED, and 4 credit placeholders NOT EXECUTED by that runner; the four credit cases were covered separately. These are historical results only. The post-reset Phase 5 count reconciliation and final statuses are documented above and in [QA-PHASE5-FEES-BILLING-REPORT.md](./QA-PHASE5-FEES-BILLING-REPORT.md). The stress runner calls API handlers directly and does not certify authorization.

## Deployment blockers and handoff tasks

1. **Verify existing account credentials and remaining browser flows.** Temporary ADMIN/ACCOUNTANT browser login, refresh/logout, expense CRUD, salary creation/payment display, and finance-summary checks passed. The pre-existing QA Accountant password remains unchanged and unverified; any further login test must use an approved access method. Date/category expense filtering and additional browser error/empty states remain open.
2. **Complete browser-level outstanding-bill isolation.** The configured-school dashboard and APIs matched in the Phase 5 browser check, but the QA baseline had no bills. Verify the dashboard count with a primary-school outstanding-bill scenario while keeping the QA-only billing fixture hidden; do not add a school selector or school-switching workflow.
3. **Establish a safe first-Admin bootstrap path and complete the permission matrix.** The active ADMIN-only account-management feature requires an existing ADMIN. The pre-existing QA account was preserved as ACCOUNTANT; the temporary browser ADMIN was removed after testing. Define and approve the initial Admin provisioning method before deployment, then verify every approved operational permission and sensitive Admin-only control in the browser/API matrix.
4. **Reconcile historical Grade 5 exams.** The four 2083 Term 1–4 examinations each have 15 missing student-subject entries for the current enrolled cohort. Compare with the original roster and authoritative marksheets; restore only source-verified missing marks after school approval. Preserve existing published marks and the locked state.
5. **Resolve legacy grading interpretation.** Recover the complete historical Grade Scale 1 definition or preserved published artifacts, then obtain a documented school decision about the existing `N/A` values. Do not silently alter the pinned scale or grades.
6. **Complete remaining billing follow-up.** Expanded credit-boundary coverage and browser-level outstanding-bill isolation remain unverified. Preserve the artificial QA billing fixture; do not reset/reseed QA or modify historical financial records.
7. **Review payroll business rules and unsupported workflows.** Salary effective-dated changes, payment reversals/corrections, and idempotency semantics are not implemented or specified. Obtain business approval before adding these capabilities; do not assume repeated partial payments are duplicates.
8. **Complete production configuration review.** Production values, secret rotation, hosting configuration, and production database target were not available for verification. Keep secrets out of source control and use a separate production database.
9. **Run a deployment handoff rehearsal.** Validate backups/restore, migration procedure, monitoring/log access, and rollback on a production-like staging deployment. No production deployment or restore drill was performed in this audit.

## Evidence notes

- The billing and credit results document a pre-reset database snapshot. The later user-authorized reset removed that snapshot and seeded a new fixture; see [QA-RESET-REPORT.md](./QA-RESET-REPORT.md). No production system was accessed.
- Direct `node --test` could not resolve the generated Prisma client's extensionless import, including after generation. Running the test with the repository's `tsx` runner after `prisma generate` passed.
- Route smoke testing confirms page rendering, not complete CRUD or financial transaction correctness. Billing browser CRUD and several payment operations remain partial even though the direct-handler billing scenarios are reported separately.
- The first credit-page browser attempt used a Next.js dev server that had loaded a stale generated Prisma client and returned validation errors. Regenerating Prisma Client and restarting that local server resolved the issue; the subsequent Accountant credit UI flow passed.
