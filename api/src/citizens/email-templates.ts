// Pure HTML builders — no I/O, no provider dependency, so they're testable
// (and reviewable) independent of whichever EmailService implementation
// sends them. Inline styles only: email clients strip <style> blocks and
// external stylesheets unpredictably.
const BRAND_COLOR = '#2563eb';

function layout(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_COLOR};padding:24px 32px;">
                <span style="font-family:monospace,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;letter-spacing:0.02em;">PORAC-SDSS</span>
                <div style="font-size:11px;color:#dbeafe;margin-top:2px;">Spatial Decision Support System</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;font-size:14px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function passwordResetEmailHtml(
  resetUrl: string,
  ttlMinutes: number,
): string {
  return layout(`
    <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">Reset your password</h1>
    <p style="margin:0 0 20px;">
      We received a request to reset the password for your PORAC-SDSS citizen account.
      Click the button below to choose a new one.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:6px;background-color:${BRAND_COLOR};">
          <a href="${resetUrl}" style="display:inline-block;padding:10px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:6px;">
            Reset password
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#4b5563;font-size:12px;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:0 0 20px;word-break:break-all;font-size:12px;color:${BRAND_COLOR};">
      ${resetUrl}
    </p>
    <p style="margin:0 0 20px;color:#4b5563;font-size:12px;">
      This link expires in ${ttlMinutes} minutes and can only be used once.
    </p>
    <p style="margin:0;color:#6b7280;font-size:12px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

export function oauthOnlyNoticeEmailHtml(): string {
  return layout(`
    <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">Password reset requested</h1>
    <p style="margin:0 0 20px;">
      Someone requested a password reset for this email address on PORAC-SDSS, but this
      account signs in with Google or Facebook and doesn't have a password to reset.
    </p>
    <p style="margin:0 0 20px;">
      Continue signing in with your linked provider, or add a password from the
      Account &amp; Security page once you're logged in.
    </p>
    <p style="margin:0;color:#6b7280;font-size:12px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `);
}

export function passwordResetConfirmationEmailHtml(): string {
  return layout(`
    <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">Your password was changed</h1>
    <p style="margin:0 0 20px;">
      This is a confirmation that the password for your PORAC-SDSS citizen account was just
      reset. You'll need to log in again with your new password on every device.
    </p>
    <p style="margin:0;color:#6b7280;font-size:12px;">
      If you didn't make this change, please reset your password again immediately.
    </p>
  `);
}

export function reportResolvedEmailHtml(reportUrl: string): string {
  return layout(`
    <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">Your report was resolved</h1>
    <p style="margin:0 0 20px;">
      Good news — the report you submitted has been marked resolved by the assigned office.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:6px;background-color:${BRAND_COLOR};">
          <a href="${reportUrl}" style="display:inline-block;padding:10px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:6px;">
            View report
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:12px;">
      Thank you for helping keep the community informed.
    </p>
  `);
}

export function reportRejectedEmailHtml(reportUrl: string): string {
  return layout(`
    <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">Your report was not accepted</h1>
    <p style="margin:0 0 20px;">
      The report you submitted was reviewed and could not be acted on by the assigned office.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:6px;background-color:${BRAND_COLOR};">
          <a href="${reportUrl}" style="display:inline-block;padding:10px 24px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:6px;">
            View report
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:12px;">
      If you believe this was a mistake, you can submit a new report with more detail.
    </p>
  `);
}
