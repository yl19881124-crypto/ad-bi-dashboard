export type AnomalyRankingType =
  | 'paidUsersDrop'
  | 'paidCostRise'
  | 'paidRoiDrop'
  | 'callUsersDrop'
  | 'callCostRise'
  | 'enterRateDrop'
  | 'enterToCallRateDrop';

export interface AnomalyMetricContext {
  spendCurrent: number;
  spendPrevious: number;
  paidUsersCurrent: number;
  paidUsersPrevious: number;
  callUsersCurrent: number;
  callUsersPrevious: number;
  paidAmountCurrent: number;
  paidAmountPrevious: number;
  enterCurrent: number;
  enterPrevious: number;
  loginCurrent: number;
  loginPrevious: number;
}

export interface AnomalyRankingRow {
  key: string;
  rank: number;
  dimension: string;
  dimensionValue: string;
  rankingType: AnomalyRankingType;
  metricCurrent: number | null;
  metricPrevious: number | null;
  changeValue: number | null;
  changeRate: number | null;
  spendCurrent: number;
  spendPrevious: number;
  paidUsersCurrent: number;
  paidUsersPrevious: number;
  callUsersCurrent: number;
  callUsersPrevious: number;
  reason: string;
  action: string;
  detail: {
    numeratorCurrent: number | null;
    numeratorPrevious: number | null;
    denominatorCurrent: number | null;
    denominatorPrevious: number | null;
  };
}
