CREATE TYPE "CustomerSource" AS ENUM ('STRIPE', 'AMBASSADOR');

ALTER TABLE "customers"
  ADD COLUMN "customer_source" "CustomerSource" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN "stripe_price_id" TEXT,
  ADD COLUMN "stripe_product_id" TEXT,
  ADD COLUMN "stripe_currency" TEXT,
  ADD COLUMN "stripe_interval" TEXT,
  ADD COLUMN "stripe_interval_count" INTEGER,
  ADD COLUMN "monthly_revenue_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripe_current_period_end" TIMESTAMP(3);

CREATE INDEX "customers_customer_source_idx" ON "customers"("customer_source");
