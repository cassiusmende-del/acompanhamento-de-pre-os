/**
 * Preço total = item + frete − cupom, preenchido só quando todos os componentes são
 * conhecidos. Um cupom percentual (texto sem valor em centavos) deixa o total desconhecido.
 */
export function computeTotalCents(input: {
  priceCents: number | null;
  shippingCents?: number | null;
  couponText?: string | null;
  couponCents?: number | null;
}): number | null {
  const { priceCents, shippingCents, couponText, couponCents } = input;
  if (priceCents === null || shippingCents === null || shippingCents === undefined) return null;
  const hasCoupon = Boolean(couponText) || (couponCents ?? null) !== null;
  if (hasCoupon && (couponCents === null || couponCents === undefined)) return null;
  return Math.max(0, priceCents + shippingCents - (couponCents ?? 0));
}
