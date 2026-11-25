import { auth } from "@/auth";
import UserAccounts from "@/components/UserAccounts";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function UserAccountsPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <UserAccounts
      initialUsers={users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      }))}
    />
  );
}
