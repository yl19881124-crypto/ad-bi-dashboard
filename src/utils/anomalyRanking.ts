import dayjs from 'dayjs';
import type { DataRow } from '../types';
import type { AnomalyRankingRow, AnomalyRankingType } from '../types/anomaly';
import { normalizeExcelDate } from './date';

const UNKNOWN = '未知';

type GroupSums = Record<string, number>;

export const ANOMALY_DIMENSIONS = ['渠道', '代理', '版位', '操作系统', '账户命名', '账户ID', '广告组ID', '优化目标', '出价方式'] as const;

export const RANKING_TYPE_OPTIONS: { label: string; value: AnomalyRankingType }[] = [
  { label: '付费人数下降榜', value: 'paidUsersDrop' },
  { label: '付费成本上升榜', value: 'paidCostRise' },
  { label: '当日付费 ROI 下降榜', value: 'paidRoiDrop' },
  { label: '连麦人数下降榜', value: 'callUsersDrop' },
  { label: '连麦成本上升榜', value: 'callCostRise' },
  { label: '直播间进入率下降榜', value: 'enterRateDrop' },
  { label: '直播间➡️连麦率下降榜', value: 'enterToCallRateDrop' },
];

const requiredFields: Record<AnomalyRankingType, string[]> = {
  paidUsersDrop: ['当日付费人数'],
  paidCostRise: ['实际消耗(元)', '当日付费人数'],
  paidRoiDrop: ['当日付费金额(元)', '实际消耗(元)'],
  callUsersDrop: ['当日连麦人数'],
  callCostRise: ['实际消耗(元)', '当日连麦人数'],
  enterRateDrop: ['进入直播间人数', '注册_登录人数'],
  enterToCallRateDrop: ['当日连麦人数', '进入直播间人数'],
};

const sum = (row: DataRow, field: string) => {
  const v = row[field];
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

const aggregateByDimension = (rows: DataRow[], dimension: string, range: [string, string]) => {
  const map = new Map<string, GroupSums>();
  rows.forEach((row) => {
    const date = normalizeExcelDate(row.日期);
    if (!date || date < range[0] || date > range[1]) return;
    const raw = row[dimension];
    const key = raw === null || raw === undefined || String(raw).trim() === '' ? UNKNOWN : String(raw).trim();
    if (!map.has(key)) map.set(key, {});
    const target = map.get(key)!;
    ['当日付费人数', '实际消耗(元)', '当日付费金额(元)', '当日连麦人数', '进入直播间人数', '注册_登录人数'].forEach((field) => {
      target[field] = (target[field] ?? 0) + sum(row, field);
    });
  });
  return map;
};

export function getPreviousPeriod(dateRange: [string, string] | null): [string, string] | null {
  if (!dateRange) return null;
  const [start, end] = dateRange;
  const days = dayjs(end).diff(dayjs(start), 'day') + 1;
  return [dayjs(start).subtract(days, 'day').format('YYYY-MM-DD'), dayjs(start).subtract(1, 'day').format('YYYY-MM-DD')];
}

function computeMetric(type: AnomalyRankingType, sums: GroupSums): number | null {
  switch (type) {
    case 'paidUsersDrop':
      return sums['当日付费人数'] ?? 0;
    case 'paidCostRise':
      return ratio(sums['实际消耗(元)'] ?? 0, sums['当日付费人数'] ?? 0);
    case 'paidRoiDrop':
      return ratio(sums['当日付费金额(元)'] ?? 0, sums['实际消耗(元)'] ?? 0);
    case 'callUsersDrop':
      return sums['当日连麦人数'] ?? 0;
    case 'callCostRise':
      return ratio(sums['实际消耗(元)'] ?? 0, sums['当日连麦人数'] ?? 0);
    case 'enterRateDrop':
      return ratio(sums['进入直播间人数'] ?? 0, sums['注册_登录人数'] ?? 0);
    case 'enterToCallRateDrop':
      return ratio(sums['当日连麦人数'] ?? 0, sums['进入直播间人数'] ?? 0);
  }
}

function passValidSample(type: AnomalyRankingType, c: GroupSums, p: GroupSums) {
  switch (type) {
    case 'paidUsersDrop':
    case 'callUsersDrop':
      return (c['当日付费人数'] ?? c['当日连麦人数'] ?? 0) > 0 || (p['当日付费人数'] ?? p['当日连麦人数'] ?? 0) > 0;
    case 'paidCostRise':
      return (c['实际消耗(元)'] ?? 0) > 0 && (c['当日付费人数'] ?? 0) >= 3 && (p['当日付费人数'] ?? 0) >= 3;
    case 'callCostRise':
      return (c['实际消耗(元)'] ?? 0) > 0 && (c['当日连麦人数'] ?? 0) >= 3 && (p['当日连麦人数'] ?? 0) >= 3;
    case 'paidRoiDrop':
      return (c['实际消耗(元)'] ?? 0) > 0 && (p['实际消耗(元)'] ?? 0) > 0;
    case 'enterRateDrop':
      return (c['注册_登录人数'] ?? 0) >= 20 && (p['注册_登录人数'] ?? 0) >= 20;
    case 'enterToCallRateDrop':
      return (c['进入直播间人数'] ?? 0) >= 20 && (p['进入直播间人数'] ?? 0) >= 20;
  }
}

function buildReason(type: AnomalyRankingType, prev: number | null, curr: number | null, c: GroupSums, p: GroupSums) {
  const safePrev = prev ?? 0;
  const safeCurr = curr ?? 0;
  const rate = safePrev !== 0 ? ((safeCurr - safePrev) / safePrev) * 100 : 0;
  const drop = safePrev - safeCurr;
  if (type === 'paidUsersDrop') {
    if ((c['实际消耗(元)'] ?? 0) >= (p['实际消耗(元)'] ?? 0)) return `该对象当日付费人数由 ${safePrev.toFixed(0)} 下降至 ${safeCurr.toFixed(0)}，下降 ${drop.toFixed(0)}（${rate.toFixed(2)}%）。消耗未明显下降，但付费人数下降，流量效率可能变差。`;
    return `该对象当日付费人数由 ${safePrev.toFixed(0)} 下降至 ${safeCurr.toFixed(0)}，下降 ${drop.toFixed(0)}（${rate.toFixed(2)}%）。消耗同步下降，可能与预算、起量或投放收缩有关。`;
  }
  if (type === 'paidCostRise') return `该对象当日付费成本由 ${safePrev.toFixed(2)} 上升至 ${safeCurr.toFixed(2)}，成本上升 ${Math.abs(rate).toFixed(2)}%。`;
  if (type === 'paidRoiDrop') return `该对象当日付费ROI由 ${(safePrev * 100).toFixed(2)}% 下降至 ${(safeCurr * 100).toFixed(2)}%，下降 ${Math.abs(rate).toFixed(2)}%。`;
  if (type === 'callUsersDrop') return `该对象当日连麦人数由 ${safePrev.toFixed(0)} 下降至 ${safeCurr.toFixed(0)}，下降 ${drop.toFixed(0)}。`;
  if (type === 'callCostRise') return `该对象连麦成本由 ${safePrev.toFixed(2)} 上升至 ${safeCurr.toFixed(2)}，成本上升 ${Math.abs(rate).toFixed(2)}%。`;
  if (type === 'enterRateDrop') return `该对象直播间进入率由 ${(safePrev * 100).toFixed(2)}% 下降至 ${(safeCurr * 100).toFixed(2)}%。`;
  return `该对象直播间➡️连麦率由 ${(safePrev * 100).toFixed(2)}% 下降至 ${(safeCurr * 100).toFixed(2)}%。`;
}

function buildAction(type: AnomalyRankingType, dimension: string) {
  if (type === 'paidUsersDrop') return dimension === '广告组ID' ? '优先查看该广告组对应素材和出价变化，并检查预算、计划状态和转化回传。' : '优先检查该对象近期预算、出价、计划状态、素材变化和转化回传。';
  if (type === 'paidCostRise') return '优先排查该对象下高消耗低转化的账户ID或广告组ID，检查出价、预算、素材点击质量、直播间承接和转化回传。';
  if (type === 'paidRoiDrop') return '优先查看高消耗低回收对象，检查付费转化、客单价、咨询师承接和用户质量。';
  if (type === 'callUsersDrop') return '检查直播间承接、咨询师在线率、排队时长、素材和落地页引导。';
  if (type === 'callCostRise') return '检查直播间进入率、连麦率、咨询师在线率和对应广告组消耗结构。';
  if (type === 'enterRateDrop') return '检查落地页承接、直播间入口、页面加载、跳转链路和媒体流量质量。';
  return '检查咨询师在线率、排队时长、直播间话术、连麦入口和用户质量。';
}

export function getMissingFields(type: AnomalyRankingType, fields: string[]) {
  return requiredFields[type].filter((item) => !fields.includes(item));
}

export function buildAnomalyRanking(params: {
  rows: DataRow[];
  dateRange: [string, string] | null;
  dimension: string;
  rankingType: AnomalyRankingType;
  topN: number;
  onlyValid: boolean;
}): { rows: AnomalyRankingRow[]; noPreviousData: boolean } {
  const { rows, dateRange, dimension, rankingType, topN, onlyValid } = params;
  if (!dateRange) return { rows: [], noPreviousData: false };
  const previousRange = getPreviousPeriod(dateRange);
  if (!previousRange) return { rows: [], noPreviousData: false };

  const currentMap = aggregateByDimension(rows, dimension, dateRange);
  const previousMap = aggregateByDimension(rows, dimension, previousRange);
  if (previousMap.size === 0) return { rows: [], noPreviousData: true };

  const values = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const result: AnomalyRankingRow[] = [];

  values.forEach((value) => {
    const c = currentMap.get(value) ?? {};
    const p = previousMap.get(value) ?? {};
    if (onlyValid && !passValidSample(rankingType, c, p)) return;
    const metricCurrent = computeMetric(rankingType, c);
    const metricPrevious = computeMetric(rankingType, p);
    if (metricCurrent === null || metricPrevious === null) return;
    const changeValue = metricCurrent - metricPrevious;
    const changeRate = metricPrevious !== 0 ? changeValue / metricPrevious : null;

    const isAbnormal = ['paidCostRise', 'callCostRise'].includes(rankingType) ? changeValue > 0 : changeValue < 0;
    if (!isAbnormal) return;

    result.push({
      key: `${rankingType}-${dimension}-${value}`,
      rank: 0,
      dimension,
      dimensionValue: value,
      rankingType,
      metricCurrent,
      metricPrevious,
      changeValue,
      changeRate,
      spendCurrent: c['实际消耗(元)'] ?? 0,
      spendPrevious: p['实际消耗(元)'] ?? 0,
      paidUsersCurrent: c['当日付费人数'] ?? 0,
      paidUsersPrevious: p['当日付费人数'] ?? 0,
      callUsersCurrent: c['当日连麦人数'] ?? 0,
      callUsersPrevious: p['当日连麦人数'] ?? 0,
      reason: buildReason(rankingType, metricPrevious, metricCurrent, c, p),
      action: buildAction(rankingType, dimension),
      detail: {
        numeratorCurrent: rankingType === 'paidRoiDrop' ? c['当日付费金额(元)'] ?? 0 : rankingType === 'enterRateDrop' ? c['进入直播间人数'] ?? 0 : rankingType === 'enterToCallRateDrop' ? c['当日连麦人数'] ?? 0 : c['实际消耗(元)'] ?? 0,
        numeratorPrevious: rankingType === 'paidRoiDrop' ? p['当日付费金额(元)'] ?? 0 : rankingType === 'enterRateDrop' ? p['进入直播间人数'] ?? 0 : rankingType === 'enterToCallRateDrop' ? p['当日连麦人数'] ?? 0 : p['实际消耗(元)'] ?? 0,
        denominatorCurrent: rankingType === 'paidCostRise' ? c['当日付费人数'] ?? 0 : rankingType === 'callCostRise' ? c['当日连麦人数'] ?? 0 : rankingType === 'paidRoiDrop' ? c['实际消耗(元)'] ?? 0 : rankingType === 'enterRateDrop' ? c['注册_登录人数'] ?? 0 : rankingType === 'enterToCallRateDrop' ? c['进入直播间人数'] ?? 0 : null,
        denominatorPrevious: rankingType === 'paidCostRise' ? p['当日付费人数'] ?? 0 : rankingType === 'callCostRise' ? p['当日连麦人数'] ?? 0 : rankingType === 'paidRoiDrop' ? p['实际消耗(元)'] ?? 0 : rankingType === 'enterRateDrop' ? p['注册_登录人数'] ?? 0 : rankingType === 'enterToCallRateDrop' ? p['进入直播间人数'] ?? 0 : null,
      },
    });
  });

  result.sort((a, b) => {
    const scoreA = Math.abs(a.changeRate ?? 0) * 100 + a.spendCurrent / 1000;
    const scoreB = Math.abs(b.changeRate ?? 0) * 100 + b.spendCurrent / 1000;
    if (scoreA === scoreB) return Math.abs(b.changeValue ?? 0) - Math.abs(a.changeValue ?? 0);
    return scoreB - scoreA;
  });

  return {
    noPreviousData: false,
    rows: result.slice(0, topN).map((item, index) => ({ ...item, rank: index + 1 })),
  };
}
