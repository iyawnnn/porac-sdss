import ResetPasswordForm from "@/components/features/citizen/auth/ResetPasswordForm";

// No session redirect here (unlike login/signup/forgot-password) — the
// reset token itself is the gate, independent of whether the browser
// happens to already carry a citizen session.
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
