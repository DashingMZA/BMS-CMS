"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupForm({ needsToken = false }: { needsToken?: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", setupToken: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Setup failed");
    } else {
      router.push("/admin/login");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-white text-xl font-bold">B</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome to BMS</h1>
            <p className="text-slate-400 text-xs italic mt-0.5">A CMS made for bloggers by a blogger</p>
            <p className="text-slate-500 text-sm mt-2">Create your admin account to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            {needsToken && (
              <div>
                <label className="label">Setup token</label>
                <input
                  type="password"
                  className="input"
                  value={form.setupToken}
                  onChange={(e) => setForm({ ...form, setupToken: e.target.value })}
                  placeholder="The SETUP_TOKEN from the host's environment"
                  autoComplete="off"
                  required
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  This site was installed with a setup token, so only someone with access to the server can create the
                  first account.
                </p>
              </div>
            )}
            <div>
              <label className="label">Name</label>
              <input
                type="text"
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Admin"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Choose a strong password"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Creating account…" : "Create account & continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
