CREATE TYPE "CustomerStatus" AS ENUM (
  'LEAD',
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'ARCHIVED'
);

CREATE TYPE "SyncStatus" AS ENUM (
  'PENDING',
  'SYNCED',
  'FAILED'
);

CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "contact_name" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "status" "CustomerStatus" NOT NULL DEFAULT 'LEAD',
  "plan" TEXT,
  "trial_ends_at" TIMESTAMP(3),
  "stripe_customer_id" TEXT,
  "stripe_subscription_id" TEXT,
  "climbo_account_id" TEXT,
  "climbo_sync_status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "climbo_last_synced_at" TIMESTAMP(3),
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_events" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT,
  "provider" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "payload" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "customers_stripe_customer_id_key" ON "customers"("stripe_customer_id");
CREATE UNIQUE INDEX "customers_stripe_subscription_id_key" ON "customers"("stripe_subscription_id");
CREATE UNIQUE INDEX "customers_climbo_account_id_key" ON "customers"("climbo_account_id");
CREATE INDEX "customers_status_idx" ON "customers"("status");
CREATE INDEX "customers_climbo_sync_status_idx" ON "customers"("climbo_sync_status");
CREATE INDEX "sync_events_provider_event_type_idx" ON "sync_events"("provider", "event_type");
CREATE INDEX "sync_events_status_idx" ON "sync_events"("status");

ALTER TABLE "sync_events"
  ADD CONSTRAINT "sync_events_customer_id_fkey"
  FOREIGN KEY ("customer_id")
  REFERENCES "customers"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
