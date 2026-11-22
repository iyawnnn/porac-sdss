"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AUTH_BUTTON, AUTH_CTA_BUTTON, AUTH_INPUT, AuthCtaLabel } from "@/components/features/auth/auth-ui";

export function AuthButton({
  className,
  children,
  loading,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(AUTH_CTA_BUTTON, className)}>
      <AuthCtaLabel>{children}</AuthCtaLabel>
    </Button>
  );
}

// The toggle is centered with auto margins, not a translate: the shared Button shifts 1px on
// press through the same `translate` property, which used to replace a -translate-y-1/2
// centering and drop the icon about 17px while the mouse was down. The press shift is
// neutralized here too, so the control never moves.
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn(AUTH_INPUT, "pr-12", className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-1 my-auto size-8 text-muted-foreground active:not-aria-[haspopup]:translate-y-0"
      >
        <Icon aria-hidden="true" />
      </Button>
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const error = tone === "error";
  const Icon = error ? AlertCircle : CheckCircle2;
  return (
    <Alert
      role={error ? "alert" : "status"}
      aria-live="polite"
      className={
        error
          ? "border-danger-edge bg-danger-tint text-danger-ink *:data-[slot=alert-description]:text-danger-ink"
          : "border-status-resolved-dot/30 bg-status-resolved-tint text-status-resolved-ink *:data-[slot=alert-description]:text-status-resolved-ink"
      }
    >
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function GoogleButton() {
  return (
    <Button asChild variant="outline" className={cn(AUTH_BUTTON, "transition-colors duration-200 hover:border-foreground/30")}>
      <a href="/api/auth/google">
        <GoogleIcon />
        Continue with Google
      </a>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.48a5.54 5.54 0 0 1-2.4 3.64v3.02h3.89c2.28-2.1 3.55-5.18 3.55-8.85Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
