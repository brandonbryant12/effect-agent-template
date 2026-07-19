import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/client";
import { Fingerprint, Orbit } from "lucide-react";
import { useState, type FormEvent } from "react";

export const LoginPanel = () => {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result =
      mode === "sign-in"
        ? await authClient.signInEmail({ email, password })
        : await authClient.signUpEmail({
            email,
            password,
            name: String(form.get("name")),
          });
    setPending(false);
    if (result.error) setError(result.error.message ?? "Authentication failed");
  };

  return (
    <main className="grid min-h-screen bg-blueprint-paper lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden border-r border-line p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 ledger-grid opacity-60" />
        <div className="relative flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-blueprint">
          <Orbit className="size-4" /> Agent Ledger / reference template
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-signal">
            Durable work, visible state
          </p>
          <h1 className="text-balance text-6xl font-semibold leading-[0.96] tracking-[-0.055em] text-ink">
            Give every agent run a paper trail.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-ink-muted">
            Projects, tasks, sessions, approvals, and sandbox activity share one
            typed record—from browser or CLI.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs">
          {[
            ["AUTH", "Better Auth"],
            ["RUNTIME", "OpenCode"],
            ["STATE", "Postgres"],
          ].map(([label, value]) => (
            <div className="bg-white/80 p-4" key={label}>
              <div className="font-mono text-[10px] tracking-widest text-ink-subtle">
                {label}
              </div>
              <div className="mt-1 font-medium text-ink">{value}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form
          className="w-full max-w-sm rounded-xl border border-line bg-white p-7 shadow-[0_20px_70px_rgba(50,95,115,0.12)]"
          onSubmit={submit}
        >
          <div className="mb-7 flex size-10 items-center justify-center rounded-lg bg-blueprint text-white">
            <Fingerprint className="size-5" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            {mode === "sign-in" ? "Open your ledger" : "Create your ledger"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Local development uses email and password. Production adapters can
            add your preferred identity provider.
          </p>
          <div className="mt-6 grid gap-3">
            {mode === "create" && (
              <Input name="name" placeholder="Your name" required />
            )}
            <Input
              name="email"
              placeholder="you@example.com"
              type="email"
              required
            />
            <Input
              minLength={8}
              name="password"
              placeholder="Password"
              type="password"
              required
            />
          </div>
          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button
            className="mt-5 w-full bg-blueprint hover:bg-blueprint-strong"
            disabled={pending}
          >
            {pending
              ? "Working…"
              : mode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </Button>
          <button
            className="mt-4 w-full text-sm text-blueprint underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "sign-in" ? "create" : "sign-in")}
            type="button"
          >
            {mode === "sign-in"
              ? "Create a local account"
              : "Use an existing account"}
          </button>
        </form>
      </section>
    </main>
  );
};
