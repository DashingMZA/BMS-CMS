"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "unavailable">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.notConfigured) {
        setState("unavailable");
        setError(data.error);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Could not send the email.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("Could not send the email.");
      setState("idle");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-brand-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <KeyRound className="text-white" size={22} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
            <p className="text-slate-500 text-sm mt-1">Enter the email you sign in with and a reset link will be sent.</p>
          </div>

          {state === "sent" ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              If <strong>{email}</strong> has an account, a reset link is on its way. It works for one hour. Check the
              spam folder if it does not arrive.
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div
                  className={`border text-sm px-4 py-3 rounded-lg ${
                    state === "unavailable" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  {error}
                </div>
              )}
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn-primary w-full" disabled={state === "sending" || state === "unavailable"}>
                {state === "sending" ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <p className="mt-5 text-center text-xs text-slate-400">
            <Link href="/admin/login" className="hover:text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
