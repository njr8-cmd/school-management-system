# Phase 6 — Finance, Expenses, Salaries, and Accounting QA

**Assessment date:** 2026-11-24  
**Status:** Authentication/role remediation retested; Phase 6 remains NOT APPROVED and is submitted for user review. Phase 7 has not started.

## Scope and safety

Phase 6 reviewed expense management, salary structures/payments, finance summaries, school scoping, authorization behavior, and available browser workflows. The test plan was presented before database writes.

Only the existing isolated QA database (`neondb` on the approved QA host) was used. The production database was not accessed. QA was not reset or reseeded. The guarded role migration was applied only after confirming there were no `BOARD_MEMBER` users. The configured primary school and the separate artificial billing-test school remained in place; the latter was not exposed through normal workflows or modified. Pre-existing academic and financial rows were preserved. Temporary finance rows and browser users were marked, tracked by exact IDs, removed, and verified absent. The pre-existing QA Accountant identity, role, and credentials were preserved. See the tracking caveat below for earlier exploratory attempts whose individual IDs were not retained.

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
| Phase 6 finance DB integration after auth changes | 22 unique cases passed (23 tests including parent); reconciliation and exact-ID cleanup checks passed. |
| ESLint, standalone TypeScript, Webpack production build | All passed. Prisma schema validation/client generation also passed. |
| Browser/auth matrix | 16 unique IDs: 13 PASS and 3 initial FAIL. The two product findings (stale deleted-user session and Accountant school-settings access) have separate successful remediation retests; the remaining initial failure was a corrected test-selector error. Temporary ADMIN and ACCOUNTANT logins succeeded; expense/salary UI workflows and finance summary passed; deleted Accountant session was rejected. Existing QA Accountant credential login remains NOT RUN. |
| Final targeted auth/role unit rerun | 11/11 passed after the school-settings guard and test assertions. A broader earlier focused auth/role run was 18/18. |

The first live auth test launch omitted the required primary-school `SCHOOL_ID` while the QA database held two schools. Two route scenarios returned HTTP 500 because the test app was misconfigured; this was a harness/configuration failure, not a product pass or a database change. The app was restarted with `SCHOOL_ID=cmwtatkm10000row42cgw4b64`, and the expanded retest passed all 10 unique scenarios. The temporary server was stopped afterward.

### Auth test cleanup and financial integrity

The latest expanded auth run created temporary user `cmwuvx7qe0000gcw4kihmo44m`; exact-ID cleanup removed it and verified no matching temporary user remained. The QA account role was restored to `ACCOUNTANT` and its original password hash was verified unchanged. Other auth-test setup attempts were also cleaned: `cmwuups6r0000ycw405kc56js`, `cmwuuv33o0000uww4jgjf6muj`, and `cmwuuyh8s0001uww4yxjr2uz4`. No such temporary users remain.

The existing finance snapshot remains `c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`; all counts are unchanged. The post-auth Phase 6 finance integration passed 22/22 unique cases; its exact IDs are listed below. After auth changes, only the focused Phase 5 `EDGE-FEE-01`/`EDGE-PAY-03` tests and separate credit integration were rerun; the full 75-case Phase 5 matrix was not repeated. These focused tests passed, exact-ID cleanup was verified, and the financial snapshot remained unchanged.

## Evidence classification and results

| Evidence type | Result |
|---|---|
| Source/schema review | Completed for expense, salary, salary-payment, finance-overview, school/user/academic-year relationships, validation, transaction helper, and finance UI. Findings are distinguished from runtime verification below. |
| Guarded finance database integration | 22 unique nested cases PASS; Node reports 23 tests including the parent suite. Case IDs are listed in the [test matrix](./QA-PHASE6-FINANCE-TEST-MATRIX.md). |
| Auth/role live QA integration | 10 unique scenarios PASS after configuration correction; original stale-session failure remains recorded separately. |
| School/finance regression | Existing `tests/school-api-scope-qa.test.js` regression PASS. |
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

The integration exercised expense list scoping; create/update/filter/delete; required fields, invalid date/category/amount inputs, unknown IDs, and foreign-school academic-year rejection. It exercised salary net arithmetic, unique teacher/year/month protection, partial then full settlement, overpayment rejection with unchanged balance, concurrent requests, and repeated full-settlement rejection.

Calculation examples from persisted QA rows:

- Salary amount Rs. 1,000 less Rs. 100 deduction produced a Rs. 900 net obligation.
- Payments of Rs. 300 then Rs. 600 left the first salary PARTIAL and then PAID, with recorded payments totaling Rs. 900.
- Against a Rs. 1,000 obligation, a Rs. 600 payment followed by a Rs. 500 attempt rejected the latter; the stored balance and single Rs. 600 payment were unchanged.
- Two concurrent Rs. 600 attempts against a Rs. 1,000 obligation resulted in one accepted payment and one rejected request; exactly one Rs. 600 payment remained.
- Repeating a Rs. 500 full settlement was rejected after the balance reached zero; only one Rs. 500 payment remained.

The test calls route handlers and the salary transaction helper directly. They validate business behavior and persisted results, but bypass the normal authenticated proxy; this does not establish ADMIN/ACCOUNTANT authorization.

## Financial reconciliation

The primary-school data reconciled to these recorded totals:

| Measure | Primary-school records |
|---|---:|
| Expenses | 10 records; Rs. 37,071.75 |
| Salary structures | 40 records; Rs. 1,527,500 net obligations |
| Salary payments | 16 records; Rs. 425,460 |
| Outstanding salary | Rs. 1,102,040 |
| Fee collections | Rs. 0 |
| Outstanding student bills | Rs. 0 |
| Credits | 2 records; Rs. 875.50 total, Rs. 0 applied, Rs. 875.50 available |

Both yearly and monthly finance-overview outputs were checked against raw primary-school aggregates for the same date intervals. The implementation is cash-oriented for fee income and recorded salary/expense outflows; bills issued are not counted as collections. Waivers are reported separately and are not cash income. A legacy fallback counts a salary marked PAID with no salary-payment rows using its net amount and payment date; confirm that this matches the school's accounting policy. The overview does not provide outstanding-bill or credit balances, so those were reconciled directly from records instead.

The finance overview and browser totals do not establish an approved accounting definition for accruals, reversals, or the legacy paid-salary fallback. No new accounting methodology was introduced.

## Browser verification

| Test | Result |
|---|---|
| ADMIN sign-in and operational access | Temporary ADMIN authenticated; dashboard, user management, finance overview, expenses, salary summary, and school settings loaded. Admin created the temporary Accountant through the user UI and logged out successfully. |
| ACCOUNTANT sign-in and operational access | Temporary ACCOUNTANT authenticated; dashboard showed QA Academy - Fictional Test School, 52 students, 8 teachers, 12 classes, active year 2083, and 0 outstanding bills. Refresh preserved the session. Student, teacher, class, academic-term, exam, finance, expense, payments, and salary pages loaded. |
| Admin-only pages | `/dashboard/users` redirected the Accountant to `/dashboard`. `/dashboard/school` initially rendered the form; after the guard fix it redirected to `/dashboard`, and no school-settings link appeared on the Accountant dashboard. No school values were changed. |
| Expense workflow | Baseline: 10 records, Rs. 37,071.75. A marked Rs. 17.25 expense was created, edited to Rs. 18.50, and deleted through the UI. The count and total returned to baseline; the exact created ID is listed below. |
| Salary and payment workflow | Existing 40-row salary summary in “All years” reconciled to Rs. 1,527,500 net obligations, Rs. 425,460 paid, and Rs. 1,102,040 outstanding. Temporary UI records verified gross/deduction/net arithmetic, PARTIAL display (Rs. 200 paid / Rs. 300 remaining), and full settlement (Rs. 900 paid / Rs. 0 remaining) after refresh. |
| Finance overview | During the temporary payment test, the monthly overview showed Rs. 1,100 salary paid across three installments, Rs. 2,250 expenses, zero fee collections/waivers, and Rs. -3,350 net cashflow. These values matched the test-period records; bills were not treated as cash collections. |
| Deleted-user browser session | After exact-ID deletion of the temporary ACCOUNTANT, its still-open browser session was redirected to `/login` for both expenses and dashboard; `/api/expenses` returned 401. |

The first attempt to locate the second test salary used “Mangsir” for BS month 11; the UI correctly displayed that month as “Falgun,” so the selector timed out after creating the temporary salary. The marked row was recovered by its exact QA note, the partial payment was completed, and the UI showed the expected PARTIAL status and balance. This was a test-harness selector error, not a product defect; both records were removed and verified absent.

## School isolation and authorization

- Expense list results were restricted to academic years belonging to the configured primary school.
- An expense request using an academic year from the QA-only billing school returned 404 and created no row.
- Finance-summary calculations were reconciled using primary-school joins for students, teachers, academic years, and expenses. The artificial billing school and its historical records remained untouched.
- Anonymous finance APIs returned 401; anonymous finance-page navigation redirected to `/login`.
- **Initial failed result, then retested:** A deleted-user ADMIN JWT initially remained authorized. The shared auth fix now rejects both deleted-role sessions, uses the database role rather than JWT role, and fails closed on a database outage. Live HTTP/page tests passed.
- **Role model:** The active application now recognizes only `ADMIN` and `ACCOUNTANT`; the guarded migration was applied in isolated QA after confirming zero `BOARD_MEMBER` users. The separate artificial billing school remains untouched and inaccessible through normal school-scoped workflows.
- **Browser retest:** Temporary ADMIN and ACCOUNTANT sessions were created with explicit authorization and removed after testing. After deleting the temporary Accountant by exact ID, its old browser session was redirected to `/login` on both finance and dashboard routes, and the expenses API returned 401. The existing QA Accountant credential was unchanged and not tested.
- **School settings:** The direct Accountant page leak was fixed and retested. The authenticated `/api/school` GET remains available for read access; its POST remains ADMIN-only.

## Browser and implementation limitations

Authenticated browser tests used only the explicitly authorized temporary ADMIN and ACCOUNTANT QA accounts. The existing QA Accountant password was not changed; login with that pre-existing account remains NOT RUN. The browser checks were direct UI tests, separate from signed-JWT integration coverage.

The browser finance checks verified expense create/edit/delete; salary creation; PARTIAL and PAID displays; payment history; refresh persistence; and a monthly finance overview. The school-settings page's initial Accountant access failure and successful retest are recorded separately above. The existing UI has no date/category expense search, expense active/inactive lifecycle, salary reversal, or idempotency key.

Source review found:

- Expense deletion is hard deletion; the model has no audit/soft-delete mechanism. The temporary-row delete path was tested, but the safety of deleting historically significant expenses requires a business/audit decision.
- Expense date/category search and active/inactive behavior are not implemented.
- Salary structures have a unique teacher/year/month constraint. Salary updates/effective-dated history are not implemented.
- Salary payment reversal/correction and request idempotency keys are not implemented. Repeated partial payments may be valid installments; no duplicate rule was invented.
- The database has no Admin account after the verified QA account was classified as ACCOUNTANT. The application has no separately verified first-Admin bootstrap flow; do not create an account or alter credentials without approval.
- Salary overpayments are rejected by the payment transaction helper. No overpayment or reversal policy beyond existing behavior was assumed.
- Direct cross-school expense update/delete probes, foreign-school salary access attempts, salary API browser validation states, comprehensive refresh/error/empty UI states, existing-account credential login, and the exhaustive permission matrix remain NOT RUN.

## Data integrity and cleanup

Before/after finance snapshot SHA-256:

`c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`

Snapshot counts were identical: 2 schools, 4 academic years, 112 enrollments, 129 fee structures, 19 discounts, 22 student charges, 0 bills, 0 bill items, 0 payments, 0 charge applications, 2 credits, 0 credit applications, 10 expenses, 40 salaries, and 16 salary payments. The final marked-row and exact-ID checks found no remaining Phase 6 temporary expense, salary, or salary-payment records.

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

The numeric-input, stale-session, and school-settings authorization defects are fixed and retested. The two-role model and guarded QA migration are implemented. Temporary-role browser login and representative finance workflows passed, and the finance snapshot remained unchanged after exact-ID cleanup. Phase 6 remains **NOT APPROVED** and is **not ready for deployment** pending user review, an approved first-Admin bootstrap path, existing QA Accountant credential verification, and the remaining authorization/isolation cases. This report is submitted for review; Phase 7 has not begun.
