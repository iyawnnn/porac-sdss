-- Google/Facebook OAuth support. citizens.password_hash becomes nullable
-- for OAuth-only accounts; citizen_identities links a citizen to one or
-- more external provider identities. Applied via
-- scripts/migrations/migrate-citizen-identities.ts.
ALTER TABLE citizens ALTER COLUMN password_hash DROP NOT NULL;

DO $$ BEGIN
  CREATE TYPE oauth_provider AS ENUM ('google', 'facebook');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS citizen_identities (
  id serial PRIMARY KEY,
  citizen_id integer NOT NULL REFERENCES citizens(id),
  provider oauth_provider NOT NULL,
  provider_subject text NOT NULL,
  provider_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A given provider account can only ever back one citizen.
CREATE UNIQUE INDEX IF NOT EXISTS citizen_identities_provider_subject_idx
  ON citizen_identities (provider, provider_subject);

-- A citizen can hold at most one identity per provider.
CREATE UNIQUE INDEX IF NOT EXISTS citizen_identities_citizen_provider_idx
  ON citizen_identities (citizen_id, provider);
