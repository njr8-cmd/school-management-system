# Phase 5 Billing Stress Results

Test target: Guarded isolated QA database (exact target verified in-process)
Fixture: Marked billing-test data used only by the guarded test runner; normal application workflows remained configured to the primary school.

## Final results after retests

| Metric | Result |
|---|---:|
| Unique requested case IDs | 75 (71 billing + 4 credit) |
| Final requested cases passed | 75 |
| Product scenarios failed | 0 |
| Credit IDs passed in separate integration | 4 (included in the 75) |
| Named supplemental edge cases passed | 36 |
| CLEAN-01 cleanup/snapshot sentinel | PASS (additional row) |
| Critical defects | 0 |
| High-priority defects | 0 |

## Execution note

The first unfiltered stress output contained 76 rows: 70 PASS (69 requested cases plus CLEAN-01), two harness failures (B08 and H05), and four credit placeholders marked NOT EXECUTED. This reconciles to 75 unique requested IDs plus the cleanup sentinel. B08 and H05 passed focused retests after harness corrections. E05, E06, E07, and I09 were executed once by the separate gated credit integration; although their IDs appear as NOT EXECUTED placeholders in the stress output, they were not run by the stress runner. Therefore there was no duplicate execution across suites. The initial harness failures were not application defects.

## Individual scenario report

| Test ID | Scenario | Expected | Actual | Result |
|---|---|---|---|---|
| A01 | Normal quarterly bill | Rs. 21,500; UNPAID | {"total":21500,"status":"UNPAID","itemCount":5} | PASS |
| A02 | Multiple separate discounts | Rs. 19,500 | {"total":19500,"discount":2000} | PASS |
| A03 | One discount over multiple fee types | Rs. 18,680 | {"total":18680,"discount":2820} | PASS |
| A04 | Full tuition scholarship | Rs. 8,500 including the undiscounted term charge | {"total":8500,"scholarshipTuitionNet":0,"studentTermCharge":[2000]} | PASS |
| A05 | Student-specific BUS and MISC charges | Rs. 26,700 | {"total":26700} | PASS |
| A06 | Discounts exclude student-specific charges | Rs. 24,900 | {"total":24900,"discount":1800} | PASS |
| A07 | Quantity-based BUS charge | Rs. 26,300 | {"total":26300,"bus":[{"quantity":6,"rate":800,"amount":4800}]} | PASS |
| A08 | Student charge isolation | S001 has no S003 charges | {"studentId":"cmwtawgc6000dscw458fj09ws","studentChargeItems":0} | PASS |
| A09 | Grade-specific fees | Rs. 24,600 | {"total":24600,"feeTypes":["TUITION","ADMISSION","COMPUTER_LAB","EXAM"]} | PASS |
| SC01 | Student-charge frequency amounts | All student-charge frequencies use rate multiplied by their calculated quantity | {"chargeItems":[{"studentId":"cmwtawhit000jscw4vzehu9d4","description":"BUS Monthly","quantity":3,"amount":4500},{"studentId":"cmwtawhit000jscw4vzehu9d4","description":"Student Misc One-Time","quantity":1,"amount":700},{"studentId":"cmwtawi44000mscw4li6i6kon","description":"BUS Monthly","quantity":3,"amount":3000},{"studentId":"cmwtawi44000mscw4li6i6kon","description":"BUS Term Quantity Two","quantity":2,"amount":800},{"studentId":"cmwtawipe000pscw4z85rvo19","description":"BUS Monthly","quantity":3,"amount":3600},{"studentId":"cmwtawipe000pscw4z85rvo19","description":"BUS Annual Quantity Three","quantity":3,"amount":600}]} | PASS |
| SC02 | Unpaid first bill does not repeat charges | Unpaid first bill retains its charges; later bill adds neither duplicate charges nor old balances | {"firstBill":{"status":"UNPAID","total":26700,"studentChargeItems":2},"secondBill":{"total":17300,"studentChargeItems":0},"statement":{"originalBillDue":26700,"subsequentBillDue":17300,"totalDue":44000}} | PASS |
| SC03 | Partial first bill does not repeat charges | Partial settlement stays on the original bill; later bill has no duplicate charge or balance | {"firstBill":{"status":"PARTIAL","outstanding":26600},"secondBill":{"total":17300,"studentChargeItems":0},"statement":{"originalBillDue":26600,"subsequentBillDue":17300,"totalDue":43900}} | PASS |
| SC04 | Charge remains eligible until active dates | A charge outside one period remains available to the next eligible period | {"earlyBillChargeItems":0,"eligibleBillCharge":{"quantity":1,"amount":1200}} | PASS |
| SC05 | Unpaid cancelled bill releases its charge | Cancelled bill remains for audit and charge appears once on its replacement | {"cancelledBill":{"status":"CANCELLED","studentChargeItems":2},"replacementBill":{"status":"UNPAID","studentChargeItems":2},"activeApplications":2,"releasedApplications":2,"statement":{"cancelledBillDue":0,"replacementBillDue":26700,"totalDue":26700}} | PASS |
| SC06 | Settled bill cannot release its charge | Cancellation requires reversal or credit handling before rebilling | {"cancellationStatus":409,"originalStatus":"PARTIAL","activeApplications":2,"nextBillStudentChargeItems":0} | PASS |
| SC07 | Concurrent bills apply each charge once | Concurrent non-overlapping bills create one application per student charge | {"billStatuses":[201,201],"chargeItemsAcrossBills":2,"activeApplications":2} | PASS |
| B01 | Consecutive non-overlapping periods | Both bills succeed | {"bills":["BILL-000001","BILL-000002"],"secondTotal":17300} | PASS |
| B02 | Partial billing overlap | Second bill rejected with 409 | {"secondStatus":409,"error":"This billing period overlaps with an existing bill for this student."} | PASS |
| B03 | Contained billing overlap | Second bill rejected with 409 | {"secondStatus":409,"error":"This billing period overlaps with an existing bill for this student."} | PASS |
| B04 | Exact duplicate period | Second bill rejected with 409 | {"secondStatus":409} | PASS |
| B08 | Invalid bill inputs | All invalid requests rejected | Focused retest selected a year from the QA-only fixture school; all invalid inputs rejected and no bill remained. | PASS |
| B09 | Concurrent identical bill requests | Exactly one bill is created | {"statuses":[201,409],"persistedBills":1} | PASS |
| D01 | Annual class fee billed once | Admission fee appears only in the first eligible bill | [{"period":"P1","admissionCount":1},{"period":"P2","admissionCount":0},{"period":"P3","admissionCount":0},{"period":"P4","admissionCount":0}] | PASS |
| D02 | Term fee schedule | One exam fee in each configured term | [{"period":"P1","examCount":1},{"period":"P2","examCount":1},{"period":"P3","examCount":1},{"period":"P4","examCount":1}] | PASS |
| D03 | Class one-time fee | Class miscellaneous appears once in the academic year | [{"period":"P1","oneTimeCount":1},{"period":"P2","oneTimeCount":0},{"period":"P3","oneTimeCount":0},{"period":"P4","oneTimeCount":0}] | PASS |
| D04 | One-time student charge start date | Charge first appears in its first eligible period only | [{"period":"P1","count":0},{"period":"P2","count":0},{"period":"P3","count":1},{"period":"P4","count":0}] | PASS |
| D05 | Two-month inclusive billing period | Tuition Rs. 10,000; lab Rs. 1,000 | {"tuition":10000,"lab":1000,"total":19600} | PASS |
| F01 | Full payment | Bill becomes PAID | {"amount":21500,"status":"PAID"} | PASS |
| F02 | Multiple partial payments | Total actual payments Rs. 21,500 | {"payments":[5000,7000,4500,5000],"status":"PAID"} | PASS |
| F03 | Payment plus waiver | Rs. 8,500 outstanding and PARTIAL | {"outstanding":8500,"waiver":3000,"paidAmount":10000} | PASS |
| F04 | Multiple waivers and payments | Rs. 18,000 paid; Rs. 3,500 waived; PAID | {"paid":18000,"waived":3500,"status":"PAID"} | PASS |
| F05 | Waiver reason required | Null, empty, whitespace reasons rejected | {"statuses":[400,400,400]} | PASS |
| F06 | Excessive waiver rejected | Settlement over bill balance rejected | {"status":400,"error":"Payment plus waiver cannot exceed the outstanding balance of Rs. 21500.00."} | PASS |
| F07 | Payment plus waiver cannot over-settle | Rs. 22,000 settlement rejected | {"status":400,"error":"Payment plus waiver cannot exceed the outstanding balance of Rs. 21500.00."} | PASS |
| F08 | Payment on paid bill rejected | Further payment rejected | {"status":400,"error":"This bill has no outstanding balance."} | PASS |
| F09 | Payment on cancelled bill rejected | Payment rejected | {"status":400,"error":"Payment cannot be recorded against a cancelled bill.","cancellationSetup":"Direct QA status update; no cancellation API exists."} | PASS |
| F10 | Zero and negative payments rejected | Both requests rejected | {"statuses":[400,400]} | PASS |
| F11 | Concurrent payments exceeding balance | At most one Rs. 7,000 payment accepted on Rs. 10,000 bill | {"statuses":[201,400],"persistedPaymentSum":7000} | PASS |
| F12 | Duplicate payment request | Repeated identical request must not post twice | {"concurrentStatuses":[201,200],"reusedKeyStatus":409,"persistedDuplicates":1} | PASS |
| H01 | Fee change preserves old bill snapshot | Old line remains unchanged; next period uses new rate | {"oldAmount":15000,"newAmount":18000} | PASS |
| H02 | Deactivated class fee excluded from future bills | Historical item retained; future bill excludes it | {"oldBillHasLab":true,"newBillHasLab":false} | PASS |
| H03 | Student charge edits and deletion preserve historical bill items | Changing or deleting a source charge leaves its original bill-item snapshot unchanged | {"unchangedBillItemSnapshots":3,"activeApplications":3,"deletedChargeStatus":200} | PASS |
| H04 | Class change preserves historical fees | Old Grade 5 bill retained; next bill uses Grade 6 fees | {"oldRate":5000,"newRate":6000} | PASS |
| H05 | Missing enrollment rejected | Student without selected-year enrollment is rejected | Focused retest created an exact temporary student with no enrollment; request rejected and student/bill cleanup verified. | PASS |
| I03 | Concurrent unique bill numbers | All concurrently created bill numbers are unique | {"statuses":[201,201],"billNumbers":["BILL-000001","BILL-000002"]} | PASS |
| I05 | Financial history after student deletion | Historical bills must not be silently deleted | {"deleteStatus":409,"billRetained":true} | PASS |
| I06 | Database relationship integrity | All bill items and payments reference valid parents | {"billItems":5,"payments":1,"billNumber":"BILL-000001"} | PASS |
| B06 | Multi-year billing, payment, and duplicate prevention | Previous-year balance remains on its original bill; new-year fees and discount calculate independently | {"previousYearDue":20500,"nextYearBill":26440,"nextYearDiscount":2160,"nextYearDue":25440,"duplicateStatus":409} | PASS |
| C01 | Discount begins before billing period | Pre-period start remains eligible for all three monthly fee months | {"tuitionDiscount":1500} | PASS |
| C02 | Discount ends at billing-period boundary | Inclusive end on the final billing day discounts all three monthly fee months | {"periodEnd":"2026-07-16T18:14:59.999Z","tuitionDiscount":1500} | PASS |
| C03 | Discount begins after billing period | No discount is applied before its start date | {"tuitionDiscount":0} | PASS |
| C04 | Expired discount | A discount ending before the billing period is excluded | {"tuitionDiscount":0} | PASS |
| C05 | Partial-period monthly discount | Only the one eligible month of three receives the 10% tuition discount | {"tuitionAmount":15000,"tuitionDiscount":500,"tuitionNet":14500} | PASS |
| C06 | Overlapping and adjacent discounts | Overlapping fee/date ranges return 409; a discount starting the following day is accepted | {"overlapStatus":409,"adjacentStatus":201,"savedDiscounts":2} | PASS |
| C07 | Discount edit preserves historical bill snapshot | Existing bill keeps its 10% discount; next bill uses the edited 20% discount | {"oldDiscount":1500,"newDiscount":3000} | PASS |
| E01 | Unpaid prior bill remains on original bill | New bill excludes prior unpaid balance; account statement retains both bill dues | {"previousBillDue":"21500","nextBillTotal":"17300","statementDue":38800} | PASS |
| E02 | Partial prior bill remains on original bill | Prior bill retains its Rs. 16,500 balance; new bill does not carry it forward | {"priorBillDue":16500,"nextBillTotal":"17300","statementDue":33800} | PASS |
| E03 | Multiple prior payments remain allocated to original bill | Three payments reduce only the original bill; the subsequent bill contains no prior balance | {"paymentCount":3,"paidAmount":4000,"nextBillTotal":"17300","statementDue":34800} | PASS |
| E04 | Fully settled prior bill is not carried forward | A paid prior bill has zero due; new bill contains only new-year charges | {"oldStatus":"PAID","oldDue":0,"nextBillTotal":"17300","statementDue":17300} | PASS |
| F11-concurrent-waiver | Concurrent payment and waiver cannot over-settle | Only one settlement succeeds; total payment plus waiver stays within the bill balance | {"statuses":[201,400],"paid":8000,"waived":7000,"remainingDue":6500} | PASS |
| G01 | Decimal amounts and fractional discount rounding | Rs. 0.15 fee rounds 50% discount to Rs. 0.08 and net to Rs. 0.07 | {"amount":0.15,"discount":0.08,"net":0.07,"billTotal":20000.07} | PASS |
| G02 | Smallest positive fee and rounding | Rs. 0.03 fee rounds a 50% discount to Rs. 0.02 and preserves a Rs. 0.01 balance | {"amount":0.03,"discount":0.02,"net":0.01} | PASS |
| G03 | Large amount precision | Large monthly fee, percentage discount, and bill total remain cent-accurate | {"tuitionAmount":29999999999.97,"tuitionDiscount":3000000000,"tuitionNet":26999999999.97,"billTotal":27000006499.97} | PASS |
| G04 | Zero, negative, and excessive amounts | Zero-value bills and negative fees/payments are rejected; overpayment leaves balances unchanged | {"zeroFeeStatus":201,"negativeFeeStatus":400,"zeroBillStatus":409,"negativePaymentStatus":400,"zeroPaymentStatus":400,"overpaymentStatus":400,"unchangedPaidAmount":0} | PASS |
| TEA01 | Teacher list school scoping | Teacher list contains only records from the configured school | {"teacherCount":1,"schoolScoped":true} | PASS |
| EXP01 | Expense form BS date contract | Expense creation and editing preserve the selected Bikram Sambat date | {"status":200,"amount":44.75,"expenseDateBS":{"year":2083,"month":8,"day":7}} | PASS |
| I01 | Bill generation transaction rollback | Failure after bill, bill items, and charge applications are written leaves none persisted | {"injected":true,"status":500,"persistedBills":0,"activeApplications":0} | PASS |
| I02 | Payment and balance-allocation rollback | Failure after payment creation and bill update leaves neither payment nor balance change | {"injected":true,"status":500,"paymentPersisted":false,"paidAmount":0} | PASS |
| I07 | Waiver transaction rollback | Failure after waiver payment and bill update leaves neither the waiver nor status change | {"injected":true,"status":500,"paymentPersisted":false,"billStatus":"UNPAID"} | PASS |
| I08 | Salary payment transaction rollback | Failure after salary-payment creation and salary update leaves the payment absent and salary pending | {"injected":true,"paymentCount":0,"status":"PENDING"} | PASS |
| master | Master bill, payment, waiver, and statement workflow | Successful bill settlement is reflected consistently in payments and account statements; previous due remains on its original bill | {"firstBillDue":15500,"secondBillTotal":"17300","statementDue":32800,"paymentCount":1} | PASS |
| E05 | Excess credit application rejected | Separate integration rejected over-application without changing balances | Passed in the separate gated credit integration | PASS (separate integration) |
| E06 | Partial credit application | Partial application and identical retry updated balances exactly once | Passed in the separate gated credit integration | PASS (separate integration) |
| E07 | Duplicate credit application | Changed-payload key reuse conflicts without a second application | Passed in the separate gated credit integration | PASS (separate integration) |
| I09 | Credit application transaction rollback | Injected application/reversal failures rolled back; reversal preserved its audit record | Passed in the separate gated credit integration | PASS (separate integration) |
| CLEAN-01 | Financial fixture snapshot and temporary-row cleanup | All pre-existing financial rows and school records remain unchanged; current-run rows are absent. | {"before":"c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417","after":"c8822d4e6231f28062e5bda6ecf4d046cfc71ed2799a943d418b518fa8590417","counts":{"schools":2,"academicYears":4,"enrollments":112,"fees":129,"discounts":19,"charges":22,"bills":0,"billItems":0,"payments":0,"chargeApplications":0,"credits":2,"creditApplications":0,"expenses":10,"salaries":40,"salaryPayments":16}} | PASS |

## Defect report

### B08: Invalid bill-input harness setup
- Initial reproduction: The harness chose another valid academic year, and the fixture student was enrolled there.
- Expected: The invalid relationship should be rejected.
- Actual: The API correctly created a valid bill; this was a fixture-selection error, not an application defect.
- Severity: None (test-harness defect).
- Fix/retest: The focused retest selected a year from the QA-only fixture, received the expected rejection, and left no bill. Final cleanup/snapshot checks passed.

### H05: Missing-enrollment harness setup
- Initial reproduction: The assumed un-enrolled fixture student was enrolled in both available years.
- Expected: A student without selected-year enrollment should be rejected.
- Actual: The API correctly created a bill for the enrolled student; this was a fixture-selection error, not an application defect.
- Severity: None (test-harness defect).
- Fix/retest: The focused retest created a clearly marked temporary student with no enrollment, observed the expected rejection, removed that exact student, and verified no bill remained.

## Inspection findings and scope limitations

- The production seed `prisma/seed.ts` deletes existing records and was not run.
- Test seed data uses a separately marked school and academic year in the explicitly authorized test branch.
- Student-specific charges are limited to BUS and MISCELLANEOUS and are not discounted by the billing route.
- StudentCharge has no active/deactivation flag. Bill cancellation is allowed only without payments or credits; it preserves the bill and releases charge applications for replacement.
- StudentChargeApplication retains billing history independently from the source charge; historical BillItem descriptions and amounts are snapshots.
- Previous dues are not carried forward by bill generation.
- Discount selection uses the first match without an explicit order, and BillItem does not store the selected discount identity.
- Payment creation requires an Idempotency-Key; identical retries replay the existing payment and changed payloads with the same key are rejected.
- Concurrent bill-number allocation now uses a transaction-scoped advisory lock; I03 verifies unique numbers.
- Student deletion is blocked when bills exist, with a database-level RESTRICT constraint as a second safeguard.

The requested legacy billing and credit scenarios passed after the focused retests. Broader supplemental UI, authorization, and credit-boundary cases remain unexecuted; see the Phase 5 test matrix and consolidated report.
