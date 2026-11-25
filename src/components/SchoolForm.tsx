"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export default function SchoolForm() {
  const router = useRouter();
  const [formData, setFormData] = useState(emptyFormData);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSchool() {
      try {
        const response = await fetch("/api/school");

        if (response.status === 404) {
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load school information.");
        }

        if (typeof data.name !== "string") {
          throw new Error("School information could not be loaded.");
        }

        if (active) {
          setFormData({
            name: data.name,
            shortName: data.shortName ?? "",
            address: data.address ?? "",
            phone: data.phone ?? "",
            email: data.email ?? "",
            website: data.website ?? "",
            establishedYear: data.establishedYear?.toString() ?? "",
            description: data.description ?? "",
          });
        }
      } catch (error) {
        console.error("School load error:", error);
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Failed to load school information.",
          );
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

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/school", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save school information.");
      }

      router.replace("/dashboard");
    } catch (error) {
      console.error("School save error:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save school information.",
      );
    } finally {
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
          role="status"
          className="rounded-lg bg-(--primary-light) px-4 py-3 text-sm text-(--primary-dark)"
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