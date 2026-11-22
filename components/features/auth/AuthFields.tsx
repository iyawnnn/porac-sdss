"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// 44px controls and 16px text keep the forms comfortable on a phone (and stop iOS
// zooming on focus). Applied to every auth input via this one constant.
export const AUTH_INPUT = "h-11 text-base md:text-base";

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
        className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground"
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
    <Button asChild variant="outline" className="h-11 w-full text-base">
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
