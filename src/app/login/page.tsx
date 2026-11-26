"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signInInProgress = useRef(false);

  return (
    <main className="flex min-h-screen items-center justify-center bg-(--background) px-4">
      <div className="w-full max-w-md rounded-2xl border border-(--border) bg-(--surface) p-8 shadow-lg">
        <div className="mb-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-(--primary)">
            <span className="text-xl font-bold text-white">S</span>
          </div>

          <h1 className="text-2xl font-bold text-(--foreground)">
            School Management System
          </h1>

          <p className="mt-2 text-sm text-(--muted)">
            Sign in to access the administration portal.
          </p>
        </div>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (signInInProgress.current) return;

            signInInProgress.current = true;
            setIsSigningIn(true);
            setError("");

            try {
              const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
              });

              if (result?.error) {
                setError("Invalid email or password.");
                return;
              }

              router.push("/dashboard");
            } catch (cause) {
              console.error("Sign-in request failed:", cause);
              setError("Unable to sign in. Please try again.");
            } finally {
              signInInProgress.current = false;
              setIsSigningIn(false);
            }
          }}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-(--foreground)"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@school.com"
              required
              className="w-full rounded-lg border border-(--border) bg-white px-4 py-3 text-sm outline-none transition focus:border-(--primary) focus:ring-2 focus:ring-[(--primary-light)"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-(--foreground)"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              className="w-full rounded-lg border border-(--border) bg-white px-4 py-3 text-sm outline-none transition focus:border-(--primary) focus:ring-2 focus:ring-(--primary-light)"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-(--accent-light) px-4 py-3 text-sm text-(--accent-dark)">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSigningIn}
            aria-busy={isSigningIn}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-(--primary-dark) px-4 py-3 text-sm font-semibold text-white transition hover:bg-(--primary) focus:outline-none focus:ring-2 focus:ring-(--primary) focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSigningIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>
    </main>
  );
}