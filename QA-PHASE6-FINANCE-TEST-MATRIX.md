# Phase 6 Finance QA Test Matrix

**Target:** Existing isolated QA database only; no reset/reseed or production access.  
**Execution date:** 2026-11-24  
**Status:** Auth/role remediation retested; Phase 6 NOT APPROVED and submitted for review. Phase 7 has not started.

The 22 database-integration IDs below are unique cases from `tests/phase6-finance-qa.integration.test.js`. The Node runner reports 23 tests because it includes one parent suite. Direct handler/helper calls verify data behavior but bypass the authenticated proxy. Browser, source-review, and NOT RUN rows are reported separately and are not included in the 22-case count.

The original stale-session result is retained as `AUTH-STALE-01` with its initial FAIL. The auth retest cases below are separate live QA HTTP/API/page tests using signed test JWTs, not browser credential-login tests. They are reported separately from the 22 finance integration cases.

## Database-backed integration cases

| Test ID | Feature | Scenario / expected result | Actual result | Status | Evidence / defect / retest |
|---|---|---|---|---|---|
| FIN-NUM-01 | Numeric validation | Reject booleans, arrays, objects, null, empty strings, NaN and infinity; accept finite numbers and numeric strings. | Parser rejected invalid shapes and accepted valid values. | PASS | Phase 6 integration |
| EXP-API-01 | Expense scope | List only expenses tied to configured-school academic years. | Every returned expense matched a primary-school year. | PASS | Phase 6 integration |
| EXP-CRUD-01 | Expense CRUD | Create, persist, update, filter, delete, and verify exact row absence. | Rs. 42.75 persisted; updated to Rs. 44.25; filter found it; delete removed it. | PASS | Phase 6 integration; exact-ID cleanup |
| EXP-NUM-BOOL-01 | Expense validation | Reject boolean amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-ARRAY-01 | Expense validation | Reject array amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-OBJECT-01 | Expense validation | Reject object amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-NULL-01 | Expense validation | Reject null amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-EMPTY-01 | Expense validation | Reject empty-string amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-NAN-01 | Expense validation | Reject `"NaN"` amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-INFINITY-01 | Expense validation | Reject `"Infinity"` amount without a row. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration; FIN-DEF-01 retest |
| EXP-NUM-ZERO-01 | Expense validation | Reject zero amount. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration |
| EXP-NUM-NEGATIVE-01 | Expense validation | Reject negative amount. | HTTP 400; no invalid row persisted. | PASS | Phase 6 integration |
| EXP-VALID-01 | Expense validation | Reject missing required values, unsupported category, and invalid date. | All tested invalid requests returned HTTP 400. | PASS | Phase 6 integration |
| EXP-ID-01 | Expense CRUD | Reject update/delete for nonexistent IDs. | Both requests returned HTTP 404. | PASS | Phase 6 integration |
| EXP-SCHOOL-01 | School isolation | Reject expense creation against an academic year in the separate QA billing school. | HTTP 404; no foreign-school expense was created. | PASS | Phase 6 integration |
| SAL-STRUCT-01 | Salary structure | Calculate net salary and prevent duplicate teacher/year/month record. | Rs. 1,000 − Rs. 100 = Rs. 900; duplicate raised unique-constraint conflict; one row remained. | PASS | Phase 6 integration |
| SAL-PAY-01 | Salary payments | Support partial and full settlement with payment method/reference persisted. | Rs. 300 then Rs. 600 settled Rs. 900; state changed PARTIAL to PAID. | PASS | Phase 6 integration |
| SAL-PAY-OVER-01 | Salary payments | Reject overpayment and preserve prior payment/balance. | Rs. 600 accepted; additional Rs. 500 rejected; one Rs. 600 payment remained. | PASS | Phase 6 integration |
| SAL-PAY-CONC-01 | Salary payments | Serialize concurrent payments so combined payments cannot exceed obligation. | Of two concurrent Rs. 600 requests against Rs. 1,000, one succeeded and one rejected; exactly one payment persisted. | PASS | Phase 6 integration |
| SAL-PAY-DUP-01 | Salary payments | Reject another full payment after balance reaches zero. | Second Rs. 500 request rejected; one Rs. 500 payment remained. | PASS | Phase 6 integration |
| FIN-REC-01 | Finance reconciliation | Match yearly overview income, waivers, salary paid, expenses, counts, categories, and net cash flow to primary-school records. | All totals and counts equaled primary-school database aggregates for the reported date interval. | PASS | Phase 6 integration |
| FIN-DATE-01 | Finance reconciliation | Match monthly date-filtered totals to primary-school records. | Monthly income, salary, expense, total expenditure, and net cash flow equaled database aggregates. | PASS | Phase 6 integration |

## Browser and authorization evidence

This table has 16 unique test IDs: 13 PASS and 3 initial FAIL. The failures are the initial stale ADMIN session, the initial Accountant school-settings page access, and a month-label selector error in the browser harness. The two product defects were fixed and retested; the selector error was corrected and the browser scenario passed on its separate retest row.

| Test ID | Feature | Scenario / expected result | Actual result | Status | Evidence / defect / retest |
|---|---|---|---|---|---|
| AUTH-ANON-01 | Authorization | Anonymous finance API calls are denied. | Finance API requests returned HTTP 401. | PASS | Live QA runtime check |
| AUTH-ANON-02 | Authorization | Anonymous finance pages redirect to login. | Finance page navigation redirected to `/login`. | PASS | Live QA browser check |
| AUTH-STALE-01 | Session authorization | A session belonging to a deleted user must not access finance. | Initial run: stale signed ADMIN session rendered the finance expenses page and its 10 records although the user row was absent. The later logout/anonymous check did not remediate this defect. | FAIL | High severity; preserved; separate retest AUTH-DELETE-ADMIN-RET-01 |
| AUTH-ADMIN-BROWSER-01 | Authentication / Admin UI | ADMIN can sign in, use operational and user-management pages, open school settings, and log out. | Explicitly authorized temporary ADMIN signed in, created the temporary Accountant through user UI, opened school settings and finance pages, and logged out. | PASS | Browser; temp user `cmwux2svp0000osw4jgyp4knv`, exact-ID cleanup |
| AUTH-ACCOUNTANT-BROWSER-01 | Authentication / Accountant UI | ACCOUNTANT can sign in, refresh a valid session, and use operational pages. | Temporary Accountant authenticated; dashboard refresh preserved session; student, teacher, class, academic-term, exam, finance, expense, payments, and salary routes rendered. | PASS | Browser; temp user `cmwux65r100003cw46v58msk3`, exact-ID cleanup |
| AUTH-USER-PAGE-ACC-01 | Admin-only page | ACCOUNTANT cannot access user management. | Direct navigation to `/dashboard/users` redirected to `/dashboard`. | PASS | Browser |
| AUTH-SETTINGS-ACC-01 | Admin-only page | ACCOUNTANT cannot open school settings directly. | Initial browser check rendered the editable school form. No school values were changed; the update API was already ADMIN-only. | FAIL | Initial finding preserved; separate retest AUTH-SETTINGS-ACC-02 |
| AUTH-SETTINGS-ACC-02 | Admin-only page | After remediation, ACCOUNTANT is denied direct school-settings access and sees no settings link. | Direct navigation redirected to `/dashboard`; the dashboard had no school profile/configuration link. Admin access remained available in the role integration test. | PASS | Browser + live auth integration; retest of AUTH-SETTINGS-ACC-01 |
| AUTH-DELETE-ACCOUNTANT-BROWSER-01 | Session invalidation | A deleted account’s old browser session cannot access dashboard, finance page, or API. | After exact-ID deletion of the temporary Accountant, both protected pages redirected to `/login` and `/api/expenses` returned 401. | PASS | Browser with the pre-deletion session retained |
| AUTH-BROWSER-SESSION-01 | Session lifecycle | A valid role session survives refresh and logout clears it. | Accountant dashboard session survived refresh; temporary Admin logout completed successfully. | PASS | Browser; temporary accounts removed afterward |
| BROWSER-DASH-01 | Dashboard | Dashboard school name, counts, academic year, and outstanding bills belong to the configured school. | QA Academy - Fictional Test School; 52 students, 8 teachers, 12 classes, active year 2083, and 0 outstanding bills matched the configured-school dashboard evidence. | PASS | Browser; baseline has no bills |
| BROWSER-EXP-01 | Expense UI | Authenticated user can create, edit, and delete an expense without changing existing records. | Baseline 10 records / Rs. 37,071.75; marked Rs. 17.25 row created, edited to Rs. 18.50, then deleted; baseline count and total returned. | PASS | Browser; ID `cmwuxtzus00023cw4hy3yzvjt`; exact-ID absence check |
| BROWSER-SAL-01 | Salary UI | ACCOUNTANT can create a valid salary record and see it persist after refresh. | Rs. 1,000 gross less Rs. 100 deduction produced Rs. 900 net; the created salary row persisted as PAID after refresh. Existing all-years totals were separately reconciled before creating temporary rows. | PASS | Browser; exact ID `cmwuxw39k00033cw4z1pwowzs`; exact-ID cleanup |
| BROWSER-PAY-01-INITIAL | Salary payment UI | Record and display partial salary payment for a temporary salary row. | Harness used the wrong displayed month name for month 11 and timed out locating the row after creation; no payment was submitted in this attempt. | FAIL | Harness selector error, not product failure; separate successful retest below |
| BROWSER-PAY-01-RETEST | Salary payment UI | Partial/full settlement display correct balances and status; full settlement persists after refresh. | Rs. 900 net salary: Rs. 300 partial + Rs. 600 full; UI displayed PAID, Rs. 900 paid, Rs. 0 remaining after refresh. Separate Rs. 500 row displayed PARTIAL, Rs. 200 paid, Rs. 300 remaining. | PASS | Browser; exact salary/payment IDs and cleanup in report |
| BROWSER-FIN-01 | Finance dashboard | Browser summary figures reconcile with the test-period records and distinguish cash from bills/waivers. | Monthly summary showed Rs. 1,100 salary paid in 3 installments, Rs. 2,250 expenses, Rs. 0 fees/waivers, and Rs. -3,350 net cashflow; no bills were counted as collections. | PASS | Browser + same-period QA records; all temporary rows removed |

## Auth/session and two-role remediation retests

These are 10 unique nested scenarios in `tests/auth-session-qa.integration.test.js`; the Node runner reports 11 tests including the parent suite. They ran against the local app over loopback, configured to the primary QA school, and the existing isolated QA database. Each scenario passed after the documented configuration correction.

| Test ID | Feature | Scenario / expected result | Actual result | Status | Evidence / retest |
|---|---|---|---|---|---|
| AUTH-ANON-RET-01 | Authorization | Anonymous protected API is denied and protected page redirects to login. | `/api/users` returned 401; protected finance page redirected to `/login`. | PASS | Live QA HTTP retest |
| AUTH-DELETE-ADMIN-RET-01 | Session invalidation | Deleted ADMIN identity cannot access protected API or page. | API returned 401; protected finance page redirected to `/login`. | PASS | Live QA HTTP retest; `AUTH-STALE-01` initial defect retest |
| AUTH-DELETE-ACCOUNTANT-RET-01 | Session invalidation | Deleted ACCOUNTANT identity cannot access protected API or page. | API returned 401; protected finance page redirected to `/login`. | PASS | Live QA HTTP retest |
| AUTH-ROLE-STALE-ADMIN-RET-01 | Current-role authorization | ADMIN JWT for an ACCOUNTANT database user cannot retain ADMIN-only access. | User API returned 403; user-management page redirected; operational API remained available. | PASS | Live QA HTTP/page retest |
| AUTH-OPS-ACCOUNTANT-RET-01 | Accountant permissions | ACCOUNTANT can use academic, student, fee, bill, payment, credit, and salary operational APIs. | All seven sampled API routes returned 200. | PASS | Live QA API retest |
| AUTH-ADMIN-ONLY-RET-01 | Admin-only controls | ACCOUNTANT cannot create users or promote itself. | Both requests returned 403; no user was created and the role remained ACCOUNTANT. | PASS | Live QA API + database check |
| AUTH-ROLE-STALE-ACCOUNTANT-RET-01 | Current-role authorization | ACCOUNTANT JWT gains current ADMIN permissions only after the database role changes. | Existing JWT gained ADMIN access after DB change; restoration was verified afterward. | PASS | Live QA HTTP/page + database retest |
| AUTH-USER-MGMT-ADMIN-RET-01 | User management | ADMIN can create a user and change its role without exposing stored password data. | User creation and role change succeeded; API response omitted password. | PASS | Live QA API + database check; exact-ID cleanup |
| AUTH-ROLE-INVALID-RET-01 | Role validation | Unknown/removed `BOARD_MEMBER` role is rejected. | User creation request returned 400; no user was created. | PASS | Live QA API + database check |
| AUTH-OPS-ADMIN-RET-01 | Admin permissions | ADMIN retains sampled Accountant operational access. | All seven sampled operational API routes returned 200. | PASS | Live QA API retest |
| AUTH-DB-FAIL-RET-01 | Fail-closed authentication | A protected request with database lookup unavailable is denied. | Protected API returned HTTP 401 when the local app used an intentionally unreachable database endpoint. | PASS | Isolated local failure simulation; separate from 10-case count |
| AUTH-SCHOOL-SCOPE-RET-01 | School isolation | Requests cannot expose records from the separate QA billing school. | The existing guarded school/API scope regression passed; foreign-school expense academic-year creation was also rejected with 404. | PASS | School-scope regression and Phase 6 `EXP-SCHOOL-01`; separate from 10-case count |

### Setup failure and retest record

The first live auth test launch omitted the required `SCHOOL_ID` while the isolated QA database contained two schools; two scenario requests returned HTTP 500 because of test-app configuration. This initial harness failure is not counted as a pass. The local app was restarted with the configured primary school ID, and the expanded retest above passed all 10 unique scenarios. No school or financial data was changed by the failed configuration attempt.

### Database-outage check (separate scenario)

With the local application configured to use an intentionally unreachable database endpoint, a protected API returned HTTP 401. This verifies fail-closed API behavior for that simulated failure; it is not included in the 10-scenario count and does not verify database outage behavior in a browser.

### Role and migration record

The active app role set is `ADMIN` and `ACCOUNTANT`. The guarded migration aborts if a `BOARD_MEMBER` user remains; the QA preflight found none and the migration was applied only to the isolated QA target. It does not remap accounts. The existing QA Accountant identity was preserved and the account role is now `ACCOUNTANT`. No production access/migration, credential changes, or account creation for initial Admin bootstrap occurred. The role tests above are HTTP/API/page-handler tests, not actual browser sign-in.

## Additional NOT RUN / unsupported scenarios

These are not included in the 22 database-case count.

| Test ID | Feature | Expected result | Actual / reason | Status | Retest |
|---|---|---|---|---|---|
| EXP-FILTER-01 | Expense search | Date/category filtering works if supported. | Date/category search is not implemented. | NOT RUN | Not applicable |
| EXP-ACTIVE-01 | Expense lifecycle | Active/inactive behavior follows product rules if supported. | Expense model has no active/inactive behavior. | NOT RUN | Not applicable |
| EXP-FOREIGN-UD-01 | School isolation | Foreign-school expense IDs cannot be read, updated, or deleted. | No safe foreign-school expense CRUD probe was run; foreign-year creation rejection and source scoping were checked. | NOT RUN | None |
| SAL-API-01 | Salary API validation | Salary creation endpoint rejects invalid numeric JSON shapes and preserves data. | Shared parser and route source were reviewed; the Phase 6 integration exercised persisted salary arithmetic through Prisma, not the authenticated salary-creation API. | NOT RUN | No endpoint-level invalid-shape run |
| SAL-CHANGE-01 | Salary history | Effective-dated salary changes preserve historical amounts. | Salary update/effective-date workflow is not implemented. | NOT RUN | Business/product decision required |
| SAL-REVERSAL-01 | Salary correction | Reversal/correction preserves an audit trail. | No reversal/correction workflow is implemented; no records were altered. | NOT RUN | Business rules required |
| SAL-IDEMPOTENCY-01 | Duplicate submission | Identical salary-payment request is safely idempotent. | No request idempotency key is implemented. Repeated partial payments may be valid installments; no policy was invented. | NOT RUN | Business rules and implementation required |
| AUTH-MATRIX-01 | Authorization | ADMIN and ACCOUNTANT permissions match the complete approved matrix; sensitive administration stays ADMIN-only. | Sampled operational APIs, user-management controls, and school-settings page guards passed in live tests and browser checks; the comprehensive permission-by-permission matrix was not completed. | NOT RUN | Sampled evidence is reported separately above; complete before approval/deployment |
| AUTH-EXISTING-ACCOUNT-LOGIN-01 | Authentication | Existing QA Accountant credentials establish a browser session. | The existing password was unavailable and was not changed. Temporary Accountant browser login does not certify the pre-existing account's password. | NOT RUN | Obtain approved access without changing credentials |
| FIN-POSITIVE-ISOLATION-01 | Summary isolation | Primary-school positive outstanding bill appears; artificial-school bill is excluded. | QA baseline has no bills. No synthetic bill was created for this browser scenario. | NOT RUN | Preserve QA billing fixture; plan approved isolated test |

## Source review (not counted as executed tests)

- Expense delete is hard delete; audit/soft-delete behavior is absent.
- Salary structures are unique by teacher, academic year, and month. Effective-dated edits are not implemented.
- Payment transaction helper serializes updates and prevents overpayment; database-backed concurrency case passed.
- Reversals and payment idempotency keys are absent.
- Finance overview uses school-scoped fee payments, salary payments, and expenses. It does not treat issued bills as collections. Waivers are a separate non-cash figure. A legacy PAID salary without payment rows is counted by net amount/payment date.
- The legacy Phase 6 finance findings predated the role migration. The active schema/runtime now accept only ADMIN and ACCOUNTANT; see the remediation test rows above.

See [QA-PHASE6-FINANCE-REPORT.md](./QA-PHASE6-FINANCE-REPORT.md) for snapshot details, exact temporary IDs, safety caveats, and changed files.
