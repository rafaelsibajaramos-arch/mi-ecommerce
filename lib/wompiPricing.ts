export const WOMPI_ADVANCED_PERCENT = 0.0265;
export const WOMPI_ADVANCED_FIXED_FEE = 700;
export const COLOMBIA_VAT_RATE = 0.19;

export type PricingMode = "customer_pays_fee" | "fee_discounted_from_balance";

export function roundToPeso(value: number) {
  return Math.max(0, Math.round(value || 0));
}

export function ceilToPeso(value: number) {
  return Math.max(0, Math.ceil(value || 0));
}

export function calculateWompiFeeForChargeAmount(chargeAmount: number) {
  const normalizedChargeAmount = Math.max(0, Number(chargeAmount || 0));
  const baseFee = normalizedChargeAmount * WOMPI_ADVANCED_PERCENT + WOMPI_ADVANCED_FIXED_FEE;
  return ceilToPeso(baseFee * (1 + COLOMBIA_VAT_RATE));
}

export function calculateTopupCustomerPaysFee(targetCreditAmount: number) {
  const normalizedCreditAmount = roundToPeso(targetCreditAmount);
  const effectivePercent = WOMPI_ADVANCED_PERCENT * (1 + COLOMBIA_VAT_RATE);
  const effectiveFixedFee = WOMPI_ADVANCED_FIXED_FEE * (1 + COLOMBIA_VAT_RATE);

  const totalToPay = ceilToPeso(
    (normalizedCreditAmount + effectiveFixedFee) / (1 - effectivePercent)
  );

  const processingFee = Math.max(0, totalToPay - normalizedCreditAmount);
  const wompiEstimatedFee = calculateWompiFeeForChargeAmount(totalToPay);
  const merchantEstimatedNet = Math.max(0, totalToPay - wompiEstimatedFee);

  return {
    pricingMode: "customer_pays_fee" as const,
    targetCreditAmount: normalizedCreditAmount,
    processingFee,
    totalToPay,
    wompiEstimatedFee,
    merchantEstimatedNet,
  };
}

export function calculateTopupFeeDiscountedFromBalance(paidAmount: number) {
  const normalizedPaidAmount = roundToPeso(paidAmount);
  const wompiEstimatedFee = calculateWompiFeeForChargeAmount(normalizedPaidAmount);
  const netCreditAmount = Math.max(0, normalizedPaidAmount - wompiEstimatedFee);

  return {
    pricingMode: "fee_discounted_from_balance" as const,
    paidAmount: normalizedPaidAmount,
    wompiEstimatedFee,
    netCreditAmount,
  };
}