# QA Test Inventory and Phases 1-5

**Baseline:** Isolated QA database reset and reseeded on 2026-11-23.
**Execution scope:** Phases 1–4 are complete, with Phase 4 approved. Phase 5 fees/billing/credits QA completed all 75 unique requested cases, 36 supplemental database edge cases, dashboard/API verification, and static/build checks; Phase 5 has been reviewed and approved. Phase 6 finance QA and the authorized authentication/two-role remediation have been executed and are awaiting user review; Phase 6 is NOT APPROVED and Phase 7 has not started. See [QA-PHASE5-FEES-BILLING-REPORT.md](./QA-PHASE5-FEES-BILLING-REPORT.md) and [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md).

## Master inventory

Every workflow uses one of these exact classifications: `NOT TESTED`, `PARTIALLY TESTED`, or `REGRESSION RETEST`. `REGRESSION RETEST` means earlier evidence passed before the latest QA reset, so that evidence does not certify the refreshed database or its new account.

| Area | Status | Evidence / remaining coverage |
|---|---|---|
| Authentication, session lifecycle, and protected APIs | PARTIALLY TESTED | Phase 6 added per-request database user/role refresh; live QA HTTP tests rejected deleted ADMIN/ACCOUNTANT sessions, honored current DB roles, and failed closed on lookup errors. Focused auth/authorization tests passed 18/18. Explicitly authorized temporary ADMIN and ACCOUNTANT browser logins, refresh, Admin logout, and deleted-Accountant stale-session rejection passed; the pre-existing QA Accountant password remains untested and unchanged. In-app password recovery is not implemented. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Student registration and enrollment | PARTIALLY TESTED | Phase 3 verified manual/generated admission numbers, validation, year/class enrollment updates, cross-school scope, and deletion safeguards. Impossible DOB normalization and enrollment-history cascade deletion were fixed and retested. Broader CRUD and boundary coverage remain. See [QA-PHASE3-STUDENT-REPORT.md](./QA-PHASE3-STUDENT-REPORT.md). |
| Student profiles and account statements | PARTIALLY TESTED | Phase 3 verified contact/guardian edits, persistence, multi-year enrollments, similar-name and phone search, and read-only profile history panels. Full statement/payment workflows remain in finance coverage. |
| School settings | PARTIALLY TESTED | Authenticated settings GET and repeated updates preserved the configured primary-school ID; initial setup/create-on-repeat and missing-school behavior have mocked/API coverage. A new browser check found ACCOUNTANT could open the settings form directly; the server page now redirects ACCOUNTANT and the dashboard link is hidden. Admin page access and Accountant denial retested; no settings changed. Infrastructure CRUD remains untested. See [QA-PHASE2-ACADEMIC-REPORT.md](./QA-PHASE2-ACADEMIC-REPORT.md), [SINGLE-SCHOOL-REMEDIATION-REPORT.md](./SINGLE-SCHOOL-REMEDIATION-REPORT.md), and [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Single-school enforcement and dashboard | PARTIALLY TESTED | The shared selector and production duplicate-record failure are source-audited and unit-tested. Normal application workflows use only the configured primary school; the pre-existing artificial billing fixture remains QA-only and hidden. The guarded API scope regression passed. The browser dashboard showed QA Academy - Fictional Test School, 52 students, 8 teachers, 12 classes, active year 2083, and 0 outstanding bills. Authorized temporary ADMIN and ACCOUNTANT users were used for role-specific checks and deleted by exact ID. The fixture had no bills, so a browser-level positive outstanding-bill isolation case remains unverified. Production and live empty-database execution were not tested. See [SINGLE-SCHOOL-REMEDIATION-REPORT.md](./SINGLE-SCHOOL-REMEDIATION-REPORT.md), [QA-PHASE5-FEES-BILLING-REPORT.md](./QA-PHASE5-FEES-BILLING-REPORT.md), and [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Academic years/terms, classes, subjects, and assignments | PARTIALLY TESTED | Phase 2 retested supported management paths. The guarded database assignment route regression passed create/read/delete for valid multiple-class/subject assignments, exact duplicate conflict, rejection of foreign teacher/class/year and an unconfigured subject, and unchanged counts after rejected writes. The additional API-scope test rejected foreign academic-year term reads/activation and class-subject, exam, mark, and result access; active-year state remained unchanged. Focused unit tests also passed. Term date boundaries are required but deferred; routine academic-year editing is not required; class/subject/teacher activation is desirable. Sections are not required for operations. See [QA-PHASE2-ACADEMIC-REPORT.md](./QA-PHASE2-ACADEMIC-REPORT.md), [QA-PHASE3-STUDENT-REPORT.md](./QA-PHASE3-STUDENT-REPORT.md), [SINGLE-SCHOOL-REMEDIATION-REPORT.md](./SINGLE-SCHOOL-REMEDIATION-REPORT.md), and [SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md](./SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md). |
| Fees, student charges, discounts, bill generation, payments, waivers, and finance statements | PARTIALLY TESTED | All 75 unique historical case IDs passed: 71 non-credit IDs were covered by the stress runner (B08/H05 passed focused retests), while E05/E06/E07/I09 were skipped by that runner and passed once in the separate credit integration. CLEAN-01 is an additional cleanup row, not a case ID. The 36 named supplemental database edge cases passed; finance snapshot hash/counts matched before and after. Browser finance CRUD remains partial; see [QA-PHASE5-FEES-BILLING-REPORT.md](./QA-PHASE5-FEES-BILLING-REPORT.md). |
| Student credit issuance, application, idempotency, and reversal | PARTIALLY TESTED | E05, E06, E07, and I09 are four of the 75 historical case IDs. The stress report lists them as NOT EXECUTED by that runner; the separate gated credit integration executed and passed them once, so they are not additional unique cases and were not duplicated. Additional credit-boundary and comprehensive browser/authorization cases remain untested; see the Phase 5 report. |
| Teacher records and assignments | PARTIALLY TESTED | Phase 2 retested teacher create/edit/validation and assignment management; Phase 3 verified multiple distinct assignments, exact duplicate rejection, and missing class-subject rejection. The 2026-11-24 guarded route regression and focused unit tests cover valid multiplicity, read/delete, cross-school teacher/class/year rejection, unconfigured subjects, and cleanup. Deactivation and direct assignment editing are unsupported. |
| Teacher salaries and salary payments | PARTIALLY TESTED | Phase 6 database integration verified net salary arithmetic, duplicate-period prevention, partial/full settlement, overpayment rejection, concurrent-payment serialization, and repeated full-settlement rejection. Temporary Accountant browser checks created a marked salary, displayed partial and full balances/status after refresh, and removed exact salary/payment IDs; snapshot matched. Salary changes/effective dates, reversal, idempotency, and broader browser cases remain unverified or unsupported. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Expenses | PARTIALLY TESTED | Phase 6 database integration verified primary-school scoping, create/update/filter/delete, invalid amounts/fields/dates/categories, unknown IDs, foreign-year rejection, and cleanup. Browser UI create/edit/delete passed and restored the 10-record / Rs. 37,071.75 baseline. Cross-school update/delete probes, date/category search, academic-year filter interaction, and active/inactive behavior remain unverified or unsupported. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Finance summaries and reconciliation | PARTIALLY TESTED | Phase 6 reconciled annual and monthly finance-overview values to primary-school aggregates on cash basis. Browser monthly summary matched the temporary test-period salary/expense rows, which were subsequently removed; the final snapshot matched. Positive-balance cross-school isolation remains unverified. Bills issued are not counted as collections; credits/outstanding bills are not exposed by the overview. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| Exams, marks, grade scales, calculations, results, and report cards | PARTIALLY TESTED | Phase 4 passed 9 grading/scale unit tests, a guarded database integration test covering exam relationships/full marks, marks validation and edits, missing/zero marks, publication locks, aggregate/GPA calculations, and multiple terms, plus browser results/marksheet and locked-marks UI verification. A low-severity published-exam edit affordance was fixed and browser-retested. Student-specific subject combinations are not supported; concurrency stress and several browser create/edit paths remain untested. See [QA-PHASE4-EXAMS-RESULTS-REPORT.md](./QA-PHASE4-EXAMS-RESULTS-REPORT.md). |
| Infrastructure | PARTIALLY TESTED | Infrastructure records were seeded but CRUD remains untested. |
| Bulk student adjustments | PARTIALLY TESTED | Prior shared bulk discount and BUS-charge submissions passed; sheet-row mode and partial-failure behavior remain untested. |
| Production configuration, backup/restore, deployment, and recovery | NOT TESTED | Explicitly out of scope; no production access, deployment, or restore rehearsal occurred. |
| Comprehensive non-ADMIN authorization across ADMIN-only pages and APIs | PARTIALLY TESTED | The initial stale deleted-user ADMIN session failure is preserved; after the shared auth fix, live tests rejected deleted users, used current DB roles, denied Accountant user management/self-promotion, and allowed sampled operational access. Browser checks found and fixed an Accountant school-settings page leak; deleted user's old browser session was also rejected. Full permission-by-permission matrix remains outstanding. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| ADMIN/ACCOUNTANT role implementation and testing | PARTIALLY TESTED | Active Prisma/runtime roles are only `ADMIN` and `ACCOUNTANT`; the guarded migration was applied to isolated QA after confirming no `BOARD_MEMBER` users. Temporary ADMIN/ACCOUNTANT accounts verified browser sign-in, Admin account management, role-specific pages, refresh/logout, and deleted-user denial; both were removed by exact ID. Existing QA Accountant login, safe first-Admin bootstrap, and comprehensive permission-matrix coverage remain outstanding. |
| In-app password change/reset/recovery | NOT TESTED | Not implemented in the inspected app; remains a product gap outside Phase 3. |

## Approved ADMIN/ACCOUNTANT permission specification

This is the approved permission requirement, now reflected in the active schema and runtime role validation. The guarded migration does not silently remap Board Member accounts; it stops if any are present. Do not alter existing QA account credentials to facilitate testing.

**ADMIN**
- Full access to every application feature.
- Full control over user accounts, roles, permissions, and sensitive system administration.
- Full access to academic, student, examination, and financial modules.

**ACCOUNTANT**
- Full operational access to student, teacher, academic, examination, results, and financial modules.
- Full create, read, update, and delete permissions wherever supported.
- Independent management of academic years, terms, classes, subjects, class-subject assignments, and teacher assignments.
- No access to user account management, role/permission management, or sensitive system administration.
- Dashboard should be practically identical to ADMIN's, except for ADMIN-only controls.

## Finalized school and academic decisions (2026-11-23)

| Workflow / capability | Classification | Decision and current evidence |
|---|---|---|
| Operational section management and section selection | **NOT REQUIRED** | Do not add section management or require sections for new enrollments. Preserve existing section-linked enrollment history and schema/data during QA. Any schema/code cleanup is a separate, reviewed task. |
| Academic-term date boundaries | **REQUIRED** | Terms must have date boundaries. The current model has no term start/end fields; implementation and validation belong in the academic-management follow-up, not Phase 3 unless student management directly depends on them. |
| Multiple teacher/class/subject assignments | **REQUIRED** | A teacher must be assignable to multiple subjects/classes, with exact-duplicate prevention and valid class-subject relationships. Current schema/API/UI appear to support independent assignments; behavioral regression verification is still pending. |
| Routine academic-year editing | **NOT REQUIRED** | Do not add a routine edit workflow. The current app has no academic-year edit UI/API. Any exceptional correction should first assess dependent records and use a controlled, auditable correction path; do not rewrite history casually. |
| Teacher, class, and subject activation | **DESIRABLE** | Lower-priority capability. These models currently have no activation field/control; do not expand Phase 3 to add one. |
| ADMIN/ACCOUNTANT separation and comprehensive non-ADMIN authorization | **REQUIRED** | Active code and isolated-QA schema now recognize only these two roles. The stale deleted-user session defect was fixed and live-retested; temporary-role browser sign-in, Admin-only page checks, and deleted-Accountant browser-session rejection passed. The existing QA Accountant credential, full authorization matrix, and safe first-Admin bootstrap remain unverified. See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md). |
| In-app password recovery | **EXISTING IMPLEMENTATION LIMITATION** | No in-app password-change/reset/recovery flow was found. Keep this documented as a product gap; it is outside Phase 3. |

The implementation backlog and safe section-cleanup assessment are tracked in [SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md](./SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md).

## Phase 1: authentication scope

These are the only tests included in Phase 1. Actual steps and outcomes are recorded in [QA-PHASE1-AUTH-REPORT.md](./QA-PHASE1-AUTH-REPORT.md). Use only the isolated QA target and synthetic accounts; do not write credentials or session tokens to reports.

AUTH-09 and AUTH-10 below are historical tests against the former `BOARD_MEMBER` role. That role has since been removed from the active schema/runtime; use the Phase 6 remediation tests for current `ADMIN`/`ACCOUNTANT` behavior.

| ID | Test | Expected result |
|---|---|---|
| AUTH-01 | Sign in with `qa.accountant@example.test` and the rotated one-time QA password. | Credentials are accepted; a session is established and the user reaches the dashboard. |
| AUTH-02 | Sign in with the correct email and an incorrect password. | Sign-in is rejected with a neutral invalid-credentials message; no session is issued. |
| AUTH-03 | Sign in with an unknown email and a syntactically valid password. | Same externally visible rejection as AUTH-02; no session is issued. |
| AUTH-04 | Submit blank email/password and POST missing credentials to the callback. | Browser required-field validation blocks the blank form; server callback returns a credentials error and no session. |
| AUTH-05 | Open dashboard pages signed out and signed in. | Signed-out navigation redirects to `/login`; ADMIN navigation renders protected pages. |
| AUTH-06 | Read the authenticated session after sign-in and reload. | Session contains the expected user ID and `ADMIN` role without password/hash. |
| AUTH-07 | Call protected read and write APIs without a session. | Requests return HTTP 401 and do not mutate QA data. |
| AUTH-08 | Call `/api/students` and `/api/student-credits` as ADMIN. | Both authorized reads return HTTP 200 and seeded records. |
| AUTH-09 | Call student-credit GET/POST APIs using a signed `BOARD_MEMBER` session. | Both return HTTP 403; no database user or credit record is created. |
| AUTH-10 / AUTH-10R | Open the ADMIN-only credit page directly as `BOARD_MEMBER`, then retest after the page guard. | Non-ADMIN redirects to `/dashboard`; ADMIN still accesses the page. |
| AUTH-11A / AUTH-11B | Send an expired session token to `/api/students`. | A sufficiently expired token returns HTTP 401. AUTH-11A records the initial token that was within clock-skew tolerance; AUTH-11B records the corrected test. |
| AUTH-12 | Alter a signed session token and call `/api/students`. | Tampered token returns HTTP 401. |
| AUTH-13 | Sign out, then repeat session/API/page requests. | Session is cleared, protected API returns 401, and protected page redirects to `/login`. |
| AUTH-14 | Verify rotated credential works and old generated credential is rejected. | New password is accepted; old password is rejected neutrally. |
| AUTH-15 | Check password-change/reset/recovery behavior where implemented. | No in-app workflow exists; report NOT EXECUTED / not implemented. |

Password reset/recovery is not part of Phase 1 execution because no such flow is present in the inspected login UI/auth configuration. Do not infer lockout or rate-limiting behavior; those controls were not established by this inspection.

## Scope note

Reset verification is documented in [QA-RESET-REPORT.md](./QA-RESET-REPORT.md). Phases 2 and 3 outcomes, defects, retests, cleanup, and validation are documented in [QA-PHASE2-ACADEMIC-REPORT.md](./QA-PHASE2-ACADEMIC-REPORT.md) and [QA-PHASE3-STUDENT-REPORT.md](./QA-PHASE3-STUDENT-REPORT.md). Finalized academic decisions and cross-school follow-up are in [SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md](./SCHOOL-ACADEMIC-FOLLOW-UP-BACKLOG.md). The prior billing run remains documented in [BILLING-QA-REPORT.md](./tests/billing/BILLING-QA-REPORT.md), but its pass counts are pre-reset evidence and require regression retest.
