# Phase 5 Fees, Billing, Payments, and Credits QA Report

**Assessment date:** 2026-11-24  
**Status:** Phase 5 verification complete and approved. Phase 6 was subsequently authorized and is submitted separately for review.

## Scope and safety

The application remains a single-school application: normal APIs and browser workflows resolve the configured primary school. The pre-existing artificial billing-test fixture is QA-only data, was not exposed through normal workflows, and was not changed. No school creation, deletion, switching, or multi-school feature was added.

Only the existing isolated QA database was used. No production system was accessed; the database was not reset or reseeded; no pre-existing financial, academic, or school records were modified. No extra cross-school probe records were created. Temporary test records were cleaned by exact IDs and verified absent.

## Results

- **Unique requested cases:** 75 case IDs total: 71 non-credit billing cases and four credit cases (E05, E06, E07, I09). All 75 have final status PASS.
- **Initial stress-run count:** its report contained 76 rows because it included the separate cleanup sentinel CLEAN-01. The 70 PASS consisted of 69 requested case rows plus CLEAN-01; B08 and H05 initially failed because of test-harness fixture assumptions; the four credit rows were marked NOT EXECUTED by that runner. Thus 69 + 2 + 4 = 75 requested case IDs, with CLEAN-01 as the 76th report row.
- **Focused retests and credit coverage:** B08 and H05 passed focused retests. E05, E06, E07, and I09 each passed once in the gated credit integration (1/1 test), which covered issuance replay, changed-payload conflict, partial and excessive application, same-student/year validation, concurrency, transaction rollback, reversal, and duplicate reversal. Those four IDs appear as NOT EXECUTED placeholders in the stress-runner report; they were not executed by that runner, so there is no overlap in actual execution.
- **Supplemental database edges:** all 36 named cases passed. This includes invalid numeric inputs, payment idempotency, charge/fee updates, billing boundaries, settlement behavior, and concurrency.
- **School-scope regression:** the guarded database/API scope regression passed. Rejected foreign-school operations left records unchanged.
- **Browser dashboard:** logged in with a temporary QA ADMIN because the existing Accountant password was unavailable locally. The dashboard displayed **QA Academy - Fictional Test School**, **52 students**, **8 teachers**, **12 classes**, **active academic year 2083**, **52 active enrollments**, and **0 outstanding bills**. Authenticated school, student, teacher, class, academic-year, and bill APIs returned HTTP 200; their counts matched the dashboard. No foreign-school students appeared in the primary-school API results. The temporary account was deleted by exact ID and its absence verified.
- **Anonymous access:** anonymous finance API requests returned HTTP 401.
- **Static/build validation:** `npm run lint`, `npx tsc --noEmit`, and `npm run build -- --webpack` passed.

The exact case IDs and final statuses are listed individually in the [test matrix](./QA-PHASE5-FEES-BILLING-TEST-MATRIX.md). **All IDs below are PASS:**

```text
A01, A02, A03, A04, A05, A06, A07, A08, A09
SC01, SC02, SC03, SC04, SC05, SC06, SC07
B01, B02, B03, B04, B06, B08, B09
D01, D02, D03, D04, D05
F01, F02, F03, F04, F05, F06, F07, F08, F09, F10, F11, F11-concurrent-waiver, F12
H01, H02, H03, H04, H05
I01, I02, I03, I05, I06, I07, I08, I09
C01, C02, C03, C04, C05, C06, C07
E01, E02, E03, E04, E05, E06, E07
G01, G02, G03, G04
TEA01, EXP01, master
```

CLEAN-01 is a separate PASS cleanup/snapshot check, not a requested case ID.

The browser check used the temporary ADMIN account, not the existing Accountant account. The QA baseline had no bills, so the browser check did not use a synthetic foreign-school bill to challenge the outstanding-bill count. Source review confirms the dashboard filters bills and enrollments to the configured school's records; this specific data-present browser scenario remains unverified.

## Data integrity and cleanup

The before/after financial snapshot hash matched exactly:

`c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417`

Final counts matched the baseline: 4 academic years, 112 enrollments, 129 fee structures, 19 discounts, 22 student charges, 0 bills, 0 bill items, 0 payments, 2 credits, 0 credit applications, 10 expenses, 40 salaries, and 16 salary payments. The QA-only fixture and configured primary school records remained unchanged. No marked credit-test year/user/bill remained. The browser-only temporary ADMIN was deleted and verified absent.

## Defect found and fixed

### Financial numeric-input coercion — Medium, fixed

- **Reproduction:** submit boolean, null, empty, object, or otherwise non-finite numeric values to fee, payment, student-charge, or discount endpoints.
- **Expected:** reject invalid numeric shapes with HTTP 400 and leave the database unchanged.
- **Actual before fix:** generic `Number(...)` coercion could interpret non-number JSON values such as booleans or empty strings as numeric amounts.
- **Fix:** added a shared parser accepting finite numbers and non-empty numeric strings only; wired it into the four finance APIs.
- **Regression:** the 36 named database edge cases passed, including invalid values and unchanged-record assertions.

The two initial B08/H05 failures were test-fixture assumptions only. Their corrected retests passed; no billing-calculation defect was found.

## Remaining limitations

- Existing QA Accountant browser login was not tested because its password was unavailable; the existing account was not changed.
- Full browser CRUD for finance pages was not rerun. Browser verification focused on the dashboard and school-scoped read APIs.
- The fixture had no outstanding bills, so a browser-level positive outstanding-bill isolation case remains unverified.
- Expanded credit-boundary, comprehensive role-authorization, and broader finance UI cases marked NOT RUN in the matrix remain follow-up coverage.
- Production configuration, backup/restore, and recovery rehearsal remain unverified.

## Files changed for Phase 5

- `src/lib/finance/number-input.ts`
- `src/app/api/fees/route.ts`
- `src/app/api/payments/route.ts`
- `src/app/api/student-charges/route.ts`
- `src/app/api/student-discounts/route.ts`
- `tests/billing/billing-stress-test.js`
- `tests/billing/student-credit.integration.test.js`
- `tests/billing/phase5-edge.integration.test.js`
- `tests/billing/helpers/finance-snapshot.js`
- `tests/billing/QA-PHASE5-BILLING-STRESS-RESULTS.md`
- `QA-PHASE5-FEES-BILLING-TEST-MATRIX.md`
- `QA-PHASE5-FEES-BILLING-REPORT.md`
- `QA-TEST-INVENTORY.md`
- `DEPLOYMENT-READINESS.md`

## Verification references

- [Phase 5 test matrix](./QA-PHASE5-FEES-BILLING-TEST-MATRIX.md)
- [Detailed legacy stress results](./tests/billing/QA-PHASE5-BILLING-STRESS-RESULTS.md)
