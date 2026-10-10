-- Subset of the Sprint 1 unified schema needed for requirements 4, 5 and 10.
CREATE TYPE user_role      AS ENUM ('STUDENT', 'ADVISOR', 'COORDINATOR', 'ADMIN');
CREATE TYPE account_status AS ENUM ('ACTIVE', 'DEACTIVATED');
CREATE TYPE student_type   AS ENUM ('NORMAL', 'ADVISING');

CREATE TABLE users (
  user_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guc_email      TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           user_role NOT NULL,
  account_status account_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_profiles (
  student_id          UUID PRIMARY KEY REFERENCES users(user_id),
  guc_student_id      TEXT NOT NULL UNIQUE,
  student_type        student_type NOT NULL,
  major               TEXT,
  current_semester    INTEGER,
  academic_standing   TEXT,
  assigned_advisor_id UUID REFERENCES users(user_id),
  workflow_status     TEXT
);

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id),
  message         TEXT NOT NULL,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
