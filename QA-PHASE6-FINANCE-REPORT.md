# Phase 6 — Finance, Expenses, Salaries, and Accounting QA

**Assessment date:** 2026-11-24; updated 2026-11-26
**Status:** Authenticated HTTP and native-dialog acceptance completed; Phase 6 remains NOT APPROVED. Phase 7 has not started.

## Latest authenticated HTTP and native-dialog acceptance (2026-11-26)

The remaining acceptance gaps were tested against the approved QA endpoint using the running local application and its API proxy. ADMIN and ACCOUNTANT requests exercised the real HTTP path; before/after database assertions used only the configured school `cmwtatkm10000row42cgw4b64` and academic year 2083. Temporary users, teacher, salary, payment, and expense fixtures used run marker `PHASE6-REMAIN-70fbc55d-ace8-48de-bcaf-eec8c2a581aa`.

ACCOUNTANT salary payment requests passed through the authenticated API: Rs. 300 partial and Rs. 700 final payments returned 200 and settled the Rs. 1,000 obligation. Replaying the same idempotency key and payload returned 200 without a duplicate; conflicting reuse returned 409, and an Rs. 701 overpayment returned 400 with unchanged history and balance. Two concurrent Rs. 600 requests returned 400/200, leaving exactly one payment and Rs. 400 remaining. An ADMIN full Rs. 1,000 payment returned 200. Direct database checks confirmed the payment date, amount, BANK method, reference, authenticated recorder ID, and database creation timestamp for all four new payment rows.

ACCOUNTANT expense-void API requests with a missing, empty, whitespace-only, non-string, or 501-character reason each returned 400 without changing the expense. A valid void returned 200 and persisted its actor, reason, and timestamp while retaining the original row; a repeat returned 409 without changing the audit. ADMIN repeated void also returned 409 with its original audit unchanged.

Real Microsoft Edge native `prompt()` and `confirm()` dialogs were exercised for the ADMIN expense UI. Prompt cancellation, empty reason, whitespace-only reason, and confirmation cancellation each caused no DELETE request and no database change. Empty/whitespace reasons were rejected before confirmation. Entering a valid reason and confirming sent `DELETE /api/expenses?id=cmwxl4sug0007t4w45vg2vg0r` and returned HTTP 200. The UI retained the void history and showed 10 active of 12 total expenses and Rs. 37,071.75 active outflow; direct database aggregates showed the original expense retained with the correct ADMIN actor, reason, and timestamp and excluded from active totals.

Anonymous salary-payment and expense-void requests returned 401 with unchanged records. A session created for the temporary stale ACCOUNTANT was rejected with 401 after that exact temporary user was deleted. ADMIN `/api/users` returned 200, ACCOUNTANT returned 403, and anonymous access returned 401.

The authenticated yearly finance-overview HTTP response matched direct database aggregates for academic year 2083: fee income Rs. 0, waivers Rs. 0, salary paid Rs. 428,060 across 20 payments, active expenses Rs. 34,027 across 8 expenses, total expenses Rs. 462,087, net cashflow -Rs. 462,087, and zero unreconciled salaries. Expense-category totals and counts also matched.

Exact-ID cleanup removed four salary payments, three salary obligations, two expenses, one temporary teacher, and the temporary ADMIN and ACCOUNTANT users; the stale-session user had already been deleted by its exact ID. All run-marker counts are zero. The final finance snapshot returned to the pre-test hash `56f4024ea94b8bc2f18d098942131f291096987cb5e6bf2768613a36339cab87`, with 2 School rows, 4 academic years, 10 expenses, 40 salaries, and 16 salary-payment rows. No pre-existing user's password, role, or identity was changed; the configured school and its academic years were not modified. The complete per-scenario results and all captured IDs are in the [test matrix](./QA-PHASE6-FINANCE-TEST-MATRIX.md).

This update changed only `QA-PHASE6-FINANCE-REPORT.md` and `QA-PHASE6-FINANCE-TEST-MATRIX.md`. No migration, production/demo access, legacy billing harness, commit, push, merge, or deployment occurred. Phase 6 remains NOT APPROVED.

## Earlier authenticated salary-payment and expense-void acceptance update (2026-11-26)

Real authenticated API calls and ADMIN/ACCOUNTANT browser workflows were run against the local app configured for the explicitly approved QA school. ADMIN recorded a Rs. 300 partial and Rs. 700 final BANK payment against a Rs. 1,000 salary; ACCOUNTANT recorded Rs. 400 and Rs. 600 ONLINE. Both UIs showed payment history, PAID status, and zero remaining balance. Each role created and voided a marked expense; the UI retained void history and excluded both voided expenses from active totals.

Anonymous salary-payment and expense-void requests returned 401. A valid session for a temporary test user was verified before deleting that exact user; afterward `/api/auth/session` contained no user and both protected finance requests returned 401. ACCOUNTANT access to the ADMIN-only `/api/users` endpoint returned 403. The database role enum supports only ADMIN and ACCOUNTANT, both of which are explicitly authorized for salary payments and expense voids, so no third unsupported finance role was fabricated.

Read-only QA queries confirmed all four payment transactions' recorder IDs, payment dates, amounts, methods, references, and database `createdAt` values. Both voided expense rows preserved their original business fields and retained the required reason, actor, and timestamp. The authenticated monthly finance overview matched direct database aggregates: Rs. 0 fee income, Rs. 0 waivers, Rs. 2,000 salary cash across four transactions, Rs. 2,250 active expenses across one record, zero unreconciled salaries, and -Rs. 4,250 net cashflow.

Exact-ID cleanup removed four salary payments, two salary obligations, two expenses, the temporary teacher, and the temporary ADMIN/ACCOUNTANT users; the stale-session user had already been deleted and verified. Every captured fixture ID was absent afterward. Final finance snapshot hash exactly matched the pre-acceptance baseline (`56f4024ea94b8bc2f18d098942131f291096987cb5e6bf2768613a36339cab87`); counts returned to 10 expenses, 40 salaries, and 16 salary-payment rows. Full per-scenario IDs and outcomes are recorded in the [test matrix](./QA-PHASE6-FINANCE-TEST-MATRIX.md).

Historical harness limitation from this earlier run: native `window.prompt()` and `window.confirm()` were stubbed, so that run did not verify native-dialog behavior. The later Edge run above used the actual native dialogs and closed that specific evidence gap. The earlier stubbed interaction is retained as historical evidence only.

## Authorized migration and guarded verification update (2026-11-25)

After the read-only preflight below, the user separately authorized the QA migration and fixture-based database tests. Immediately before migration, the live TLS connection matched the approved Neon host, database `neondb`, and role `neondb_owner`; the proposed migration was absent and was the only pending migration. `20261125120000_add_salary_and_expense_audit` was applied to QA, and `prisma migrate status` now reports all 18 migrations applied. The user's recovery evidence remains partial: the restore procedure was not tested on a separate branch, and no restore/branch operation occurred.

The first current guarded integration attempt reported 18 pass / 5 fail. The four salary-payment checks failed before inserting payments because `$queryRaw` tried to deserialize PostgreSQL `pg_advisory_xact_lock`'s `void` return; the concurrency assertion consequently had zero accepted attempts. That run's captured IDs were cleaned and its final snapshot hash matched baseline. The helper now uses `$executeRaw` for that lock, matching existing repository usage. The guarded rerun of `tests/phase6-finance-qa.integration.test.js` passed **23/23** and covered expense validation, void audit/repeat protection, two-year filtering, salary arithmetic, partial/full settlement, overpayment, concurrency, idempotency/replay/conflicting-key rejection, and current finance overview/date aggregates. A non-failing `pg` query-concurrency deprecation warning appeared during the concurrency test.

The successful run created and then removed 3 expense rows, 5 salary rows, and 5 salary-payment rows. Exact IDs:

- First, failed-but-cleaned attempt — expenses: `cmwwejxau0000pow4lu30ubhe`, `cmwwek5lk0001pow4u4tor9g7`, `cmwwek69x0002pow478qtm6yk`; salaries: `cmwwek8av0003pow4c2g65cdv`, `cmwwekapz0005pow45t8eqt0y`, `cmwwekblr0006pow4ycgnhwr0`, `cmwwekche0007pow44x8815xm`, `cmwwekf5j0008pow4ezpuh9jy`; no payment rows were created.
- Successful rerun — expenses: `cmwwelvkh0000t4w474w82i8v`, `cmwwem3t00001t4w4w6x8jea1`, `cmwwem4gz0002t4w4rutkloci`; salaries: `cmwwem6hb0003t4w40ddcwtp2`, `cmwwem8vt0005t4w4327u9ffg`, `cmwwemf790008t4w4rllh9dcl`, `cmwwemkhs000at4w4tg8knnz3`, `cmwwemowa000ct4w4m9fqsmca`; payments: `cmwwemaeu0006t4w4ofjve4j3`, `cmwwemdgj0007t4w4b82k5w1a`, `cmwwemgqf0009t4w4w1y2fgpi`, `cmwwemm0o000bt4w41o6md4qp`, `cmwwemqhu000dt4w4hpi78ixg`.

Both runs reported no remaining expense, salary, or payment IDs, and equal before/after snapshot hashes. Successful-run totals remained at 10 expenses / Rs. 37,071.75, 40 salary obligations / Rs. 1,527,500, and 16 salary-payment rows / Rs. 425,460. No existing salary/payment/expense, teacher, user, school, or academic-year row was modified. The test only referenced an existing teacher and payment-recorder user; no temporary teacher or role users were created.

The suite invokes route handlers and helper functions directly; it does not exercise `src/proxy.ts` authentication. As of the 2026-11-25 guarded-run update, ADMIN/ACCOUNTANT API/browser acceptance was outstanding; the 2026-11-26 authenticated acceptance is documented above. The standalone salary-summary unit suite passed 2/2; targeted ESLint, project TypeScript, migration status, and `git diff --check` passed for that earlier update. The legacy multi-school billing harness was not run. No production/demo access, commit, push, merge, or deployment occurred. Phase 6 remains **NOT APPROVED**; Phase 7 has not started.

## Current requirement correction — one configured school, multiple academic years (2026-11-25)

The product supports exactly one configured school. Multiple academic years remain supported within that school, including selection and filtering across at least two years. No school selector, switching, or cross-school operation is a product requirement.

The earlier read-only QA snapshot reported two `School` rows and four academic years overall. The additional school row is a QA data/configuration issue for separate investigation, not a supported product scenario; no school or academic/financial data was changed for this correction. The configured school has academic years 2083 and 2084; the guarded expense integration verified filtering across both, while other updated school-scope workflows remain untested. `SCHOOL-CONFIG-01` has passing unit evidence for explicit school selection and missing/ambiguous configuration errors. Although the repository `.env` still lacks `SCHOOL_ID`, the 2026-11-26 local QA app used the verified ID as a process-local setting and completed the finance acceptance flows without changing the environment file. This does not establish current production behavior. Applicable changes are in `tests/phase6-finance-qa.integration.test.js`, `tests/school-api-scope-qa.test.js`, `tests/teacher-assignment-qa.test.js`, `tests/academic-risk-qa.test.js`, and `tests/school-configuration.test.js`.

Post-correction local validation: ESLint and JavaScript syntax checks passed for the five changed QA test files; the school-configuration unit suite passed 7/7 using `tsx`; `git diff --check` passed. A direct `node --test` invocation could not resolve the application's `@/` alias, so the existing `tsx` runner was used successfully. Latest reconciliation validation also passed targeted ESLint and syntax checks for the updated school-configuration and Phase 6 integration tests; the combined school-configuration and salary-summary unit run passed 9/9 (7 and 2 respectively); `git diff --check` passed. No database-backed application tests were run.

A separate read-only query verified the approved Neon identity (endpoint `ep-green-glade-ayptuugl-pooler`, database `neondb`, user `neondb_owner`) with TLS certificate verification enabled and a read-only transaction. Querying the previously documented configured-school ID found two academic years, 2083 and 2084; the database still has two school rows. The transaction was rolled back and no writes were issued. The repository `.env` contains `DATABASE_URL` but no `SCHOOL_ID`; therefore this confirms academic-year membership for the previously configured QA school ID, not an active `SCHOOL_ID` value in the current local process. With the current local configuration and two rows, the resolver fails explicitly on ambiguity rather than selecting an extra row. No environment or school setting was changed.

**Legacy billing QA harness: BLOCKED — pending safe isolated-database redesign.** Its historical fixture creates/uses a second school and is unsafe to run against the shared QA database. It is explicitly excluded from current Phase 6 verification. Its source is preserved and must not be executed or retargeted to the configured QA school. Any future redesign must use a disposable, dedicated database and verify its identity before writes. Do not count this blocked legacy harness as a failed applicable Phase 6 test or claim the broader billing suite is verified.

Current Phase 6 status remains **NOT APPROVED**. No database writes, migration, QA reset/reseed, commit, push, merge, or deployment were performed for this correction.

## Resumed implementation update (2026-11-25)

Phase 6 work resumed on `main` from base commit `9172d00`. This addendum records code review and a read-only inspection of the approved QA database. It does not replace or re-run the historical QA evidence below.

- Salary payment rows carry recorder metadata, a unique idempotency key, and the database `createdAt` audit timestamp. Identical retries replay the prior result; reuse of a key with different payment data conflicts. Salary cash totals and salary-page paid amounts use recorded payment rows only; payment history shows the payment date, recorder, and entry timestamp. Legacy PAID/PARTIAL rows without payments are flagged for reconciliation and excluded from cash outflow.
- Expense deletion is now an authenticated void operation requiring a reason. The original expense is retained with actor/time/reason audit fields and excluded from active finance totals. All finance-overview expense aggregate, category, chart, and recent-transaction queries filter out voided records; the expenses page retains and displays void history.
- Student profiles calculate earlier selected-year BS billing-period debt and prior-academic-year debt from each original bill's payments, waivers, and active credit applications. The latest BS billing-period range is shown as current; earlier ranges are brought forward without changing original bills or creating duplicate receivables. `AcademicTerm` has no date boundaries, so this is a billing-period partition rather than a named-term mapping.
- Migration `prisma/migrations/20261125120000_add_salary_and_expense_audit/migration.sql` is additive: six nullable audit/idempotency columns, indexes, user foreign keys with `ON DELETE RESTRICT`, and two `NOT VALID` consistency checks. It creates no tables, backfills, or updates. It has no down migration; manual reversal would discard any newly recorded audit/idempotency values. This earlier review found the schema compatible; the migration was subsequently applied after explicit QA-only authorization, as recorded above. Backup/recovery evidence remains partial and the restore procedure remains untested.
- Read-only QA inspection verified Neon endpoint `ep-green-glade-ayptuugl-pooler`, database `neondb`, and user `neondb_owner`; client TLS certificate verification passed and the transaction was read-only and rolled back. Credentials were not logged. All 17 recorded migrations are complete through `20261124190000_replace_board_member_with_accountant`; the proposed migration is absent. The reviewed base tables and existing columns/types are present, while all six proposed columns and their indexes/constraints are absent. No migration-name/index collision or pre-existing audit data conflict was found.
- QA baseline: 10 expenses totaling Rs. 37,071.75; 40 salary records and 16 payment transactions totaling Rs. 425,460; no bills, student payments, or bill-credit applications; 2 student credits totaling Rs. 875.50 with no recorded applications. The 10 expenses, 40 salaries, and 16 salary payments match the synthetic QA seed markers; no temporary `PHASE6-*` expense or salary records were found. There are no legacy PAID/PARTIAL salary rows without payment transactions.
- Additional read-only consistency checks found no salary/payment status mismatch, overpayment, or orphan salary-payment row; the two credits' stored applied amounts match their active applications, and no expense has a nonpositive amount.
- At the time of this earlier SQL review, Neon backup/restore-point availability was not verifiable from the database connection. The later user-provided partial evidence and untested recovery procedure are recorded in the acceptance preflight below. Applying the migration remains **BLOCKED** because separate migration authorization is absent.
- Validation from the prior review: TypeScript, targeted ESLint, Prisma validation, production build, focused unit tests (11/11), and `git diff --check` passed before the current single-school test edits. Guarded Phase 6 finance and auth integration suites were not run. Current correction validation is reported separately; no database writes or migration were performed.
- At the time of this earlier entry, these changes had **not** been deployed or pushed and the QA access described there was read-only. The later authorized migration and guarded test writes are recorded above. Authenticated API/browser acceptance was still outstanding then; the 2026-11-26 addenda above record that acceptance. Phase 6 remains **NOT APPROVED** pending the remaining single-school, academic-year, finance, authorization, and recovery checks. The historical QA results below predate these changes.

## Salary/expense acceptance preflight — read-only snapshot before later authorization (2026-11-25)

Repository verification: `main`, HEAD `9172d00ffaaffc6941f08591b6802b5caae6acf8`, root `C:\Users\ujlpd\OneDrive\Desktop\my project\school-management-system`, remote `origin` at `njr8-cmd/school-management-system`. The worktree was already dirty; no existing changes were discarded or overwritten.

The `.env` target metadata matched the approved Neon endpoint `ep-green-glade-ayptuugl-pooler`, database `neondb`, and role `neondb_owner`. A TLS `verify-full` connection verified the live PostgreSQL identity. Schema and migration metadata were read only inside transactions explicitly set `READ ONLY`, then rolled back. No credentials or full connection string were printed. The database is PostgreSQL 18.7; the approved target was QA only, not production or demo.

Seventeen successful migrations are recorded through `20261124190000_replace_board_member_with_accountant`. The proposed `20261125120000_add_salary_and_expense_audit` migration is absent. Its target tables and base ID/FK columns exist; the six new nullable audit/idempotency columns, four indexes, and four constraints are absent. The inspected base schema appears compatible with the additive migration; it was not applied.

Neon recovery evidence is **partially verified** from the user's Console update, not independently viewed in this session because the Console required login. The update reports the QA project/endpoint identity verified, only the `production` root branch visible, six-hour history retention, latest restore point at **2026-11-25 10:48 PM Asia/Kathmandu**, and restore-from-history plus documented recovery steps available. Recovery was **not tested on a separate temporary branch**; do not assume such a branch exists, click Restore, or create/restore a branch without authorization.

At this preflight point, migration and database-writing acceptance-test authorization were explicitly withheld. The user later separately authorized the migration, guarded test writes, and temporary-user acceptance setup; the resulting execution is recorded at the top of this report. As of the preflight, the planned **SAL-01–SAL-10 and EXP-01–EXP-07** scenarios were BLOCKED / NOT RUN and no role fixture or browser acceptance had occurred. The later authenticated results use distinct acceptance IDs and actual amounts; they do not automatically satisfy every differently specified historical plan row. See the [test matrix](./QA-PHASE6-FINANCE-TEST-MATRIX.md) for individual current results and the dated plan.

Read-only QA baseline, scoped to the previously verified configured-school ID: 2 academic years; 10 expenses totaling Rs. 37,071.75; 40 salary obligations totaling Rs. 1,527,500; 16 salary-payment rows totaling Rs. 425,460; and Rs. 1,102,040 obligations less recorded payments. Salary statuses: 24 PENDING, 8 PAID, 8 PARTIAL. The database has one ACCOUNTANT user and no ADMIN user. These are aggregate-only reads, not a before/after acceptance comparison; there is no void-history state until migration.

The only relevant standalone non-writing test found was `tests/salary-payment-summary.test.js`; it passed 2/2 on the local `tsx` runner. It tests summary calculations only. No standalone tests exist for salary payment request validation, overpayment, concurrency, or idempotency, nor for expense validation, voiding, audit, or finance aggregation. Those behaviors were subsequently exercised in the guarded direct-handler/helper/database integration run recorded above.

Current API review: salary payment POST enforces ADMIN/ACCOUNTANT authorization, requires an idempotency key, validates amount/method/date and school scope, and calls the transaction helper that serializes by salary, rejects overpayment, detects identical replay versus conflicting key reuse, and records the actor. Legacy PAID/PARTIAL obligations without payment rows are blocked from new payments. Expense DELETE is a reason-required authenticated soft void with repeat-void protection and actor/timestamp audit; it preserves original details, while expense history remains visible and finance-overview totals filter voided rows. Expense GET/POST/PATCH authorization relies on `src/proxy.ts`; direct handler tests bypass that middleware. The salary payment UI retains a generated key after a failed/ambiguous request for safe same-request retry and clears it on success; browser acceptance should cover same-payload replay and the response to a changed payload after an ambiguous failure.

Source-review limitation: the guarded finance integration calls expense and salary handlers/helpers directly, bypassing `src/proxy.ts` authentication for those calls; its salary fixture selects an existing teacher instead of creating the dedicated temporary teacher required for full acceptance. The existing auth/session integration also modifies the existing QA ACCOUNTANT role, so it must not be used for this task. These suites cannot substitute for authenticated API/browser acceptance and need safe fixture redesign. The lower-level test records were temporary and removed by exact ID; no test source was modified in this verification pass.

Existing QA data was read for aggregate baselines only; the authorized test created and removed only the unique temporary rows listed above. Current Prisma salary/expense API reads select the migration's new fields, so their API/browser read paths required the migration. Repeat collision checks and fresh before/after baselines immediately before any future acceptance run; do not rely on historical counts as current baselines.

**Decision: Phase 6 remains NOT APPROVED.** The authorized additive migration and guarded helper/database tests passed, but authenticated ADMIN/ACCOUNTANT API/browser acceptance remains untested; recovery evidence is partial, and other Phase 6 gates remain open. Phase 7 has not started. No production/demo access, reset/reseed, commit, push, merge, or deployment occurred.

## Scope and safety

Phase 6 reviewed expense management, salary structures/payments, finance summaries, school scoping, authorization behavior, and available browser workflows. The test plan was presented before database writes.

Only the existing isolated QA database (`neondb` on the approved QA host) was used in the historical checks. The production database was not accessed. QA was not reset or reseeded. The guarded role migration was applied only after confirming there were no `BOARD_MEMBER` users. The historical snapshot contained two school rows; the application used one configured school. The additional row is a QA data/configuration issue, not a second supported school, and was not changed. Pre-existing academic and financial rows were preserved. Temporary finance rows and browser users were marked, tracked by exact IDs, removed, and verified absent. The pre-existing QA Accountant identity, role, and credentials were preserved. See the tracking caveat below for earlier exploratory attempts whose individual IDs were not retained.

No historical billing, payment, credit, waiver, salary, student, examination, or school record was edited to make a test pass. The existing QA account was classified as ACCOUNTANT based on its verified intended role; its identity and password hash were preserved. Its role was temporarily toggled only during guarded integration tests and restored afterward. No existing account credentials were changed.

## Authentication and role remediation addendum (2026-11-24)

The original stale-session finding below remains recorded as an initial **FAIL**. Its shared-auth fix and separate successful retests are complete. Temporary ADMIN and ACCOUNTANT browser accounts were explicitly authorized, used, and cleaned up. The browser run found and fixed an additional Accountant school-settings page leak. Phase 6 remains **NOT APPROVED** pending user review; the existing QA Accountant credential login and safe first-Admin bootstrap method remain unverified. Phase 7 has not started and the application has not been deployed.

### Original finding, root cause, and correction

The initial QA reproduction used a signed ADMIN JWT after its database user had been deleted. It rendered 10 expense records. The root cause was that JWT identity and role claims were trusted without revalidating the user row or current role.

The shared NextAuth JWT callback now reloads the user by ID on each session resolution, rejects missing users and unknown roles, and refreshes the session name, email, and role from the database. Lookup errors are not converted to successful sessions; they fail closed. The API proxy validates a current session identity and an approved current role. Protected page guards and API authorization use the refreshed role. A simulated unavailable-database request returned HTTP 401.

### Current role model and permission matrix

The active Prisma schema/client and runtime accept only `ADMIN` and `ACCOUNTANT`. No Board Member page, navigation item, or role is exposed. Historical migrations retain their original enum text; the new migration replaces the active enum without silently assigning any Board Member account to another role.

| Capability | ADMIN | ACCOUNTANT |
|---|---:|---:|
| Academic years/terms, classes, subjects, teachers and assignments | Full operational access | Full operational access |
| Students/enrollment, examinations, marks, results and marksheets | Full operational access | Full operational access |
| Fees, discounts, charges, billing, payments, credits and credit applications | Full operational access | Full operational access |
| Expenses, salaries, salary payments, finance dashboards/reports/accounting | Full operational access | Full operational access |
| User listing/creation, name/email and role management | Allowed | Denied |
| Sensitive account, role/permission and system administration | Allowed | Denied |
| Data outside the configured school | Denied | Denied |

The live tests confirmed both roles can access the sampled operational APIs; the Accountant cannot list/create users or promote itself, while ADMIN can manage account roles. User-management creation responses do not expose password fields. Existing-password reset and account deletion were not added. The authenticated page/API tests used signed test JWTs and prove runtime authorization behavior, not actual credential login.

### Migration and QA account impact

The guarded migration `prisma/migrations/20261124190000_replace_board_member_with_accountant/migration.sql` aborts before changing the enum if any `BOARD_MEMBER` users exist. The QA preflight found no such accounts. It then replaces the enum with `ADMIN` and `ACCOUNTANT`, and changes the database default to `ACCOUNTANT`; it does not remap accounts. The migration was applied only to the isolated QA database; final `prisma migrate status` reported all 17 migrations up to date. Production was not accessed or migrated.

The only pre-existing QA account, `QA Accountant` (`cmwtatksy0001row4l4pgi3x7`), had role `ADMIN` before remediation. Its account name/email and existing documentation were checked to confirm its intended role as `ACCOUNTANT`; that role correction was made explicitly rather than by a blanket enum mapping. Its password hash, email, name, and creation time were preserved. Integration tests temporarily changed only its role to ADMIN and restored it to ACCOUNTANT in `finally`; the final check confirmed the original password hash and account details were unchanged. The temporary browser ADMIN was separately authorized, used, and deleted; no Admin account remains in QA. A permanent first-Admin bootstrap method has not been established and remains a deployment blocker.

### Retest results and evidence classification

| Test type | Result |
|---|---|
| Focused auth/session/authorization/role unit tests | 18/18 passed. |
| Live isolated-QA HTTP/API and protected-page integration | 10 unique nested scenarios passed (Node reports 11 tests including the parent suite). Coverage includes anonymous denial, deleted ADMIN/ACCOUNTANT sessions, current-role-over-JWT behavior in both directions, seven sampled operational APIs for each role, Accountant account-management denial/self-promotion denial, ADMIN user-role management, and rejection of `BOARD_MEMBER`. |
| Database-outage fail-closed check | Protected API returned HTTP 401 while the local app used an intentionally unreachable database endpoint. |
| School/finance isolation regression | 1/1 passed. |
| Phase 5 focused regression after shared-auth changes | `EDGE-FEE-01` and `EDGE-PAY-03` passed (3 tests including parent); the separate credit integration passed 1/1. Before/after finance snapshot was unchanged. This is a focused shared-auth regression, not a rerun of the full 75-case Phase 5 matrix. |
| Phase 6 finance DB integration after auth changes | Historical run summary: 22 unique cases passed (23 tests including parent); reconciliation and exact-ID cleanup checks passed. The exact original ID set is reconciled in the matrix; the original raw TAP log is not retained. These results predate current source/test edits and are not current-code verification. |
| ESLint, standalone TypeScript, Webpack production build | All passed. Prisma schema validation/client generation also passed. |
| Browser/auth matrix | 16 unique IDs: 13 PASS and 3 initial FAIL. The two product findings (stale deleted-user session and Accountant school-settings access) have separate successful remediation retests; the remaining initial failure was a corrected test-selector error. Temporary ADMIN and ACCOUNTANT logins succeeded; expense/salary UI workflows and finance summary passed; deleted Accountant session was rejected. Existing QA Accountant credential login remains NOT RUN. |
| Final targeted auth/role unit rerun | 11/11 passed after the school-settings guard and test assertions. A broader earlier focused auth/role run was 18/18. |

The 10 auth retest scenarios are the ten rows with `AUTH-*-RET-01` in the auth retest table. `AUTH-DB-FAIL-RET-01` is a separate outage simulation and `AUTH-SCHOOL-SCOPE-RET-01` is a separate revised scope test; neither is included in the 10-case count. The outage simulation is a historical PASS, while the revised school-scope test remains NOT TESTED.

The first live auth test launch omitted the required configured-school `SCHOOL_ID` while the historical QA database contained two school rows. Two route scenarios returned HTTP 500 because the test app was misconfigured; this was a harness/configuration failure, not a product pass or a database change. The app was restarted with `SCHOOL_ID=cmwtatkm10000row42cgw4b64`, and the expanded historical retest passed all 10 unique scenarios. The temporary server was stopped afterward.

### Auth test cleanup and financial integrity

The latest expanded auth run created temporary user `cmwuvx7qe0000gcw4kihmo44m`; exact-ID cleanup removed it and verified no matching temporary user remained. The QA account role was restored to `ACCOUNTANT` and its original password hash was verified unchanged. Other auth-test setup attempts were also cleaned: `cmwuups6r0000ycw405kc56js`, `cmwuuv33o0000uww4jgjf6muj`, and `cmwuuyh8s0001uww4yxjr2uz4`. No such temporary users remain.

The existing finance snapshot remains `c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`; all counts were reported unchanged. The historical post-auth Phase 6 finance run summary recorded 22/22 unique cases; its exact IDs are reconciled in the matrix, with `EXP-SCHOOL-01` included and the later `EXP-YEAR-FILTER-01` excluded. The original raw TAP log is not retained, and this result does not verify subsequent source/test changes. After auth changes, only the focused Phase 5 `EDGE-FEE-01`/`EDGE-PAY-03` tests and separate credit integration were rerun; the full 75-case Phase 5 matrix was not repeated. These focused tests passed, exact-ID cleanup was verified, and the financial snapshot was reported unchanged.

## Evidence classification and results

| Evidence type | Result |
|---|---|
| Source/schema review | Completed for expense, salary, salary-payment, finance-overview, school/user/academic-year relationships, validation, transaction helper, and finance UI. Findings are distinguished from runtime verification below. |
| Guarded finance database integration | Historical 2026-11-24 evidence records 22 unique nested cases PASS. A separate 2026-11-25 current-code guarded run passed 23/23 after the advisory-lock fix; results and cleanup are documented above. Historical and current evidence are not combined. |
| Auth/role live QA integration | 10 unique historical scenarios PASS after configuration correction; `AUTH-DB-FAIL-RET-01` and `AUTH-SCHOOL-SCOPE-RET-01` are separate from that count. The former is a separate historical PASS; the latter remains NOT TESTED. Original stale-session failure remains recorded separately. |
| School/finance regression | Historical test passed 1/1; the current expense two-year filter passed in the guarded DB run. Other revised school-scope workflows remain NOT TESTED. |
| Phase 5 financial regressions | `EDGE-FEE-01`, `EDGE-PAY-03`, and separate credit integration PASS on focused rerun; snapshot remained unchanged. |
| Browser | Temporary ADMIN and ACCOUNTANT logins and role-specific pages were tested. Accountant expense CRUD, salary creation, partial/full settlement display, dashboard refresh, and finance summary were verified. Existing-account credential login remains NOT RUN. |
| Static/build | `npm run lint` PASS; `npm run build -- --webpack` PASS; standalone `npx tsc --noEmit` PASS. A TypeScript invocation run concurrently with the build transiently failed because `.next/types` was being regenerated; the immediate standalone rerun passed. |

These are not interchangeable results: database handler tests do not certify authenticated browser behavior or the complete role matrix.

## Defects

### FIN-DEF-01 — Nonnumeric JSON accepted as an amount

**Severity:** Medium — fixed and retested.

- **Reproduction:** Submit an expense amount of JSON `true` or `[5]`.
- **Expected:** Reject the value as invalid and leave the database unchanged.
- **Actual before fix:** JavaScript numeric coercion accepted the values as 1 and 5, respectively, and returned HTTP 201.
- **Correction:** A shared finite-number parser now accepts finite numbers and non-empty numeric strings only. Expense, salary-creation, and salary-payment APIs use it; expense parsing also rejects non-object request bodies.
- **Retest:** Expense API cases reject booleans, arrays, objects, null, empty strings, NaN/infinity string values, zero, and negative amounts. Expense required-field/date/category checks passed. The salary payment arithmetic and transaction tests passed. No invalid expense row persisted.

### AUTH-DEF-01 — Deleted-user session remains authorized (initial failure; fixed and retested)

**Severity:** High — fixed in the shared auth layer and live-QA/browser retested.

- **Reproduction:** In the isolated QA browser, use the already-issued signed ADMIN session belonging to a QA account whose database user row had been deleted. Open the protected finance expenses page.
- **Expected:** A session for a deleted account is rejected; protected finance data is not returned.
- **Actual:** The page rendered 10 expense records although the session user no longer existed in the QA database.
- **Initial result:** FAIL. The protected page rendered 10 expense records. This original result is preserved; it is not overwritten by the remediation retest.
- **Root cause:** The JWT user ID and role were trusted without a current database lookup.
- **Correction and separate retest:** The shared session layer now revalidates user existence and refreshes the role on every session resolution. Live QA retests rejected deleted ADMIN and ACCOUNTANT sessions with API 401 and page redirects; database role changes overrode stale JWT roles in both directions. See `AUTH-STALE-RET-01` and the role test rows in the [test matrix](./QA-PHASE6-FINANCE-TEST-MATRIX.md).
- **Current result:** Fixed in code and isolated-QA retested. In a separate browser retest, the temporary Accountant was deleted by exact ID while its browser session remained open; the expenses page and dashboard redirected to `/login`, and `/api/expenses` returned 401.

### AUTH-DEF-03 — Accountant could open school settings directly (initial failure; fixed and retested)

**Severity:** Medium — fixed in the server page and dashboard navigation.

- **Reproduction:** While logged in as the temporary ACCOUNTANT, navigate directly to `/dashboard/school`.
- **Expected:** Only ADMIN may open school configuration.
- **Initial result:** FAIL. The page rendered the editable school-information form. No school values were changed; `/api/school` already restricted updates to ADMIN.
- **Correction:** Added a server-side role check that redirects non-ADMIN sessions to `/dashboard`; the dashboard now exposes school setup/profile links only to ADMIN.
- **Retest:** The live browser redirected the Accountant to `/dashboard`, showed no school-settings link, and retained the read-only configured-school name. The live auth integration also passed the Accountant redirect and Admin access assertions.

## Database-backed coverage

The historical integration exercised expense list scoping; create/update/filter/delete; required fields, invalid date/category/amount inputs, unknown IDs, and foreign-school academic-year rejection. That foreign-school probe is historical evidence only, not a current product requirement. The current guarded DB rerun separately passed expense filtering across two academic years in the configured school. The historical integration also exercised salary net arithmetic, unique teacher/year/month protection, partial then full settlement, overpayment rejection with unchanged balance, concurrent requests, and repeated full-settlement rejection; current-code salary checks passed in the separate 2026-11-25 rerun documented above.

Calculation examples from persisted QA rows:

- Salary amount Rs. 1,000 less Rs. 100 deduction produced a Rs. 900 net obligation.
- Payments of Rs. 300 then Rs. 600 left the first salary PARTIAL and then PAID, with recorded payments totaling Rs. 900.
- Against a Rs. 1,000 obligation, a Rs. 600 payment followed by a Rs. 500 attempt rejected the latter; the stored balance and single Rs. 600 payment were unchanged.
- Two concurrent Rs. 600 attempts against a Rs. 1,000 obligation resulted in one accepted payment and one rejected request; exactly one Rs. 600 payment remained.
- Repeating a Rs. 500 full settlement was rejected after the balance reached zero; only one Rs. 500 payment remained.

The test calls route handlers and the salary transaction helper directly. They validate business behavior and persisted results, but bypass the normal authenticated proxy; this does not establish ADMIN/ACCOUNTANT authorization.

## Financial reconciliation

The configured-school data reconciled to these recorded totals:

| Measure | Configured-school records |
|---|---:|
| Expenses | 10 records; Rs. 37,071.75 |
| Salary structures | 40 records; Rs. 1,527,500 net obligations |
| Salary payments | 16 records; Rs. 425,460 |
| Outstanding salary | Rs. 1,102,040 |
| Fee collections | Rs. 0 |
| Outstanding student bills | Rs. 0 |
| Credits | 2 records; Rs. 875.50 total, Rs. 0 applied, Rs. 875.50 available |

Both yearly and monthly finance-overview outputs were checked against raw configured-school aggregates for the same date intervals in the 2026-11-24 implementation. At that time, a legacy fallback counted a salary marked PAID without salary-payment rows using its net amount and payment date. That is historical behavior, not the current implementation. The 2026-11-25 source change makes recorded salary-payment transactions the sole evidence of salary cash outflow; legacy PAID/PARTIAL rows without transactions are preserved, excluded from cash totals, and flagged for reconciliation. Bills issued are not counted as collections; waivers are reported separately and are not cash income. The overview does not provide outstanding-bill or credit balances, so those were reconciled directly from records instead.

The historical finance overview and browser totals do not establish an approved accounting definition for accruals or reversals. No legacy salary fallback is used by the current code.

## Browser verification

| Test | Result |
|---|---|
| ADMIN sign-in and operational access | Temporary ADMIN authenticated; dashboard, user management, finance overview, expenses, salary summary, and school settings loaded. Admin created the temporary Accountant through the user UI and logged out successfully. |
| ACCOUNTANT sign-in and operational access | Temporary ACCOUNTANT authenticated; dashboard showed QA Academy - Fictional Test School, 52 students, 8 teachers, 12 classes, active year 2083, and 0 outstanding bills. Refresh preserved the session. Student, teacher, class, academic-term, exam, finance, expense, payments, and salary pages loaded. |
| Admin-only pages | `/dashboard/users` redirected the Accountant to `/dashboard`. `/dashboard/school` initially rendered the form; after the guard fix it redirected to `/dashboard`, and no school-settings link appeared on the Accountant dashboard. No school values were changed. |
| Expense workflow (historical implementation) | Baseline: 10 records, Rs. 37,071.75. A marked Rs. 17.25 expense was created, edited to Rs. 18.50, and permanently deleted through the earlier UI. The count and total returned to baseline; the exact created ID is listed below. This is not verification of current voiding. |
| Salary and payment workflow (historical implementation) | Existing 40-row salary summary in “All years” reconciled to Rs. 1,527,500 net obligations, Rs. 425,460 paid, and Rs. 1,102,040 outstanding. Temporary UI records verified gross/deduction/net arithmetic, PARTIAL display (Rs. 200 paid / Rs. 300 remaining), and full settlement (Rs. 900 paid / Rs. 0 remaining) after refresh. The old salary-row PAID status by itself is not evidence of current cash outflow; current cash reporting requires payment transactions. |
| Finance overview (historical) | During the temporary payment test, the monthly overview showed Rs. 1,100 salary paid across three installments, Rs. 2,250 expenses, zero fee collections/waivers, and Rs. -3,350 net cashflow. These historical values matched the test-period records; bills were not treated as cash collections. This is not a retest of current salary cash reporting. |
| Deleted-user browser session | After exact-ID deletion of the temporary ACCOUNTANT, its still-open browser session was redirected to `/login` for both expenses and dashboard; `/api/expenses` returned 401. |

The first attempt to locate the second test salary used “Mangsir” for BS month 11; the UI correctly displayed that month as “Falgun,” so the selector timed out after creating the temporary salary. The marked row was recovered by its exact QA note, the partial payment was completed, and the UI showed the expected PARTIAL status and balance. This was a test-harness selector error, not a product defect; both records were removed and verified absent.

## School isolation and authorization

- The application is scoped to one configured school; all school-owned records and finance calculations must belong to it. A targeted read-only query for the previously documented configured-school ID found academic years 2083 and 2084. The current API-scope test retains school scoping and selects/filters across two years within that school, but it has not been rerun after the correction. The current local `.env` lacks `SCHOOL_ID`, so an explicit runtime setting remains necessary while two school rows exist.
- The prior foreign-school expense rejection was a historical isolation probe only. Cross-school operations are not supported product scenarios. The extra school row in the historical QA snapshot remains an unresolved data/configuration issue and was not changed.
- Finance-summary calculations were historically reconciled using configured-school joins for students, teachers, academic years, and expenses.
- Anonymous finance APIs returned 401; anonymous finance-page navigation redirected to `/login`.
- **Initial failed result, then retested:** A deleted-user ADMIN JWT initially remained authorized. The shared auth fix now rejects both deleted-role sessions, uses the database role rather than JWT role, and fails closed on a database outage. Live HTTP/page tests passed.
- **Role model:** The active application recognizes only `ADMIN` and `ACCOUNTANT`; the guarded migration was applied in isolated QA after confirming zero `BOARD_MEMBER` users. The app has one configured school; the extra historical QA row is not a supported school.
- **Browser retest:** Temporary ADMIN and ACCOUNTANT sessions were created with explicit authorization and removed after testing. After deleting the temporary Accountant by exact ID, its old browser session was redirected to `/login` on both finance and dashboard routes, and the expenses API returned 401. The existing QA Accountant credential was unchanged and not tested.
- **School settings:** The direct Accountant page leak was fixed and retested. The authenticated `/api/school` GET remains available for read access; its POST remains ADMIN-only.

## Browser and implementation limitations

Authenticated browser tests used only the explicitly authorized temporary ADMIN and ACCOUNTANT QA accounts. The existing QA Accountant password was not changed; login with that pre-existing account remains NOT RUN. The browser checks were direct UI tests, separate from signed-JWT integration coverage.

The historical browser finance checks verified expense create/edit/permanent-delete; salary creation; PARTIAL and PAID displays; payment history; refresh persistence; and a monthly finance overview. They predate the current expense-void and salary cash-accounting changes. At the time this limitation was recorded, no current-code browser run had occurred; the later current-code Edge expense-void run is documented above, and the earlier authenticated UI salary workflows are separately identified above. The school-settings page's initial Accountant access failure and successful retest are recorded separately above. The current UI has no date/category expense search, expense active/inactive lifecycle, or salary reversal/correction. Salary payment idempotency keys are implemented in the API and UI; the guarded helper/DB test and current authenticated HTTP replay/conflict tests passed, while browser idempotency remains untested.

Source review found:

- Current expense DELETE is an authenticated void operation with a required reason, actor and timestamp audit fields, preservation of original expense details, repeat-void protection, and retained history. The ordinary API does not permanently delete expenses. Finance-overview expense aggregate, category, chart, and recent-transaction queries all filter `voidedAt: null`; source review and guarded DB tests confirm exclusion from active totals. Authenticated API and real-native-dialog browser void acceptance passed in the latest addendum above; historical permanent deletion remains separate.
- Expense date/category search and active/inactive behavior are not implemented.
- Salary structures have a unique teacher/year/month constraint. Salary updates/effective-dated history are not implemented.
- Recorded `TeacherSalaryPayment` rows are the only source of salary cash outflow. Legacy PAID/PARTIAL salary obligations without payment rows remain preserved, are excluded from paid cash, and are flagged UNRECONCILED; new payments are blocked pending reconciliation. The previous PAID-without-payment fallback is not used.
- Salary payment idempotency keys are implemented: identical payload replay returns the existing result and conflicting key reuse is rejected. Recorder identity and database `createdAt` are stored. The guarded helper/database and current authenticated HTTP replay/conflict tests passed; browser idempotency remains untested. Salary reversal/correction remains unimplemented and is separate from idempotency.
- The database has no ADMIN account; the existing QA account remains ACCOUNTANT. The user authorized but no temporary ADMIN fixture was created. The application has no separately verified first-Admin bootstrap flow.
- Salary overpayments are rejected by the payment transaction helper. No overpayment or reversal policy beyond existing behavior was assumed.
- Student carry-forward is display-only and is derived from each original bill's applicable payments, waivers, and active credit applications. It does not alter original bills or create duplicate receivables. Fully settled bills and cancelled bills with no payments are excluded under the implemented balance rules. The latest BS billing-period range is treated as the current period because `AcademicTerm` has no date boundaries; it is not a named-term mapping. Positive outstanding-bill DB/API verification remains NOT TESTED.
- Cross-school expense/salary probes are not applicable product scenarios. The legacy billing QA harness remains **BLOCKED** pending an isolated-database redesign. Salary API browser validation states, comprehensive refresh/error/empty UI states, existing-account credential login, and the exhaustive permission matrix remain NOT RUN.

## Data integrity and cleanup

Before/after finance snapshot SHA-256:

`c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`

Historical snapshot counts were identical: 2 school rows, 4 academic years overall, 112 enrollments, 129 fee structures, 19 discounts, 22 student charges, 0 bills, 0 bill items, 0 payments, 0 charge applications, 2 credits, 0 credit applications, 10 expenses, 40 salaries, and 16 salary payments. The second school row is a QA data/configuration issue, not a multi-school product scenario. The aggregate academic-year count alone did not establish per-school distribution; a later targeted read-only query verified two years (2083 and 2084) for the previously documented configured-school ID. The final marked-row and exact-ID checks found no remaining Phase 6 temporary expense, salary, or salary-payment records.

The additional browser run also returned to the same snapshot hash and counts. Its temporary expense was `cmwuxtzus00023cw4hy3yzvjt` (already absent after UI deletion). Temporary salary rows `cmwuxw39k00033cw4z1pwowzs` and `cmwuxxte400063cw4yeganq48` and payment rows `cmwuxwab600043cw42w9q0gar`, `cmwuxwggi00053cw4glec5ol7`, and `cmwuxymzv00073cw4vkewjz11` were deleted by exact ID after validating their QA notes/references; all IDs were verified absent. Before/after snapshots were both `c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`.

The explicitly authorized temporary browser users were `cmwux2svp0000osw4jgyp4knv` (ADMIN) and `cmwux65r100003cw46v58msk3` (ACCOUNTANT). Both were deleted by exact ID and verified absent. The pre-existing QA Accountant account's name, email, password hash, role, and timestamps matched before/after cleanup; its role remained ACCOUNTANT.

Temporary IDs from the original final Phase 6 integration run, before auth remediation (removed and verified absent):

```text
Expense:
cmwusucx70000t4w4vexwzsc1

Salary structures:
cmwusuqfd0001t4w4wawou1q4
cmwusuu7e0003t4w4pefu73b4
cmwusv2ob0006t4w4ldrr017w
cmwusv9ny0008t4w4isbz5y33
cmwusvfyg000at4w44e9dtlj6

Salary payments:
cmwusuw1g0004t4w4qx230fvr
cmwusv0330005t4w44vqrgxev
cmwusv4h50007t4w492tsagqd
cmwusvbi90009t4w4dc7kvltd
cmwusvhtv000bt4w4z5pvkdud
```

Temporary IDs from a focused Phase 5 regression run before the auth remediation (all removed; snapshot unchanged):

```text
Bill: cmwut94220003uww4wrdt8x4x
Payments: cmwut9cah0009uww4fs8eov5n, cmwut9gee000auww4z4ujaxp3
Fee structures: cmwut8lqt0000uww41ozg55av, cmwut8oqs0001uww4gb6ft0bz, cmwut8rqf0002uww4t87dt6ea
```

Temporary IDs from the focused Phase 5 regressions rerun after auth remediation (all removed; snapshot unchanged):

```text
EDGE-FEE-01 / EDGE-PAY-03 bill:
cmwuw97pw0003cww4pdkno66u

Payments:
cmwuw9ebr0009cww48yqiinib
cmwuw9hst000acww45bc6raew

Fee structures:
cmwuw8si00000cww4u2dlj861
cmwuw8uyp0001cww4pbthipu3
cmwuw8x6b0002cww4igm4so9k
```

Temporary IDs from the separate credit integration rerun after auth remediation (all removed; no pre-existing snapshot change):

```text
Temporary user: cmwuwatok0001rkw4zpnow0qv
Temporary academic year: cmwuwatdj0000rkw456s4flkt

Bills:
cmwuwb1q20003rkw45ba2mnkm
cmwuwbqmm0007rkw4c047vunc
cmwuwc5hf000brkw4dv882yyw
cmwuwccfp000drkw42p9mcb3y
cmwuwcfu0000erkw462g7krcc
cmwuwct6q000hrkw4t024uze4
cmwuwd137000krkw44ckxg5g9

Credits:
cmwuwaxvc0002rkw4hf637spe
cmwuwb5uj0004rkw4g03rmbqm
cmwuwbzeg0009rkw4gj7rvsp6
cmwuwc7gk000crkw44aeqolba
cmwuwchvy000frkw4d0doiogv
cmwuwcv8p000irkw4vvffjzit
cmwuwd329000lrkw490foav09
cmwuwdng5000nrkw436v5u1px

Remaining temporary rows: 0
```

Temporary IDs from the final Phase 6 finance integration rerun after auth remediation (removed and verified absent):

```text
Expense:
cmwuw579p0000tow4fvwquzrw

Salary structures:
cmwuw5imq0001tow4y71y73ym
cmwuw5lva0003tow4evnartv4
cmwuw5stn0006tow43w07699g
cmwuw5yqx0008tow41yxvyyam
cmwuw63by000atow40ojwcqz2

Salary payments:
cmwuw5nj00004tow4bkjz8kwr
cmwuw5qly0005tow4slakiwoq
cmwuw5ueg0007tow4sm4lhk3w
cmwuw60060009tow4xr8qnozz
cmwuw64o9000btow4dhzzedwl

Remaining expense IDs: none
Remaining salary IDs: none
Remaining salary-payment IDs: none
```

Auth remediation test accounts (all removed; original QA account restored):

```text
cmwuups6r0000ycw405kc56js
cmwuuv33o0000uww4jgjf6muj
cmwuuyh8s0001uww4yxjr2uz4
cmwuvx7qe0000gcw4kihmo44m
```

**Tracking caveat:** Earlier exploratory attempts used cleanup paths and passed final snapshot/absence checks, but individual temporary child/CRUD IDs from those attempts were not retained in their output. Those IDs cannot now be reconstructed. The final successful Phase 6 run and the latest focused Phase 5 regression run log exact IDs and verify their absence; this does not erase the earlier tracking deviation.

## Exact files changed for Phase 6

- `src/lib/finance/number-input.ts`
- `src/app/api/expenses/route.ts`
- `src/app/api/teacher-salaries/route.ts`
- `src/app/api/teacher-salary-payments/route.ts`
- `tests/phase6-finance-qa.integration.test.js`
- `tests/billing/phase5-edge.integration.test.js` (exact-ID tracking and cleanup verification for focused regression retest)
- `QA-PHASE6-FINANCE-TEST-MATRIX.md`
- `QA-PHASE6-FINANCE-REPORT.md`
- `QA-TEST-INVENTORY.md`
- `DEPLOYMENT-READINESS.md`
- `QA-PHASE5-FEES-BILLING-REPORT.md` (approval/status correction)

### Additional files changed for authentication and role remediation

- `src/auth.ts`
- `src/proxy.ts`
- `src/types/next-auth.d.ts`
- `src/lib/auth/roles.ts`
- `src/lib/auth/session-user.ts`
- `src/lib/auth/authorization.ts`
- `src/lib/auth/user-account-validation.ts`
- `src/lib/finance/credit-access.ts`
- `src/lib/finance/credit-authorization.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20261124190000_replace_board_member_with_accountant/migration.sql`
- `scripts/provision-accountant.ts`
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/dashboard/school/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/users/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/components/UserAccounts.tsx`
- `src/components/DashboardShell.tsx`
- `README.md`
- `tests/auth-session-user.test.ts`
- `tests/auth-authorization.test.ts`
- `tests/user-account-validation.test.ts`
- `tests/auth-session-qa.integration.test.js`
- `tests/credit-authorization.test.ts`
- `tests/billing/credit-rules.test.ts`

## Readiness

The numeric-input, stale-session, and school-settings authorization defects are fixed and retested. The guarded QA migration is applied. Authenticated ADMIN/ACCOUNTANT salary-payment and expense-void API acceptance and the actual Edge native-dialog scenarios passed, including anonymous/deleted-user rejection, persisted audit fields, finance aggregate reconciliation, and exact-ID cleanup with a matching baseline hash. Phase 6 remains **NOT APPROVED** and is **not ready for deployment** pending the complete authorization matrix, existing-account credential verification, remaining single-school/API isolation coverage, a positive outstanding-bill DB/API scenario in a safe isolated fixture, and verified backup/recovery evidence. The legacy billing harness remains blocked, and Phase 7 has not begun.
