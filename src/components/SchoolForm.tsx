"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  getSetupRequestError,
  readSetupResponse,
} from "@/lib/setup-request";

const requestTimeoutMs = 35_000;

type SchoolFormData = {
  name: string;
  shortName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  establishedYear: string;
  description: string;
};

const emptyFormData: SchoolFormData = {
  name: "",
  shortName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  establishedYear: "",
  description: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default function SchoolForm() {
  const router = useRouter();
  const submissionInProgress = useRef(false);
  const [formData, setFormData] = useState(emptyFormData);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSchool() {
      try {
        const response = await fetch("/api/school", {
          signal: AbortSignal.timeout(requestTimeoutMs),
        });

        if (response.status === 404) {
          return;
        }

        const data = await readSetupResponse(
          response,
          "Failed to load school information.",
        );
        if (!isRecord(data) || typeof data.name !== "string") {
          throw new Error("School information could not be loaded.");
        }

        if (active) {
          setFormData({
            name: data.name,
            shortName: getString(data.shortName),
            address: getString(data.address),
            phone: getString(data.phone),
            email: getString(data.email),
            website: getString(data.website),
            establishedYear:
              typeof data.establishedYear === "number"
                ? data.establishedYear.toString()
                : getString(data.establishedYear),
            description: getString(data.description),
          });
        }
      } catch (error) {
        if (active) {
          setMessage(
            getSetupRequestError(error, "Failed to load school information."),
          );
          setMessageIsError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSchool();

    return () => {
      active = false;
    };
  }, []);

  function handleChange(
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement
    >
  ) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (submissionInProgress.current) {
      return;
    }

    submissionInProgress.current = true;
    setSaving(true);
    setMessage("");
    setMessageIsError(false);

    try {
      const response = await fetch("/api/school", {
        method: "POST",
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await readSetupResponse(
        response,
        "Failed to save school information.",
      );
      if (
        typeof data !== "object" ||
        data === null ||
        !("created" in data) ||
        typeof data.created !== "boolean"
      ) {
        throw new Error("The server returned an invalid save confirmation.");
      }

      if (data.created) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setMessage(
        "message" in data && typeof data.message === "string"
          ? data.message
          : "School information saved successfully.",
      );
    } catch (error) {
      setMessage(
        getSetupRequestError(error, "Failed to save school information."),
      );
      setMessageIsError(true);
    } finally {
      submissionInProgress.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <label
            htmlFor="name"
            className="mb-2 block text-sm font-medium"
          >
            School Name *
          </label>

          <input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div>
          <label
            htmlFor="shortName"
            className="mb-2 block text-sm font-medium"
          >
            Short Name
          </label>

          <input
            id="shortName"
            name="shortName"
            value={formData.shortName}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div>
          <label
            htmlFor="establishedYear"
            className="mb-2 block text-sm font-medium"
          >
            Established Year
          </label>

          <input
            id="establishedYear"
            name="establishedYear"
            type="number"
            min="1"
            step="1"
            value={formData.establishedYear}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="address"
            className="mb-2 block text-sm font-medium"
          >
            Address
          </label>

          <input
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div>
          <label
            htmlFor="phone"
            className="mb-2 block text-sm font-medium"
          >
            Phone
          </label>

          <input
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium"
          >
            Email
          </label>

          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="website"
            className="mb-2 block text-sm font-medium"
          >
            Website
          </label>

          <input
            id="website"
            name="website"
            type="url"
            value={formData.website}
            onChange={handleChange}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor="description"
            className="mb-2 block text-sm font-medium"
          >
            Description
          </label>

          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-4 py-3 outline-none focus:border-(--primary)"
          />
        </div>
      </div>

      {message && (
        <p
          role={messageIsError ? "alert" : "status"}
          className={`rounded-lg px-4 py-3 text-sm ${
            messageIsError
              ? "border border-red-200 bg-red-50 text-red-700"
              : "bg-(--primary-light) text-(--primary-dark)"
          }`}
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || loading}
        className="rounded-lg bg-(--primary) px-5 py-3 font-semibold text-white hover:bg-(--primary-hover) disabled:opacity-50"
      >
        {loading ? "Loading..." : saving ? "Saving..." : "Save School"}
      </button>
    </form>
  );
}