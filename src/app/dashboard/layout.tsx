import type { ReactNode } from "react";
import { auth } from "@/auth";
import {
  getConfiguredSchool,
  SchoolConfigurationError,
} from "@/lib/school";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  let schoolName = "School setup required";
  try {
    const school = await getConfiguredSchool();
    schoolName = school?.shortName || school?.name || schoolName;
  } catch (error) {
    if (!(error instanceof SchoolConfigurationError)) {
      throw error;
    }
    schoolName = "School configuration error";
  }

  return (
    <DashboardShell
      userEmail={session.user?.email ?? ""}
      userName={session.user?.name ?? ""}
      userRole={session.user.role}
      schoolName={schoolName}
    >
      {children}
    </DashboardShell>
  );
}
