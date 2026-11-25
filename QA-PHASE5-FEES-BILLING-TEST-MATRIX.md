# Phase 5 Fees, Billing, Payments, and Credits Test Matrix

**Purpose:** Record the complete post-reset regression scope and execution results.

## Evidence and safety baseline

- The 71 PASS / 0 FAIL / 0 BLOCKED / 4 NOT EXECUTED in `tests/billing/BILLING-QA-REPORT.md` is **pre-reset historical evidence only**; none of those results were counted toward this retest.
- The application and all normal browser/API workflows use the one configured primary school. The pre-existing artificial billing-test school is QA fixture data only; it is not exposed as a second application school, and its records were preserved.
- The refreshed fixture baseline was independently captured before writes. The final finance snapshot hash matched exactly after the test suites.
- No reset/reseed, production access, historical-results edits, or changes to existing billing, payment, credit, waiver, expense, or salary rows are permitted. Every rejection must be checked for no database mutation.
- Before writes, record school and financial-table snapshots. After each suite, verify its temporary rows are removed and compare financial snapshots. Only IDs created by the current run may be cleaned up.
- `prepare-fixture.js` and `cleanup-fixture.js` are out of scope: the first may mutate existing fixture data and the second deletes the marked school.

## Execution results (2026-11-24)

- There are 75 unique requested case IDs: 71 non-credit billing cases and four credit cases (E05, E06, E07, I09). The initial stress output had 76 rows because it included CLEAN-01, a separate cleanup sentinel. Its 70 PASS included 69 requested cases plus CLEAN-01; B08/H05 were initial harness-data failures; the four credit rows were marked NOT EXECUTED by that runner. Thus 69 + 2 + 4 = 75 requested IDs; adding CLEAN-01 yields 76 output rows.
- B08 and H05 passed focused retests after harness corrections. E05, E06, E07, and I09 passed once in the separate gated credit integration (1/1 test); they are listed as NOT EXECUTED placeholders in the stress-runner output but were not executed by that runner. There is no overlap in actual execution and no duplicate test run across suites.
- Final status: all 75 unique requested IDs PASS; CLEAN-01 is an additional PASS cleanup/snapshot check, not a requested case. The four credit cases were part of the 75, not four extra unique cases.
- The supplemental database edge suite passed 36/36 cases. Cases outside that suite (credit-boundary, full UI, and broader authorization cases) remain individually marked NOT RUN or PARTIAL below.
- Browser dashboard verification used an explicitly authorized temporary ADMIN account because the existing QA Accountant password was unavailable locally. The dashboard rendered the configured school and matched primary-school APIs: 52 students, 8 teachers, 12 classes, academic year 2083, 52 active enrollments, and 0 outstanding bills. The temporary account was deleted by exact ID and its absence verified.
- Anonymous finance requests returned HTTP 401. The real QA Accountant browser workflow and full finance-page CRUD were not verified in this run.
- Final financial snapshot hash: `c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`; schools 2 (one configured application school plus the preserved QA-only fixture), academic years 4, enrollments 112, fees 129, discounts 19, charges 22, bills 0, bill items 0, payments 0, credit applications 0, expenses 10, salaries 40, salary payments 16. No production access, reset/reseed, existing financial-record changes, or QA school-record changes occurred.

## Test matrix

| IDs | Area and scenarios | Expected result | Verification / preservation evidence | Status |
|---|---|---|---|---|
| SAFE-01 | Guarded target and baseline | Connection matches the exact approved isolated QA host/database; both existing schools and fixture marker resolve as expected. | Guarded host/database verified; baseline finance hash captured and matched after tests. The app/browser used only its configured primary school. | PASS |
| A01-A09 | Bill calculation: standard quarterly fees, multiple discounts, multi-fee discounts, full tuition scholarship, student BUS/MISC charges, discount exclusion for student charges, quantity charges, student-charge isolation, grade-specific fees. | Exact totals, discounts, line items, and school/student relationships match the fixture's approved expectations. | Full legacy rerun passed these cases; temporary bills/items cleaned and source rows remained unchanged. | PASS |
| SC01-SC07 | Charge frequency and lifecycle: quantity/frequency totals, no duplicate charge or prior balance, date eligibility, unpaid cancellation/rebill, settled cancellation protection, concurrent bills. | Charges are applied once in eligible periods; settlement stays on its original bill; cancellation/rebill and concurrency preserve application integrity. | Full legacy rerun passed; exact temporary rows were cleaned. | PASS |
| B01-B04, B06, B08-B09 | Bill periods and validation: consecutive/overlapping/duplicate periods, multi-year billing, invalid inputs, concurrent identical bill requests. | Non-overlapping bills succeed; overlapping/duplicate or invalid requests fail with the expected status; concurrent duplicate requests create exactly one bill. | Full rerun passed; B08 passed after correcting the harness to select an actually invalid school/year relationship. | PASS |
| D01-D05 | Fee schedule: annual, term, one-time, student-charge start-date, and inclusive multi-month calculations. | Each configured fee appears with its correct frequency, first eligible period, quantity, and full configured amount. | Full legacy rerun passed; temporary bill records cleaned. | PASS |
| F01-F10, F11, F11-concurrent-waiver, F12 | Payments and waivers: full/partial/multiple settlement, combined waivers, required waiver reason, over-settlement/overpayment, zero/negative inputs, cancelled/paid bill rejection, concurrent settlement, identical retry and changed-payload idempotency conflict. | Paid/waived/outstanding totals and bill status are consistent; settlement cannot exceed balance; one idempotent payment persists; changed key reuse conflicts. | Full legacy rerun passed, including settlement concurrency, idempotency, rollback, and unchanged rejection checks. | PASS |
| H01-H05 | Historical safeguards: fee/discount changes, deactivation, student-charge edit/delete, class change, missing enrollment. | Existing bill item snapshots remain unchanged; later bills use current configuration; invalid enrollment is rejected. | Full rerun passed; H05 passed after the harness created an exact temporary student with no selected-year enrollment. | PASS |
| I01-I03, I05-I08 | Transaction/integrity: bill-generation rollback, payment and waiver rollback, unique bill numbers, student-deletion protection, parent relationships, salary-payment rollback. | Injected failures leave no partial writes; numbers remain unique; history is protected; foreign keys are consistent. | Full legacy rerun passed; injected failures left no partial writes. | PASS |
| C01-C07 | Discount dates and overlap: starts before/after period, inclusive boundary, expired/partial-month discount, overlap/adjacency, edited discount snapshot. | Discount amount and eligible months are correct; overlaps conflict; adjacent dates are accepted; historical bills retain their original discount. | Full legacy rerun passed; source and historical bill snapshots were preserved. | PASS |
| E01-E04 | Prior dues and multiple years: unpaid, partial, multiple-payment, and fully settled prior bills. | Prior balances remain attached to original bills; new-year billing is independent; statement outstanding equals the sum of open bill balances. | Full legacy rerun passed; all temporary bills/payments were cleaned. | PASS |
| E05-E07, I09 | Student credit: excessive and partial applications, same-key retry/changed payload, transaction rollback, reversal and duplicate reversal. | Applications obey credit/bill balance limits and same-student/year rules; retries are idempotent; reversal restores available credit and bill balance while retaining the audit record. | Separate gated integration passed; exact temporary academic year, user, credits, applications, and bills were removed; finance snapshot matched. | PASS |
| G01-G04 | Monetary boundaries: fractional discount rounding, smallest positive amounts, large values, zero/negative/excessive inputs. | Calculations remain cent-accurate; invalid operations are rejected without balance changes. | Full legacy rerun passed; amounts and rejection side effects were asserted. | PASS |
| TEA01, EXP01, master | Related regressions: teacher list school scope, expense BS-date contract, integrated bill/payment/waiver/statement journey. | Only configured-school teachers are returned; expense date round-trips; end-to-end balances match across bill, payment, and student statement. | Full legacy rerun passed; temporary finance rows were removed. | PASS |
| ISO-01 | Primary-school API read isolation for fees, charges, discounts, bills, payments, and finance overview. | Results and aggregates contain only the configured primary school, not the QA-only artificial fixture. | Guarded school-scope and browser API checks matched primary-only records; no QA fixture data was exposed in normal workflows. | PASS |
| ISO-02 | Cross-school write/read rejection for bill, payment, fee, charge, discount, and credit operations using marked-fixture IDs while primary is configured. | Foreign records are not exposed or changed; invalid relationships return the route's documented not-found/validation response. | Guarded API/school-scope tests passed; rejected writes left records unchanged. | PASS |
| AUTH-01 | Anonymous protected finance API requests; authenticated access using the existing QA account, without recording credentials. | Anonymous access is denied; the existing QA session can access only its authorized configured-school workflows. | Anonymous requests returned 401; browser login/dashboard used a temporary authorized ADMIN because the existing Accountant password was unavailable. Existing account unchanged. | PARTIAL |
| WEB-01 | Browser finance visibility with the configured primary school. | Bills, payments, and finance summaries do not display the artificial billing-test school; normal UI has no school switcher. | Dashboard and primary-school APIs were verified; full finance-page browser CRUD and existing Accountant login were not run. | PARTIAL |
| UNIT-01 | Existing fee/bill/credit calculation, settlement, authorization, and regression tests. | Focused tests pass without changing unrelated behavior. | 36 named supplemental DB edge cases and the credit integration passed; targeted ESLint/TypeScript checks passed. | PASS |
| BUILD-01 | ESLint, TypeScript, Prisma validation if required by changed code, and production build. | All required static/build checks pass. | Full ESLint, `npx tsc --noEmit`, and `npm run build -- --webpack` passed. | PASS |
| CLEAN-01 | Final integrity and cleanup verification. | The configured application school, QA-only fixture, and all pre-existing finance records remain unchanged; no current-run temporary rows remain. | Baseline hash and counts matched; no marked credit-test records remained; temporary browser ADMIN was deleted by exact ID and verified absent. | PASS |

## Individual legacy case register

Every one of the 75 unique requested case IDs is listed separately below with its final status. The 71 non-credit cases were exercised by the stress runner (with focused B08/H05 retests); E05/E06/E07/I09 were executed only by the separate credit integration.

| ID | Individual scenario | Expected result | Status |
|---|---|---|---|
| A01 | Generate a normal quarterly bill. | Rs. 21,500, five expected line items, UNPAID. | PASS |
| A02 | Apply multiple separate discounts. | Rs. 19,500 total with Rs. 2,000 discount. | PASS |
| A03 | Apply one discount across multiple fee types. | Rs. 18,680 total with the expected aggregate discount. | PASS |
| A04 | Apply a full tuition scholarship while retaining an undiscounted term charge. | Rs. 8,500 total; tuition nets to zero and the student term charge remains. | PASS |
| A05 | Include student-specific BUS and MISC charges. | Rs. 26,700 total with charges for the selected student only. | PASS |
| A06 | Confirm discounts do not apply to student-specific charges. | Rs. 24,900 total; charge lines remain undiscounted. | PASS |
| A07 | Calculate a quantity-based BUS charge. | Quantity, rate, charge amount, and Rs. 26,300 bill total match the fixture. | PASS |
| A08 | Check student-charge isolation between students. | S001 has no S003 charges in the bill. | PASS |
| A09 | Generate a bill from grade-specific fees. | Rs. 24,600 total with the configured fee types. | PASS |
| SC01 | Calculate student-charge amounts for all configured frequencies. | Rate x calculated quantity is correct for monthly, term, annual, and one-time examples. | PASS |
| SC02 | Generate a second bill after an unpaid first bill. | Charges and old balance remain on the first bill; neither is duplicated on the second. | PASS |
| SC03 | Generate a second bill after a partially paid first bill. | Partial settlement and charges remain on the first bill; no balance is carried forward. | PASS |
| SC04 | Test a charge outside one billing period but inside a later eligible period. | It is absent from the early bill and appears once in the eligible bill. | PASS |
| SC05 | Cancel an unpaid bill and rebill its released charges. | Original bill remains CANCELLED for audit; charges release and appear once on replacement. | PASS |
| SC06 | Attempt cancellation/rebill after settlement. | Cancellation conflicts; settled bill and active charge applications remain unchanged. | PASS |
| SC07 | Generate concurrent non-overlapping bills that include a charge. | Both requests succeed where valid and each charge is applied exactly once. | PASS |
| B01 | Generate consecutive non-overlapping periods. | Both bills succeed and have distinct bill numbers. | PASS |
| B02 | Attempt a partially overlapping period. | Second bill is rejected with HTTP 409. | PASS |
| B03 | Attempt a period contained within an existing bill. | Second bill is rejected with HTTP 409. | PASS |
| B04 | Attempt an exact duplicate period. | Second bill is rejected with HTTP 409 and no extra bill persists. | PASS |
| B06 | Bill across academic years and retry a duplicate. | Old balance stays on its original bill; new-year fee/discount are correct; duplicate is rejected. | PASS |
| B08 | Submit invalid bill inputs. | Each invalid request is rejected with its expected 400/404 response and no write. | PASS |
| B09 | Submit concurrent identical bill requests. | Exactly one bill is created; other request conflicts. | PASS |
| D01 | Bill an annual class fee across multiple periods. | Annual fee appears only in the first eligible bill. | PASS |
| D02 | Bill a term fee over configured terms. | One term fee is charged for each configured term. | PASS |
| D03 | Bill a class one-time fee across multiple periods. | It appears once in the academic year. | PASS |
| D04 | Bill a one-time student charge around its start date. | It appears only in its first eligible billing period. | PASS |
| D05 | Generate an inclusive two-month period. | Tuition, lab, and total match configured full marks/rates and period length. | PASS |
| F01 | Settle a bill with one full payment. | Bill status becomes PAID and actual paid amount equals the bill total. | PASS |
| F02 | Settle a bill with multiple partial payments. | Payment sum equals total; bill becomes PAID. | PASS |
| F03 | Combine payment and waiver on a bill. | Actual paid amount excludes the waiver; outstanding and PARTIAL status are correct. | PASS |
| F04 | Use multiple payments and waivers to settle a bill. | Actual payments, waiver sum, and PAID status are correct. | PASS |
| F05 | Omit, blank, or whitespace-only waiver reason. | Each positive waiver request is rejected; no payment is written. | PASS |
| F06 | Submit a waiver above the outstanding balance. | Request is rejected; bill and payment rows are unchanged. | PASS |
| F07 | Submit payment plus waiver above the outstanding balance. | Request is rejected; no over-settlement occurs. | PASS |
| F08 | Submit another payment to an already paid bill. | Request is rejected and no extra payment is written. | PASS |
| F09 | Submit payment against a cancelled bill. | Request is rejected and bill remains CANCELLED. | PASS |
| F10 | Submit zero and negative payment amounts. | Both requests are rejected without writes. | PASS |
| F11 | Race two payments whose combined amount exceeds the balance. | At most one succeeds; total settlement never exceeds the balance. | PASS |
| F11-concurrent-waiver | Race a payment against a payment-plus-waiver settlement. | Only a valid settlement is accepted; total payment plus waiver never exceeds balance. | PASS |
| F12 | Retry a payment with an identical idempotency key, then reuse it with a changed payload. | Identical retry is replayed once; changed payload returns 409; only one payment row persists. | PASS |
| H01 | Change a fee after generating the first bill. | Historical item retains its old rate; next bill uses the new rate. | PASS |
| H02 | Deactivate a class fee after the first bill. | Historical line remains; future bill excludes it. | PASS |
| H03 | Edit and delete a student charge after billing it. | Historical bill-item snapshots remain unchanged. | PASS |
| H04 | Change a student's class between bills. | Historical bill retains old class rates; later bill uses the new class rates. | PASS |
| H05 | Generate a bill for a student without selected-year enrollment. | Request is rejected and no bill/application persists. | PASS |
| I01 | Inject a failure after bill, items, and charge applications are written. | Transaction rolls back all bill and application writes. | PASS |
| I02 | Inject a failure after payment creation and bill update. | Transaction rolls back payment and balance/status changes. | PASS |
| I03 | Generate bills concurrently and inspect bill numbers. | All persisted bill numbers are unique. | PASS |
| I05 | Delete a student with financial history. | Deletion is blocked; historical bill remains. | PASS |
| I06 | Verify bill-item and payment parent relationships. | Every tested child references its persisted parent. | PASS |
| I07 | Inject a failure after waiver payment and bill update. | Transaction rolls back waiver, payment, and status changes. | PASS |
| I08 | Inject a failure after salary-payment creation and salary update. | Salary-payment row is absent and salary remains PENDING. | PASS |
| C01 | Use a discount starting before the billing period. | All eligible monthly fee months receive the configured discount. | PASS |
| C02 | End a discount at the billing-period boundary. | Inclusive end date discounts the final eligible day/month. | PASS |
| C03 | Use a discount starting after the billing period. | No discount is applied before its start. | PASS |
| C04 | Use a discount expired before the billing period. | No discount is applied. | PASS |
| C05 | Use a discount active for only part of a multi-month period. | Only eligible months are discounted. | PASS |
| C06 | Submit overlapping and adjacent discounts. | Overlap conflicts; immediately adjacent dates are accepted. | PASS |
| C07 | Edit a discount after generating a bill. | Historical bill retains old discount; later bill uses edited discount. | PASS |
| E01 | Generate a new bill after an unpaid previous bill. | Old due remains on its original bill; statement sums both bills. | PASS |
| E02 | Generate a new bill after a partially paid previous bill. | Remaining old due stays on its original bill; statement total is correct. | PASS |
| E03 | Generate a new bill after multiple payments on the previous bill. | Payments reduce only the original bill; statement includes both outstanding bills. | PASS |
| E04 | Generate a new bill after the previous bill is fully settled. | Old due is zero; new bill contains only new-period charges. | PASS |
| E05 | Apply more credit than the available credit balance. | Request is rejected and credit/bill balances do not change. | PASS |
| E06 | Apply credit partially, retry the same request, and apply a second partial amount. | First request applies once; same-key retry replays; second application updates both balances exactly. | PASS |
| E07 | Reuse a credit-application idempotency key with a changed payload. | Request conflicts; only the original application persists. | PASS |
| I09 | Inject credit-application and reversal transaction failures, then reverse successfully. | Failed transactions leave balances/audit unchanged; successful reversal restores balances and preserves reversal audit. | PASS |
| G01 | Apply a fractional discount to a decimal fee. | Rounding is cent-accurate at item and bill level. | PASS |
| G02 | Apply a fractional discount to the smallest positive configured fee. | Discount/net amounts round to cents without a negative or lost balance. | PASS |
| G03 | Calculate a large fee and discount. | Persisted values remain within supported precision and match cent-level expectation. | PASS |
| G04 | Try zero, negative, and excessive fee/payment/bill amounts. | Only documented valid configuration is accepted; invalid billing/settlement is rejected without balance change. | PASS |
| TEA01 | Read the teacher list while the marked billing school is selected in the isolated test process. | Returned teachers all belong to that test-only configured school. | PASS |
| EXP01 | Create/read/update a temporary expense using a BS date. | Stored date round-trips to the selected BS date; only current-run expense is removed. | PASS |
| master | Run the combined bill, payment, waiver, and student-statement workflow. | Bill, payment, waiver, and statement totals reconcile; earlier due remains on its original bill. | PASS |

## Supplemental edge-case matrix

These are additional cases beyond the historical 75. They are intended to exercise boundaries and invalid-input shapes in the inspected APIs/workflows. If a case reveals an unexpected mutation or cannot be cleaned exactly, stop and preserve evidence rather than broadening cleanup.

| ID | Individual edge case | Expected result | Status |
|---|---|---|---|
| EDGE-BILL-01 | Billing period start month is 0 or 13. | HTTP 400; no bill or charge application. | PASS |
| EDGE-BILL-02 | Billing period end month is 0 or 13. | HTTP 400; no bill or charge application. | PASS |
| EDGE-BILL-03 | Start period follows end period in the same year. | HTTP 400; no write. | PASS |
| EDGE-BILL-04 | Billing period crosses Bikram Sambat year-end (month 12 into month 1). | Correct inclusive month count and fee calculation; no Gregorian/BS boundary drift. | PASS |
| EDGE-BILL-05 | Due date is malformed or before the period start. | HTTP 400; no bill. | PASS |
| EDGE-BILL-06 | Student has no active class fee structures but has an eligible student charge. | Bill contains only the eligible charge with exact amount. | PASS |
| EDGE-BILL-07 | All applicable fee lines are zero or absent. | Verify documented empty/zero-total behavior; rejected bill leaves no rows. | PASS |
| EDGE-BILL-08 | Same student bills adjacent periods at a month boundary. | Both non-overlapping periods succeed and monthly quantities have no gap or double count. | PASS |
| EDGE-BILL-09 | Same billing period is requested for two different students. | Both bills succeed independently and receive unique bill numbers. | PASS |
| EDGE-BILL-10 | Same student requests overlapping periods concurrently. | At most one overlapping request persists; no duplicated charge applications. | PASS |
| EDGE-BILL-11 | Cancel an overlapping unpaid bill, then create its replacement. | Cancelled bill does not block replacement; released charges apply once. | PASS |
| EDGE-BILL-12 | Repeat cancellation of an already cancelled bill. | Idempotent/defined response; no second release or mutation of history. | PASS |
| EDGE-FEE-01 | Create/update fee amounts with empty, whitespace, nonnumeric, NaN-like, infinite, negative, zero, and >2-decimal inputs. | Valid documented non-negative values follow existing contract; invalid values are rejected and no unrelated fee row changes. | PASS |
| EDGE-FEE-02 | Create fee with duplicate type/name/class/year. | HTTP 409; existing fee remains byte-for-byte unchanged. | PASS |
| EDGE-FEE-03 | Create/update fee with foreign-school class or academic year. | Rejected; no foreign or primary fee is modified. | PASS |
| EDGE-FEE-04 | Update a temporary fee with a boolean amount. | HTTP 400; the stored fee amount remains unchanged. | PASS |
| EDGE-DISC-01 | Create discounts at 0%, 0.01%, 100%, just above 100%, negative, and nonnumeric percentages. | Only percentages in the documented open/closed interval are accepted; rejected rows do not persist. | PASS |
| EDGE-DISC-02 | Submit empty/whitespace, invalid, and end-before-start discount dates. | HTTP 400; no discount/link rows persist. | PASS |
| EDGE-DISC-03 | Submit duplicate fee types in one discount request. | Duplicate types do not create duplicate links or change the calculated discount. | PASS |
| EDGE-DISC-04 | Apply one 100% discount to each supported class-fee type. | Applicable class fee nets to zero; student BUS/MISC charge remains undiscounted. | PASS |
| EDGE-DISC-05 | Attempt discount on BUS or unsupported fee type. | HTTP 400; no discount/link rows persist. | PASS |
| EDGE-CHARGE-01 | Create/update student charges with zero, negative, fractional, and large quantities/rates. | Validation and decimal precision match the supported model; invalid charges do not persist. | PASS |
| EDGE-CHARGE-02 | Submit unsupported charge fee types and invalid frequencies. | HTTP 400; no charge is written. | PASS |
| EDGE-CHARGE-03 | Submit malformed start/end dates and end before start. | HTTP 400; no charge is written. | PASS |
| EDGE-CHARGE-04 | Create charge for a student not enrolled in the selected year or using a foreign school/year. | Rejected; no charge is written. | PASS |
| EDGE-CHARGE-05 | Bill a charge with inclusive start/end dates at both period boundaries. | Charge appears for exactly the eligible interval and not outside it. | PASS |
| EDGE-CHARGE-06 | Update a temporary charge with boolean quantity or rate. | HTTP 400; the stored quantity, rate, and amount remain unchanged. | PASS |
| EDGE-PAY-01 | Submit payment with missing, blank, whitespace, 200-character, and 201-character idempotency keys. | Missing/blank/too-long keys are rejected; max permitted key behavior is verified without duplicate writes. | PASS |
| EDGE-PAY-02 | Reuse a payment key with changes to amount, method, reference, notes, waiver, waiver reason, and payment date. | Same canonical request replays; each changed payload conflicts with 409. | PASS |
| EDGE-PAY-03 | Submit payment amounts as empty, whitespace, null, boolean, object, malformed text, exponent string, NaN/infinity, negative, zero, and sub-cent decimal. | Non-finite, zero, and negative values are rejected. For coercible and sub-cent inputs, record actual parsing/storage behavior and verify bill/payment totals reconcile; do not assume an undocumented precision rule. | PASS |
| EDGE-PAY-04 | Submit waiver amounts as null, empty, boolean, malformed, negative, zero, fractional, and above balance. | Zero waiver is accepted only as no waiver; positive waiver needs a reason and cannot exceed outstanding balance. | PASS |
| EDGE-PAY-05 | Submit invalid payment method and malformed/future payment dates. | Invalid method and malformed date are rejected; record future-date behavior without imposing a policy not found in the inspected requirements. | PASS |
| EDGE-PAY-06 | Race five identical payment requests using one idempotency key. | One payment row persists; other responses replay the same payment. | PASS |
| EDGE-PAY-07 | Race five distinct payment requests against a limited outstanding balance. | Accepted total never exceeds balance; losers fail without partial writes. | PASS |
| EDGE-PAY-08 | Race payment-only, waiver-only, and combined payment/waiver settlements. | Aggregate settlement never exceeds balance; status and actual-paid total reconcile. | PASS |
| EDGE-CREDIT-01 | Issue credits at Rs. 0.01, zero, negative, >2-decimal, nonnumeric, and unsafe-cent values. | Rs. 0.01 is represented exactly; invalid/unsafe amounts reject without a credit row. | NOT RUN |
| EDGE-CREDIT-02 | Issue credit on academic-year start and end dates, one day outside, and with invalid BS dates. | Inclusive boundaries succeed; outside/invalid dates reject with no credit row. | NOT RUN |
| EDGE-CREDIT-03 | Submit issuance reasons/notes at empty, whitespace, minimum, maximum, and maximum+1 lengths. | Only documented lengths are accepted and stored trimmed. | NOT RUN |
| EDGE-CREDIT-04 | Retry issuance with identical payload and then changed payload under the same key. | Identical request replays same credit; changed payload conflicts; one row persists. | NOT RUN |
| EDGE-CREDIT-05 | Issue credit to a foreign-school student/year and to a student/year from different schools. | Not-found/validation response; no credit is written. | NOT RUN |
| EDGE-CREDIT-06 | Apply credit amounts at $0.01, zero, negative, >2 decimals, beyond available credit, and beyond bill balance. | Valid minimum applies exactly; all invalid/excessive requests reject without changing credit, bill, or applications. | NOT RUN |
| EDGE-CREDIT-07 | Apply a credit to a different student, academic year, cancelled bill, paid bill, and foreign-school bill. | Each relationship/status mismatch rejects with no database mutation. | NOT RUN |
| EDGE-CREDIT-08 | Race five applications against the same credit and bill with different keys. | Locking prevents over-application; all resulting active applications and balances reconcile. | NOT RUN |
| EDGE-CREDIT-09 | Reverse with blank, whitespace, 300-character, and 301-character reasons; reverse twice and race two reversals. | Reason bounds are enforced; only one reversal succeeds; audit and balances remain consistent. | NOT RUN |
| EDGE-CREDIT-10 | Reverse a credit application while other payments/waivers remain on its bill, then reapply the restored credit. | Bill status reflects remaining settlements and available credit; no historical payment/waiver changes. | NOT RUN |
| EDGE-READ-01 | Compare bill, payment, credit, student statement, and finance-overview totals after partial, paid, waived, credited, reversed, and cancelled cases. | All views reconcile to current school-owned rows; cancelled unsettled bills do not inflate outstanding balances. | NOT RUN |
| EDGE-ISO-01 | As primary school, GET each finance collection/detail with marked-school IDs and attempt foreign bill/fee/charge/discount/credit writes. | Foreign rows are never returned or modified; expected 404/400 responses; snapshots unchanged. | NOT RUN |
| EDGE-ISO-02 | In the isolated test-only process, attempt primary-school IDs while marked school is selected. | Other-school records are rejected/omitted, proving reverse-direction school scoping. | NOT RUN |
| EDGE-AUTH-01 | Call protected finance and credit GET/POST routes without a session. | HTTP 401 and no database mutation. | PARTIAL |
| EDGE-AUTH-02 | Call credit routes as a signed non-authorized role, then as the existing authorized QA role. | Non-authorized role gets HTTP 403; authorized role can use intended flows; no role/account changes remain. | NOT RUN |
| EDGE-UI-01 | Use the browser on the primary-school configuration to inspect fee/bill/payment/credit screens and perform only an approved temporary primary-school flow if required. | No marked-school names/records or selector appear; authenticated UI matches primary-school APIs. | PARTIAL |
| EDGE-CONC-01 | Run bounded multi-request bill creation, payment/idempotency, and credit issuance/application batches. | No duplicate bill numbers, double charges, over-settlement, over-application, or partial transactions. | PASS |

## Source-reviewed scope boundaries

- The API proxy protects `/api/*` routes other than authentication routes; authorization must be checked through actual HTTP requests, because direct route-handler tests bypass the proxy.
- Credit issuance/application/reversal has an explicit Accountant-role authorization helper and audited reversal path. The current QA user/role is not to be changed for testing.
- No payment refund/void endpoint was found. Do not simulate a payment reversal by editing or deleting historical payment rows; report the unsupported workflow as a limitation. Credit-application reversals are in scope.
- Fee and payment Decimal precision is not declared as a fixed two-decimal database scale in the inspected Prisma models. Tests will verify exact persisted values and settlement reconciliation, and will not classify undocumented input coercion as a defect without an approved currency rule.

## Test harness and execution notes

1. The gated credit integration selects the explicit primary school and loads the app Prisma client only after setting the QA connection, preventing an accidental localhost connection.
2. The stress runner uses the guarded test-only fixture mapping. This is not a school selector or normal application workflow.
3. Before/after finance snapshots and exact temporary-record cleanup checks passed. The existing fixture mapping and all pre-existing QA financial and school records were preserved.
4. The isolated QA target was checked in-process before each database-writing test. No production system was accessed.

This expanded matrix enumerates every historical case individually and adds bounded edge and concurrency scenarios. Each status reflects the Phase 5 evidence above; unexecuted supplemental edge cases remain explicitly NOT RUN.
