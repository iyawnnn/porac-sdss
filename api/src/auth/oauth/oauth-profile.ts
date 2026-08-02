// Normalized shape both providers resolve to before the account
// creation/linking logic (oauth.service.ts) ever sees them.
export interface OAuthProfile {
  subject: string;
  // Null when the provider didn't return a (verified) email — the caller
  // must reject with an email-required error rather than create an
  // incomplete citizen.
  email: string | null;
  // Display-only, used solely to fill citizens.first_name/last_name (both
  // NOT NULL) on first-time signup. Never used to decide account linking —
  // only provider+subject and normalized email are authoritative there.
  firstName: string;
  lastName: string;
}
