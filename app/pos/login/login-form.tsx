"use client";

import { useActionState } from "react";
import { buttonClass, Notice } from "@/components/pos/ui";
import { signIn, type SignInState } from "./actions";

const inputClass =
  "min-h-11 w-full rounded-md border border-pos-line bg-white px-3 text-[15px] text-pos-ink placeholder:text-pos-muted";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { error: null, email: "" });

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          key={state.email}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-pos-soft">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={`${buttonClass("primary")} min-h-12 w-full text-base`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
