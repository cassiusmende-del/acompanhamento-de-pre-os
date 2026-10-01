-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('NEW', 'USED', 'REFURBISHED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('OK', 'UNAVAILABLE', 'NOT_FOUND');

-- CreateEnum
CREATE TYPE "PriceEventType" AS ENUM ('FIRST_PRICE', 'PRICE_DROP', 'PRICE_INCREASE', 'PRICE_UNCHANGED', 'PRICE_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_BELOW', 'PERCENTILE_AT_OR_BELOW', 'AT_OR_BELOW_ALL_TIME_LOW', 'DROP_PERCENT', 'BELOW_AVERAGE');

-- CreateEnum
CREATE TYPE "CorrectionAction" AS ENUM ('EXCLUDE', 'REPLACE_PRICE', 'RESTORE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "asin" VARCHAR(10) NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'amazon.com.br',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tracked_condition" "Condition" NOT NULL DEFAULT 'NEW',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "target_interval_hours" INTEGER NOT NULL DEFAULT 48,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_observations" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "asin" VARCHAR(10) NOT NULL,
    "observed_at" TIMESTAMPTZ NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ObservationStatus" NOT NULL,
    "price_cents" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "list_price_cents" INTEGER,
    "shipping_cents" INTEGER,
    "coupon_text" TEXT,
    "coupon_cents" INTEGER,
    "total_cents" INTEGER,
    "seller_name" TEXT,
    "seller_id" TEXT,
    "fulfilled_by_amazon" BOOLEAN,
    "is_buy_box_winner" BOOLEAN,
    "condition" "Condition" NOT NULL DEFAULT 'UNKNOWN',
    "availability" TEXT,
    "source" TEXT NOT NULL,
    "suspect" BOOLEAN NOT NULL DEFAULT false,
    "suspect_reason" TEXT,
    "collection_run_id" TEXT,
    "raw_payload" JSONB,

    CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observation_corrections" (
    "id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "action" "CorrectionAction" NOT NULL,
    "new_price_cents" INTEGER,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_events" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "previous_observation_id" TEXT,
    "type" "PriceEventType" NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "previous_price_cents" INTEGER,
    "new_price_cents" INTEGER,
    "delta_cents" INTEGER,
    "delta_percent" DECIMAL(9,4),
    "seller_changed" BOOLEAN NOT NULL DEFAULT false,
    "back_in_stock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "price_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "threshold_cents" INTEGER,
    "percent" DECIMAL(6,2),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_min" INTEGER NOT NULL DEFAULT 1440,
    "last_state" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,
    "observation_id" TEXT NOT NULL,
    "triggered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "notified_at" TIMESTAMPTZ,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_runs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "status" "RunStatus" NOT NULL,
    "ok_count" INTEGER NOT NULL DEFAULT 0,
    "unavailable_count" INTEGER NOT NULL DEFAULT 0,
    "blocked_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB,

    CONSTRAINT "collection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_snapshots" (
    "product_id" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL,
    "last_observed_at" TIMESTAMPTZ,
    "current_price_cents" INTEGER,
    "previous_price_cents" INTEGER,
    "lowest_price_cents" INTEGER,
    "highest_price_cents" INTEGER,
    "median_price_cents" INTEGER,
    "priced_count" INTEGER NOT NULL DEFAULT 0,
    "percentile" DECIMAL(6,2),
    "data" JSONB NOT NULL,

    CONSTRAINT "product_snapshots_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_asin_marketplace_tracked_condition_key" ON "products"("asin", "marketplace", "tracked_condition");

-- CreateIndex
CREATE INDEX "price_observations_product_id_observed_at_idx" ON "price_observations"("product_id", "observed_at");

-- CreateIndex
CREATE INDEX "observation_corrections_observation_id_created_at_idx" ON "observation_corrections"("observation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "price_events_observation_id_key" ON "price_events"("observation_id");

-- CreateIndex
CREATE INDEX "price_events_product_id_occurred_at_idx" ON "price_events"("product_id", "occurred_at");

-- CreateIndex
CREATE INDEX "alerts_product_id_idx" ON "alerts"("product_id");

-- CreateIndex
CREATE INDEX "alert_events_alert_id_triggered_at_idx" ON "alert_events"("alert_id", "triggered_at");

-- CreateIndex
CREATE INDEX "collection_runs_started_at_idx" ON "collection_runs"("started_at");

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_collection_run_id_fkey" FOREIGN KEY ("collection_run_id") REFERENCES "collection_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observation_corrections" ADD CONSTRAINT "observation_corrections_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "price_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "price_observations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Regras de integridade que o Prisma não expressa (escritas à mão).
-- ---------------------------------------------------------------------------

-- Observação com status OK tem preço positivo; sem status OK, nunca tem preço.
-- Ausência de preço jamais é registrada como zero.
ALTER TABLE "price_observations"
  ADD CONSTRAINT "price_observations_price_matches_status" CHECK (
    ("status" = 'OK' AND "price_cents" IS NOT NULL AND "price_cents" > 0)
    OR ("status" <> 'OK' AND "price_cents" IS NULL)
  ),
  ADD CONSTRAINT "price_observations_non_negative_amounts" CHECK (
    ("list_price_cents" IS NULL OR "list_price_cents" > 0)
    AND ("shipping_cents" IS NULL OR "shipping_cents" >= 0)
    AND ("coupon_cents" IS NULL OR "coupon_cents" >= 0)
    AND ("total_cents" IS NULL OR "total_cents" >= 0)
  );

ALTER TABLE "observation_corrections"
  ADD CONSTRAINT "observation_corrections_replace_has_price" CHECK (
    ("action" = 'REPLACE_PRICE' AND "new_price_cents" IS NOT NULL AND "new_price_cents" > 0)
    OR ("action" <> 'REPLACE_PRICE' AND "new_price_cents" IS NULL)
  ),
  ADD CONSTRAINT "observation_corrections_reason_not_blank" CHECK (length(trim("reason")) > 0);

-- Histórico append-only: observações e correções não podem ser alteradas nem apagadas.
CREATE FUNCTION "forbid_history_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A tabela % é imutável (append-only). Use observation_corrections para correções.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "price_observations_immutable"
  BEFORE UPDATE OR DELETE ON "price_observations"
  FOR EACH ROW EXECUTE FUNCTION "forbid_history_mutation"();

CREATE TRIGGER "price_observations_no_truncate"
  BEFORE TRUNCATE ON "price_observations"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_history_mutation"();

CREATE TRIGGER "observation_corrections_immutable"
  BEFORE UPDATE OR DELETE ON "observation_corrections"
  FOR EACH ROW EXECUTE FUNCTION "forbid_history_mutation"();

CREATE TRIGGER "observation_corrections_no_truncate"
  BEFORE TRUNCATE ON "observation_corrections"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_history_mutation"();
