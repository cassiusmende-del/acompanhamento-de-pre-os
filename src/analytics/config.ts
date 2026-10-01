export interface AnalyticsConfig {
  /**
   * Por quanto tempo uma observação é considerada vigente se nenhuma outra a suceder.
   * Além disso, o período conta como "sem dados" (nada é extrapolado).
   */
  maxValidityDays: number;
  /** Mínimo de observações com preço para exibir percentil e limite de "preço baixo". */
  percentileMinObservations: number;
  /** Mínimo de dias entre a primeira e a última observação com preço para o percentil. */
  percentileMinSpanDays: number;
  /** Fração máxima da janela sem dados para que o mínimo da janela seja "completo". */
  windowMaxGapFraction: number;
  windowDays: number[];
  /** Percentil que define "preço baixo" quando o usuário não fixa um valor. */
  lowPricePercentile: number;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  maxValidityDays: 7,
  percentileMinObservations: 20,
  percentileMinSpanDays: 14,
  windowMaxGapFraction: 0.25,
  windowDays: [7, 30, 90, 180, 365],
  lowPricePercentile: 10,
};

export const DAY_MS = 24 * 60 * 60 * 1000;
