export const PREDICTION_CREDIT_SCALE = 1_000;
export const PREDICTION_PRICE_SCALE = 10_000;
export const PREDICTION_CONTRACT_PAYOUT_CREDITS = 1;

export type PredictionSide = "yes" | "no";

export function predictionCreditsToMicros(credits: number): number {
  if (!Number.isSafeInteger(credits) || credits < 0) {
    throw new Error("Prediction credits must be a non-negative integer");
  }
  return credits * PREDICTION_CREDIT_SCALE;
}

export function predictionMicrosToCredits(micros: number): number {
  if (!Number.isSafeInteger(micros)) {
    throw new Error("Prediction credit micros must be a safe integer");
  }
  return micros / PREDICTION_CREDIT_SCALE;
}

export function predictionSharesToMicros(shares: number): number {
  const micros = Math.round(shares * PREDICTION_CREDIT_SCALE);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    throw new Error("Prediction shares must be a positive number");
  }
  if (Math.abs(shares * PREDICTION_CREDIT_SCALE - micros) > 1e-7) {
    throw new Error("Prediction shares support up to three decimal places");
  }
  return micros;
}

export function validatePredictionPrice(priceBps: number): number {
  if (!Number.isInteger(priceBps) || priceBps < 100 || priceBps > 9_900) {
    throw new Error("Prediction prices must be between 1% and 99%");
  }
  return priceBps;
}

export function complementaryPredictionPrice(priceBps: number): number {
  return PREDICTION_PRICE_SCALE - validatePredictionPrice(priceBps);
}

export function predictionOrderSharesMicros(input: {
  readonly stakeMicros: number;
  readonly limitPriceBps: number;
}): number {
  validatePredictionPrice(input.limitPriceBps);
  if (!Number.isSafeInteger(input.stakeMicros) || input.stakeMicros <= 0) {
    throw new Error(
      "A prediction position must allocate at least one microcredit",
    );
  }
  return Math.floor(
    (input.stakeMicros * PREDICTION_PRICE_SCALE) / input.limitPriceBps,
  );
}

export function predictionOrderCostMicros(input: {
  readonly sharesMicros: number;
  readonly priceBps: number;
}): number {
  validatePredictionPrice(input.priceBps);
  if (!Number.isSafeInteger(input.sharesMicros) || input.sharesMicros < 0) {
    throw new Error("Prediction shares must be a non-negative safe integer");
  }
  return Math.floor(
    (input.sharesMicros * input.priceBps) / PREDICTION_PRICE_SCALE,
  );
}

export function predictionSideCostMicros(input: {
  readonly sharesMicros: number;
  readonly side: PredictionSide;
  readonly sidePriceBps: number;
}): number {
  const sidePriceBps = validatePredictionPrice(input.sidePriceBps);
  if (input.side === "yes") {
    return predictionOrderCostMicros({
      sharesMicros: input.sharesMicros,
      priceBps: sidePriceBps,
    });
  }
  return (
    input.sharesMicros -
    predictionOrderCostMicros({
      sharesMicros: input.sharesMicros,
      priceBps: PREDICTION_PRICE_SCALE - sidePriceBps,
    })
  );
}

export function predictionOrdersCross(input: {
  readonly yesLimitPriceBps: number;
  readonly noLimitPriceBps: number;
}): boolean {
  validatePredictionPrice(input.yesLimitPriceBps);
  validatePredictionPrice(input.noLimitPriceBps);
  return (
    input.yesLimitPriceBps + input.noLimitPriceBps >= PREDICTION_PRICE_SCALE
  );
}

export function predictionShareOrdersCross(input: {
  readonly buyLimitPriceBps: number;
  readonly sellLimitPriceBps: number;
}): boolean {
  validatePredictionPrice(input.buyLimitPriceBps);
  validatePredictionPrice(input.sellLimitPriceBps);
  return input.buyLimitPriceBps >= input.sellLimitPriceBps;
}

export function predictionSaleCostBasisMicros(input: {
  readonly positionSharesMicros: number;
  readonly positionCostMicros: number;
  readonly soldSharesMicros: number;
}): number {
  if (
    !Number.isSafeInteger(input.positionSharesMicros) ||
    !Number.isSafeInteger(input.positionCostMicros) ||
    !Number.isSafeInteger(input.soldSharesMicros) ||
    input.positionSharesMicros <= 0 ||
    input.positionCostMicros < 0 ||
    input.soldSharesMicros <= 0 ||
    input.soldSharesMicros > input.positionSharesMicros
  ) {
    throw new Error("Prediction sale cost basis inputs are invalid");
  }
  return input.soldSharesMicros === input.positionSharesMicros
    ? input.positionCostMicros
    : Math.floor(
        (input.positionCostMicros * input.soldSharesMicros) /
          input.positionSharesMicros,
      );
}

export function predictionExecutionPrices(input: {
  readonly makerSide: PredictionSide;
  readonly makerLimitPriceBps: number;
}): { readonly yesPriceBps: number; readonly noPriceBps: number } {
  const makerPrice = validatePredictionPrice(input.makerLimitPriceBps);
  return input.makerSide === "yes"
    ? {
        yesPriceBps: makerPrice,
        noPriceBps: PREDICTION_PRICE_SCALE - makerPrice,
      }
    : {
        yesPriceBps: PREDICTION_PRICE_SCALE - makerPrice,
        noPriceBps: makerPrice,
      };
}

export function predictionDisplayPriceBps(input: {
  readonly bestBidBps?: number;
  readonly bestAskBps?: number;
  readonly lastTradeBps: number;
  readonly midpointSpreadLimitBps?: number;
}): number {
  const lastTrade = Math.max(
    0,
    Math.min(PREDICTION_PRICE_SCALE, Math.round(input.lastTradeBps)),
  );
  if (input.bestBidBps === undefined || input.bestAskBps === undefined) {
    return lastTrade;
  }
  const bid = validatePredictionPrice(input.bestBidBps);
  const ask = validatePredictionPrice(input.bestAskBps);
  const spreadLimit = input.midpointSpreadLimitBps ?? 1_000;
  return ask >= bid && ask - bid <= spreadLimit
    ? Math.round((bid + ask) / 2)
    : lastTrade;
}

export function predictionSettlementPayoutMicros(input: {
  readonly positionSide: PredictionSide;
  readonly resolvedSide: PredictionSide;
  readonly sharesMicros: number;
}): number {
  return input.positionSide === input.resolvedSide ? input.sharesMicros : 0;
}

export function predictionProbabilityPercent(priceBps: number): number {
  return validatePredictionPrice(priceBps) / 100;
}
