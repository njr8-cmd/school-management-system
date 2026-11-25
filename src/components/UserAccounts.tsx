"use client";

import {
  useCallback,
  useState,
  type FormEvent,
} from "react";
import { isAppRole, type AppRole } from "@/lib/auth/roles";

type UserAccount = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  createdAt: string;
};

type UserEdit = Pick<UserAccount, "name" | "email" | "role">;

const emptyCreateForm = {
  name: "",
  email: "",
  password: "",
  role: "ACCOUNTANT" as AppRole,
};

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

function isUserAccount(value: unknown): value is UserAccount {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "email" in value &&
    typeof value.email === "string" &&
    "role" in value &&
    isAppRole(value.role) &&
    "createdAt" in value &&
    typeof value.createdAt === "string"
  );
}

function toEdits(accounts: UserAccount[]): Record<string, UserEdit> {
  return Object.fromEntries(
    accounts.map((account) => [
      account.id,
      {
        name: account.name,
        email: account.email,
        role: account.role,
      },
    ]),
  );
}

export default function UserAccounts({
  initialUsers,
}: {
  initialUsers: UserAccount[];
}) {
  const [users, setUsers] = useState(initialUsers);
  const [edits, setEdits] = useState(() => toEdits(initialUsers));
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(await getError(response, "Could not load user accounts."));
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isUserAccount)) {
        throw new Error("The user-account response was invalid.");
      }
      const accounts = data;
      setUsers(accounts);
      setEdits(toEdits(accounts));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load user accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!response.ok) {
        throw new Error(await getError(response, "Could not create the account."));
      }
      setCreateForm(emptyCreateForm);
      setNotice("Account created.");
      await loadUsers();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the account.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(userId: string) {
    setSavingUserId(userId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edits[userId]),
      });
      if (!response.ok) {
        throw new Error(await getError(response, "Could not update the account."));
      }
      setNotice("Account updated.");
      await loadUsers();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update the account.",
      );
    } finally {
      setSavingUserId("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#8b3a31]">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-bold text-[#342724]">User accounts</h1>
        <p className="mt-2 text-sm text-[#776a61]">
          Manage ADMIN and ACCOUNTANT access. Passwords are never displayed.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <section className="rounded-xl border border-[#e9e2d9] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-[#342724]">Create account</h2>
        <form
          className="mt-4 grid gap-4 md:grid-cols-2"
          onSubmit={createUser}
        >
          <label className="grid gap-1 text-sm font-medium">
            Name
            <input
              required
              maxLength={120}
              value={createForm.name}
              onChange={(event) =>
                setCreateForm({ ...createForm, name: event.target.value })
              }
              className="rounded-lg border border-[#d8cec4] px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Email
            <input
              required
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm({ ...createForm, email: event.target.value })
              }
              className="rounded-lg border border-[#d8cec4] px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Temporary password (at least 14 characters)
            <input
              required
              type="password"
              minLength={14}
              autoComplete="new-password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm({ ...createForm, password: event.target.value })
              }
              className="rounded-lg border border-[#d8cec4] px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Role
            <select
              value={createForm.role}
              onChange={(event) => {
                if (isAppRole(event.target.value)) {
                  setCreateForm({
                    ...createForm,
                    role: event.target.value,
                  });
                }
              }}
              className="rounded-lg border border-[#d8cec4] px-3 py-2"
            >
              <option value="ACCOUNTANT">ACCOUNTANT</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#702d27] px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[#e9e2d9] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[#342724]">Existing accounts</h2>
          <button
            type="button"
            onClick={() => void loadUsers()}
            className="rounded-lg border border-[#d8cec4] px-3 py-2 text-sm font-medium"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="py-6 text-sm text-[#776a61]">Loading accounts…</p>
        ) : users.length === 0 ? (
          <p className="py-6 text-sm text-[#776a61]">No accounts found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-[#e9e2d9] text-[#776a61]">
                <tr>
                  <th className="px-2 py-3 font-semibold">Name</th>
                  <th className="px-2 py-3 font-semibold">Email</th>
                  <th className="px-2 py-3 font-semibold">Role</th>
                  <th className="px-2 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id} className="border-b border-[#f1ece7]">
                    <td className="px-2 py-3">
                      <input
                        aria-label={`Name for ${account.email}`}
                        value={edits[account.id]?.name ?? account.name}
                        onChange={(event) =>
                          setEdits({
                            ...edits,
                            [account.id]: {
                              ...edits[account.id],
                              name: event.target.value,
                            },
                          })
                        }
                        className="w-full rounded border border-[#d8cec4] px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <input
                        aria-label={`Email for ${account.email}`}
                        type="email"
                        value={edits[account.id]?.email ?? account.email}
                        onChange={(event) =>
                          setEdits({
                            ...edits,
                            [account.id]: {
                              ...edits[account.id],
                              email: event.target.value,
                            },
                          })
                        }
                        className="w-full rounded border border-[#d8cec4] px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <select
                        aria-label={`Role for ${account.email}`}
                        value={edits[account.id]?.role ?? account.role}
                        onChange={(event) => {
                          if (isAppRole(event.target.value)) {
                            setEdits({
                              ...edits,
                              [account.id]: {
                                ...edits[account.id],
                                role: event.target.value,
                              },
                            });
                          }
                        }}
                        className="rounded border border-[#d8cec4] px-2 py-1"
                      >
                        <option value="ACCOUNTANT">ACCOUNTANT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        disabled={savingUserId === account.id}
                        onClick={() => void updateUser(account.id)}
                        className="rounded-lg border border-[#d8cec4] px-3 py-1.5 font-medium disabled:opacity-60"
                      >
                        {savingUserId === account.id ? "Saving…" : "Save"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
