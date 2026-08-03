const NOTICES: Record<string, string> = {
  password_reset: "Your password has been reset. Please log in with your new password.",
};

export function authNoticeMessage(code: string | null): string | null {
  if (!code) return null;
  return NOTICES[code] ?? null;
}
