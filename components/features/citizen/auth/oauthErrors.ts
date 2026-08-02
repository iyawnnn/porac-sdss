const MESSAGES: Record<string, string> = {
  account_link_required:
    "An account with this email already exists. Log in with your email and password, then link your Google/Facebook account from settings.",
  email_required:
    "Your Google/Facebook account doesn't have a public email we can use. Try signing up with email and password instead.",
  oauth_cancelled: "Sign-in was cancelled.",
  oauth_failed: "Something went wrong signing you in. Please try again.",
};

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? null;
}
