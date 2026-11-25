import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getConfiguredSchool,
  SchoolConfigurationError,
} from "@/lib/school";
import { dateToBS, BS_MONTHS } from "@/lib/nepali-date";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Banknote,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  Plus,
  ReceiptText,
  Users,
  WalletCards,
} from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  let school;
  let schoolConfigurationError: string | null = null;
  try {
    school = await getConfiguredSchool();
  } catch (error) {
    if (!(error instanceof SchoolConfigurationError)) {
      throw error;
    }
    school = null;
    schoolConfigurationError = error.message;
  }

  if (!school) {
    return (
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#eadfd4] bg-white p-8 shadow-sm sm:p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fbefe2] text-[#81392e]">
          <CalendarDays className="h-7 w-7" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-[#9b6b5b]">
          Setup required
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#342724]">
          {schoolConfigurationError ? "School configuration error" : "Configure your school"}
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-[#756b63]">
          {schoolConfigurationError ??
            "School configuration is missing. Configure the school profile before using dashboard statistics or school modules."}
        </p>
        {session.user.role === "ADMIN" && !schoolConfigurationError && (
          <Link
            href="/dashboard/school"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#702d27] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#58231f]"
          >
            Configure school <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
        {session.user.role === "ACCOUNTANT" && (
          <p className="mt-7 text-sm text-[#756b63]">
            Ask an administrator to configure the school profile.
          </p>
        )}
      </div>
    );
  }

  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { schoolId: school.id, isActive: true },
    orderBy: [{ startDate: "desc" }, { id: "asc" }],
  });
  const [studentCount, teacherCount, classCount, activeEnrollmentCount, outstandingBillCount] =
    await Promise.all([
      prisma.student.count({ where: { schoolId: school.id } }),
      prisma.teacher.count({ where: { schoolId: school.id } }),
      prisma.class.count({ where: { schoolId: school.id } }),
      activeAcademicYear
        ? prisma.enrollment.count({
            where: {
              academicYearId: activeAcademicYear.id,
              student: { is: { schoolId: school.id } },
              class: { is: { schoolId: school.id } },
            },
          })
        : Promise.resolve(0),
      activeAcademicYear
        ? prisma.bill.count({
            where: {
              academicYearId: activeAcademicYear.id,
              student: { is: { schoolId: school.id } },
              status: { in: ["UNPAID", "PARTIAL"] },
            },
          })
        : Promise.resolve(0),
    ]);

  const bsToday = dateToBS(new Date());
  const formattedDate = `${bsToday.day} ${BS_MONTHS[bsToday.month - 1]} ${bsToday.year} BS`;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = session.user?.name?.trim().split(/\s+/)[0] || "there";

  const stats = [
    {
      label: "Students",
      value: studentCount.toLocaleString("en-NP"),
      note: `${activeEnrollmentCount.toLocaleString("en-NP")} enrolled this year`,
      icon: Users,
      color: "bg-[#f7ebe2] text-[#8b3e31]",
      href: "/dashboard/students",
    },
    {
      label: "Teachers",
      value: teacherCount.toLocaleString("en-NP"),
      note: "Teaching staff",
      icon: GraduationCap,
      color: "bg-[#e9f1ea] text-[#477153]",
      href: "/dashboard/teachers",
    },
    {
      label: "Classes",
      value: classCount.toLocaleString("en-NP"),
      note: "Configured at school",
      icon: BookOpenCheck,
      color: "bg-[#edf0f7] text-[#4c5f8c]",
      href: "/dashboard/classes",
    },
    {
      label: "Outstanding bills",
      value: outstandingBillCount.toLocaleString("en-NP"),
      note: activeAcademicYear?.name ?? "No active academic year",
      icon: CreditCard,
      color: "bg-[#fbf2df] text-[#96702d]",
      href: "/dashboard/finance/bills",
    },
  ];

  const quickActions = [
    {
      title: "Record a payment",
      description: "Add a student fee payment",
      href: "/dashboard/finance/payments",
      icon: Banknote,
      tone: "text-[#477153] bg-[#e9f1ea]",
    },
    {
      title: "Create a bill",
      description: "Prepare a student invoice",
      href: "/dashboard/finance/bills/new",
      icon: Plus,
      tone: "text-[#8b3e31] bg-[#f7ebe2]",
    },
    {
      title: "Record an expense",
      description: "Log today’s school spending",
      href: "/dashboard/finance/expenses",
      icon: ReceiptText,
      tone: "text-[#4c5f8c] bg-[#edf0f7]",
    },
    {
      title: "View finance overview",
      description: "Review cashflow and reports",
      href: "/dashboard/finance",
      icon: WalletCards,
      tone: "text-[#96702d] bg-[#fbf2df]",
    },
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-[#632824] px-6 py-8 text-white shadow-xl shadow-[#632824]/10 sm:px-9 sm:py-10 lg:px-11">
        <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-2 -top-12 h-56 w-56 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-[#c8956f]/20 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-sm font-medium text-[#f0d7c6]">
              <span className="h-2 w-2 rounded-full bg-[#d7bd85]" />
              {formattedDate}
            </p>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[42px]">
              {greeting}, {firstName}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base">
              Welcome to {school.name}. Here’s your school at a glance and the
              tools you use most.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-4 backdrop-blur-sm md:min-w-56">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-white/55">
              Active academic year
            </p>
            <p className="mt-2 text-xl font-semibold">
              {activeAcademicYear?.name ?? "Not set"}
            </p>
            {!activeAcademicYear && (
              <Link
                href="/dashboard/academic-years"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#f0d7c6] hover:text-white"
              >
                Set up an academic year <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section aria-label="School statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              href={stat.href}
              className="group rounded-2xl border border-[#ebe4dc] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#d8c4b4] hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${stat.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-[#b8aaa0] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#81392e]" />
              </div>
              <p className="mt-5 text-sm font-medium text-[#766b63]">{stat.label}</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-[#302925]">{stat.value}</p>
              <p className="mt-1 text-xs text-[#9a8f85]">{stat.note}</p>
            </Link>
          );
        })}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b6b5b]">
              Shortcuts
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#302925]">
              Get things done
            </h2>
          </div>
          <Link
            href="/dashboard/finance"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#81392e] hover:text-[#5c2722]"
          >
            Go to finance <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.title}
                href={action.href}
                className="group flex items-center gap-4 rounded-2xl border border-[#ebe4dc] bg-white p-4 shadow-sm transition hover:border-[#d8c4b4] hover:shadow-md"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${action.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#362e29]">{action.title}</span>
                  <span className="mt-1 block truncate text-xs text-[#8e837a]">{action.description}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-[#b8aaa0] transition group-hover:text-[#81392e]" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-[#ebe4dc] bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7ebe2] text-[#8b3e31]">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-[#302925]">Your school, in one place</h2>
              <p className="mt-1 text-sm text-[#8e837a]">People, learning, and finances together.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: "People", detail: "Student and teacher profiles", href: "/dashboard/students" },
              { label: "Academics", detail: "Terms, exams, and results", href: "/dashboard/academic-terms" },
              { label: "Finance", detail: "Bills, payments, and expenses", href: "/dashboard/finance" },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-xl bg-[#faf8f5] p-4 transition hover:bg-[#f4eee8]"
              >
                <p className="text-sm font-semibold text-[#4d3933]">{item.label}</p>
                <p className="mt-1 text-xs leading-5 text-[#8e837a]">{item.detail}</p>
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-2xl border border-[#e6d9cd] bg-[#f4ece3] p-5 sm:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#9b6b5b]">
              School profile
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#432c27]">
              {school.name}
            </h2>
            {school.address ? (
              <p className="mt-2 text-sm leading-6 text-[#766b63]">{school.address}</p>
            ) : (
              <p className="mt-2 text-sm text-[#766b63]">Add an address to complete your school profile.</p>
            )}
          </div>
          {session.user.role === "ADMIN" && (
            <Link
              href="/dashboard/school"
              className="mt-5 inline-flex w-fit items-center gap-2 rounded-lg border border-[#d6c3b4] bg-white/70 px-4 py-2.5 text-sm font-semibold text-[#70342c] transition hover:bg-white"
            >
              View school profile <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
