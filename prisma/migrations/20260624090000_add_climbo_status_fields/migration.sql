ALTER TABLE "customers"
  ADD COLUMN "climbo_status" TEXT,
  ADD COLUMN "climbo_is_active" BOOLEAN,
  ADD COLUMN "climbo_last_checked_at" TIMESTAMP(3);

CREATE INDEX "customers_climbo_is_active_idx" ON "customers"("climbo_is_active");
