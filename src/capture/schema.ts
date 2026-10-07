import { z } from "zod";
import { isValidAsin } from "@/domain/asin";

const MAX_CENTS = 100_000_000; // R$ 1.000.000,00 — acima disso é erro de leitura

const cents = z.number().int().positive().max(MAX_CENTS);
const nonNegativeCents = z.number().int().min(0).max(MAX_CENTS);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length > 0 ? s : null))
    .nullish();

/** Dados enviados pela extensão a partir da página que o usuário abriu. */
export const extensionCaptureSchema = z
  .object({
    asin: z
      .string()
      .transform((s) => s.trim().toUpperCase())
      .refine(isValidAsin, "ASIN inválido"),
    pageUrl: z.string().url().max(2000).nullish(),
    title: text(500),
    status: z.enum(["OK", "UNAVAILABLE"]),
    priceCents: cents.nullable(),
    listPriceCents: cents.nullish(),
    shippingCents: nonNegativeCents.nullish(),
    shippingText: text(300),
    couponText: text(300),
    couponCents: nonNegativeCents.nullish(),
    sellerName: text(200),
    shipsFrom: text(200),
    fulfilledByAmazon: z.boolean().nullish(),
    condition: z.enum(["NEW", "USED", "REFURBISHED", "UNKNOWN"]).default("UNKNOWN"),
    availability: text(300),
    diagnostics: z.record(z.string(), z.unknown()).nullish(),
    /** Ignora a regra de duplicidade (botão "Registrar agora"). */
    force: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "OK" && value.priceCents === null) {
      ctx.addIssue({ code: "custom", path: ["priceCents"], message: "Status OK exige preço." });
    }
    if (value.status === "UNAVAILABLE" && value.priceCents !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceCents"],
        message: "Observação indisponível não pode ter preço.",
      });
    }
  });

export type ExtensionCapture = z.infer<typeof extensionCaptureSchema>;

/** Pedido da extensão para passar a monitorar o produto da página aberta. */
export const extensionMonitorSchema = z.object({
  asin: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .refine(isValidAsin, "ASIN inválido"),
  title: z.string().trim().min(1).max(500),
  pageUrl: z.string().url().max(2000).nullish(),
});

const asinField = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .refine(isValidAsin, "ASIN inválido");

/** Um item lido de uma página com vários produtos (carrinho). */
export const batchItemSchema = z
  .object({
    asin: asinField,
    title: text(500),
    section: z.enum(["active", "saved"]).nullish(),
    status: z.enum(["OK", "UNAVAILABLE"]),
    priceCents: cents.nullable(),
    pixPriceCents: cents.nullish(),
    listPriceCents: cents.nullish(),
    primeExclusive: z.boolean().nullish(),
    sellerName: text(200),
    availability: text(300),
    diagnostics: z.record(z.string(), z.unknown()).nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "OK" && value.priceCents === null) {
      ctx.addIssue({ code: "custom", path: ["priceCents"], message: "Status OK exige preço." });
    }
    if (value.status === "UNAVAILABLE" && value.priceCents !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceCents"],
        message: "Indisponível não pode ter preço.",
      });
    }
  });

export type BatchItem = z.infer<typeof batchItemSchema>;

/** Lote enviado pela extensão ao abrir o carrinho. */
export const extensionBatchSchema = z.object({
  kind: z.literal("cart"),
  pageUrl: z.string().url().max(2000).nullish(),
  /** Itens que a extensão viu mas não conseguiu ler com segurança (não são enviados). */
  unreadable: z.number().int().min(0).max(1000).default(0),
  force: z.boolean().optional(),
  items: z.array(batchItemSchema).max(500),
});

/** "Monitorar todos" a partir do carrinho. */
export const extensionMonitorBatchSchema = z.object({
  items: z
    .array(z.object({ asin: asinField, title: z.string().trim().min(1).max(500) }))
    .min(1)
    .max(500),
});
