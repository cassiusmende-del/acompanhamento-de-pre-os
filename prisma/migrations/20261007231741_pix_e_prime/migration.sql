-- AlterTable
ALTER TABLE "price_observations" ADD COLUMN     "pix_price_cents" INTEGER,
ADD COLUMN     "prime_exclusive" BOOLEAN;

-- Preço no Pix, quando informado, é positivo.
ALTER TABLE "price_observations"
  ADD CONSTRAINT "price_observations_pix_positive" CHECK ("pix_price_cents" IS NULL OR "pix_price_cents" > 0);
