"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

import {
  BadgePercent,
  Building2,
  CalendarDays,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  CreditCard,
  ReceiptText,
  ListPlus,
  FilePlus,
  FileText,
  GraduationCap,
  House,
  LayoutDashboard,
  Menu,
  School,
  SlidersHorizontal,
  BookOpen,
  Library,
  ListTree,
  ScrollText,
  SquarePen,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

type DashboardShellProps = {
  children: ReactNode;
  userEmail: string;
  userName: string;
  userRole: string;
  schoolName: string;
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        label: "Students",
        href: "/dashboard/students",
        icon: Users,
      },
      {
        label: "Teachers",
        href: "/dashboard/teachers",
        icon: GraduationCap,
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Finance Overview",
        href: "/dashboard/finance",
        icon: WalletCards,
      },
      {
        label: "Fee Structures",
        href: "/dashboard/finance/fees",
        icon: SlidersHorizontal,
      },
      {
        label: "Discounts",
        href: "/dashboard/finance/discounts",
        icon: BadgePercent,
      },
      {
        label: "Student Charges",
        href: "/dashboard/finance/student-charges",
        icon: FileText,
      },
      {
        label: "Bulk Student Adjustments",
        href: "/dashboard/finance/bulk-adjustments",
        icon: ListPlus,
      },
      {
        label: "Bills",
        href: "/dashboard/finance/bills",
        icon: ClipboardList,
      },
      {
        label: "Create New Bill",
        href: "/dashboard/finance/bills/new",
        icon: FilePlus,
      },
      {
        label: "Payments",
        href: "/dashboard/finance/payments",
        icon: CreditCard,
      },
      {
        label: "Student Credits",
        href: "/dashboard/finance/credits",
        icon: WalletCards,
      },
      {
        label: "School Expenses",
        href: "/dashboard/finance/expenses",
        icon: ReceiptText,
      },
      {
        label: "Teacher Salaries",
        href: "/dashboard/finance/teacher-salaries",
        icon: WalletCards,
      },
    ],
  },
  {
    label: "Academics",
    items: [
      {
        label: "Academic Years",
        href: "/dashboard/academic-years",
        icon: CalendarDays,
      },
      {
        label: "Academic Terms",
        href: "/dashboard/academic-terms",
        icon: ListTree,
      },
      {
        label: "Classes",
        href: "/dashboard/classes",
        icon: School,
      },
      {
        label: "Subjects",
        href: "/dashboard/subjects",
        icon: BookOpen,
      },
      {
        label: "Class Subjects",
        href: "/dashboard/class-subjects",
        icon: Library,
      },
      {
        label: "Exams",
        href: "/dashboard/exams",
        icon: ScrollText,
      },
      {
        label: "Marks",
        href: "/dashboard/marks",
        icon: SquarePen,
      },
      {
        label: "Grade Scales",
        href: "/dashboard/grade-scales",
        icon: SlidersHorizontal,
      },
      {
        label: "Results",
        href: "/dashboard/results",
        icon: ClipboardList,
      },
    ],
  },
  {
    label: "School",
    items: [
      {
        label: "School Information",
        href: "/dashboard/school",
        icon: Building2,
        adminOnly: true,
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        label: "User Accounts",
        href: "/dashboard/users",
        icon: Users,
        adminOnly: true,
      },
    ],
  },
];

function isNavigationItemActive(pathname: string, href: string): boolean {
  if (pathname === href) {
    return true;
  }

  // These are section overview links, not parent links
  // for every page beneath them.
  if (href === "/dashboard" || href === "/dashboard/finance") {
    return false;
  }

  // When creating a bill, highlight Create New Bill,
  // not both it and the Bills link.
  if (href === "/dashboard/finance/bills") {
    return pathname.startsWith(`${href}/`) && pathname !== `${href}/new`;
  }

  // Keep the corresponding navigation item active
  // on detail pages beneath its route.
  return pathname.startsWith(`${href}/`);
}

function formatRole(role: string): string {
  if (role === "ADMIN") {
    return "Administrator";
  }
  if (role === "ACCOUNTANT") {
    return "Accountant";
  }

  return "Unknown role";
}

function SidebarContents({
  pathname,
  userEmail,
  userName,
  userRole,
  schoolName,
  onNavigate,
  onClose,
}: {
  pathname: string;
  userEmail: string;
  userName: string;
  userRole: string;
  schoolName: string;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const displayName = userName || userEmail || "Signed-in user";
  const initials = displayName.charAt(0).toUpperCase();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      navigationGroups.map((group) => [
        group.label,
        group.items.some((item) => isNavigationItemActive(pathname, item.href)),
      ]),
    ),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand */}

      <div className="flex h-[88px] shrink-0 items-center gap-3 border-b border-[#e9e2d9] px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Go to dashboard home"
          title="Go to dashboard home"
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg py-2"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#702d27] text-white shadow-sm shadow-[#702d27]/15 transition group-hover:bg-[#5d2521]">
            <School className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold tracking-tight text-[#342724] group-hover:text-[#702d27]">
              {schoolName}
            </span>
            <span className="mt-1 block text-xs text-[#95877d]">
              Administration Portal
            </span>
          </div>
        </Link>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-[#776a61] transition hover:bg-[#f4ece5] hover:text-[#632824] lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}

      <nav
        aria-label="Main navigation"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-5 pt-3"
      >
        {navigationGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || userRole === "ADMIN",
          );
          if (visibleItems.length === 0) {
            return null;
          }

          const isOpen = openGroups[group.label] ?? false;
          const containsActiveItem = visibleItems.some((item) =>
            isNavigationItemActive(pathname, item.href),
          );
          return (
          <div key={group.label} className="rounded-xl">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.label]: !isOpen,
                }))
              }
              className={[
                "flex w-full items-center justify-between rounded-lg px-3 pb-2 pt-4 text-left text-[10px] font-bold uppercase tracking-[0.18em] transition",
                containsActiveItem ? "text-[#7c332b]" : "text-[#9b8e84] hover:text-[#5c4c43]",
              ].join(" ")}
            >
              <span>{group.label}</span>
              <ChevronDown
                className={[
                  "h-3.5 w-3.5 transition-transform",
                  isOpen ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {isOpen && <div className="space-y-1 pb-1">
              {visibleItems.map((item) => {
                const active = isNavigationItemActive(pathname, item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition duration-150",
                      active
                        ? "bg-[#f5e9df] text-[#632824] shadow-sm shadow-[#632824]/[0.04]"
                        : "text-[#685d55] hover:bg-[#f7f2ed] hover:text-[#392c27]",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        active
                          ? "text-[#8a342d]"
                          : "text-[#a99c91] group-hover:text-[#81392e]",
                      ].join(" ")}
                    />

                    <span className="min-w-0 flex-1">{item.label}</span>

                    {active && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-[#8a342d]" />
                    )}
                  </Link>
                );
              })}
            </div>}
          </div>
          );
        })}
      </nav>

      {/* User information and logout */}

      <div className="shrink-0 border-t border-[#e9e2d9] bg-[#faf8f5] p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1e2d5] text-sm font-bold text-[#632824]">
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold text-[#342724]"
              title={displayName}
            >
              {displayName}
            </p>

            <p className="mt-1 truncate text-xs text-[#95877d]" title={userEmail}>
              {userEmail ? `${formatRole(userRole)} · ${userEmail}` : formatRole(userRole)}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

export default function DashboardShell({
  children,
  userEmail,
  userName,
  userRole,
  schoolName,
}: DashboardShellProps) {
  const pathname = usePathname() ?? "/dashboard";
  const [menuOpen, setMenuOpen] = useState(false);

  const allItems = navigationGroups.flatMap((group) => group.items);

  const currentPage = allItems
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];

  const pageTitle = currentPage?.label ?? "Dashboard";

  return (
    <div className="min-h-screen bg-[#f8f6f2] text-[#292522]">
      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-[#211b18]/35 backdrop-blur-[2px]"
          />

          <aside
            aria-label="Dashboard navigation"
            className="relative z-10 flex h-full w-[320px] max-w-[88vw] flex-col border-r border-[#e9e2d9] bg-[#fffdfa] text-[#342724] shadow-2xl"
          >
            <SidebarContents
              key={pathname}
              pathname={pathname}
              userEmail={userEmail}
              userName={userName}
              userRole={userRole}
              schoolName={schoolName}
              onNavigate={() => setMenuOpen(false)}
              onClose={() => setMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main application */}

      <div className="min-h-screen">
        {/* Top bar */}

        <header className="sticky top-0 z-20 border-b border-[#e9e2d9] bg-[#fffdfa]/95 shadow-sm shadow-[#4d3425]/[0.02] backdrop-blur-md">
          <div className="flex min-h-[76px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? "Close navigation" : "Open navigation"}
                aria-expanded={menuOpen}
                aria-haspopup="dialog"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e9e2d9] bg-white text-[#632824] transition hover:border-[#d7c3b4] hover:bg-[#f7eee5]"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <Link
                href="/dashboard"
                aria-label="Go to dashboard home"
                title="Home"
                onClick={() => setMenuOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e9e2d9] bg-white text-[#632824] transition hover:border-[#d7c3b4] hover:bg-[#f7eee5]"
              >
                <House className="h-[18px] w-[18px]" />
              </Link>

              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2 text-xs text-[#8b8178]">
                  <span className="hidden max-w-48 truncate sm:inline">{schoolName}</span>

                  <ChevronRight className="hidden h-3 w-3 sm:inline" />

                  <span className="truncate">Administration</span>
                </div>

                <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-[#342724] sm:text-xl">
                  {pageTitle}
                </h2>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden min-w-0 text-right sm:block">
                <p className="max-w-48 truncate text-xs font-semibold text-[#51443d]">
                  {userName || "School Administration"}
                </p>

                <p className="mt-1 text-[11px] text-[#988b80]">
                  {formatRole(userRole)}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e7cdb9] bg-[#f3e4d2] text-sm font-bold text-[#762e28]">
                {(userName || userEmail).charAt(0).toUpperCase() || "A"}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}

        <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          {children}
        </main>

        {/* Footer */}

        <footer className="px-4 pb-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-1 border-t border-[#e9e2d9] pt-4 text-xs text-[#968b80] sm:flex-row sm:items-center sm:justify-between">
            <p>School Management System</p>
            <p>Administration Portal</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
