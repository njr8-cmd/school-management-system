import { auth } from "@/auth";
import SchoolForm from "@/components/SchoolForm";
import { redirect } from "next/navigation";

export default async function SchoolPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-(--foreground)">
          School
        </h1>

        <p className="mt-1 text-(--muted)">
          Manage the school&apos;s basic information.
        </p>
      </div>

      <section className="rounded-xl border border-(--border) bg-(--surface) p-6">
        <SchoolForm />
      </section>
    </div>
  );
}