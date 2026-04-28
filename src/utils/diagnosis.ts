import dayjs from 'dayjs';
import { getMetricTrendDirection, getMetricType, metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import type { DiagnosisDimensionResult, DiagnosisResult } from '../types/diagnosis';
import { normalizeExcelDate } from './date';

const EPSILON = 0.0001;
const SMALL_SAMPLE_THRESHOLD = 20;

const COST_METRICS = new Set(['当日付费成本', '3日付费成本']);
const ROI_METRICS = new Set(['当日付费ROI', '3日付费ROI']);
const FUNNEL_METRICS = new Set([
  '3日付费率',
  '落地页到达率',
  '登陆➡️直播间进入率',
  '落地页➡️直播间进入率',
  '登陆➡️当日连麦率',
  '直播间➡️当日连麦率',
  '当日连麦➡️付费连麦转化率',
  '当日付费连麦用户占比',
]);

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPreviousPeriod([start, end]: [string, string]): [string, string] {
  const days = dayjs(end).diff(dayjs(start), 'day') + 1;
  return [dayjs(start).subtract(days, 'day').format('YYYY-MM-DD'), dayjs(start).subtract(1, 'day').format('YYYY-MM-DD')];
}

function isInRange(date: string, range: [string, string]) {
  return date >= range[0] && date <= range[1];
}

function getStatus(changeRate: number | null, direction: ReturnType<typeof getMetricTrendDirection>): '变好' | '变差' | '持平' | '上升' | '下降' {
  if (changeRate === null || Math.abs(changeRate) <= EPSILON) return '持平';
  if (direction === 'higher_better') return changeRate > 0 ? '变好' : '变差';
  if (direction === 'lower_better') return changeRate < 0 ? '变好' : '变差';
  return changeRate > 0 ? '上升' : '下降';
}

function buildReason(metricKey: string, nc: number, np: number, dc: number, dp: number, sampleWarning: boolean) {
  if (sampleWarning) return '样本量较小，波动仅供参考';
  const numeratorChange = np > 0 ? (nc - np) / np : null;
  const denominatorChange = dp > 0 ? (dc - dp) / dp : null;

  if (COST_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) > 0.05 && (denominatorChange ?? 0) <= 0.02) return '消耗上升，付费人数未同步增长';
    if (Math.abs(numeratorChange ?? 0) <= 0.05 && (denominatorChange ?? 0) < -0.05) return '消耗持平，付费人数下降';
    if ((numeratorChange ?? 0) < -0.01 && (denominatorChange ?? 0) < -0.03) return '消耗下降，但付费人数下降更快';
    return '分母过小，数据波动较大';
  }

  if (ROI_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.05 && (denominatorChange ?? 0) >= 0) return '付费金额下降，消耗持平或上升';
    if ((denominatorChange ?? 0) > 0.05 && (numeratorChange ?? 0) <= 0.02) return '消耗上升，但付费金额未同步增长';
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) return '付费金额和消耗都下降，但收入下降更快';
    return '分母过小，ROI 波动较大';
  }

  if (FUNNEL_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.05 && (denominatorChange ?? 0) >= -0.02) return '分子下降，分母持平或上升';
    if ((denominatorChange ?? 0) > 0.05 && (numeratorChange ?? 0) <= 0.02) return '分母增加，但后续转化未跟上';
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) return '分子分母都下降，但分子下降更快';
    return '样本量较小，波动可能较大';
  }

  return '核心指标波动，建议结合投放明细排查';
}

function buildAction(metricKey: string) {
  if (COST_METRICS.has(metricKey)) return '优先检查高消耗且成本升高的渠道/广告组';
  if (ROI_METRICS.has(metricKey)) return '优先排查高消耗低回收维度，收紧低效流量';
  if (FUNNEL_METRICS.has(metricKey)) return '排查漏斗衔接环节，定位承接与转化断点';
  return '聚焦变化最大维度，逐层定位影响路径';
}

export function runDiagnosis(params: {
  rows: DataRow[];
  metricKey: string;
  currentRange: [string, string] | null;
  dimensions: string[];
}): DiagnosisResult | null {
  const { rows, metricKey, currentRange, dimensions } = params;
  if (!currentRange) return null;

  const previousRange = getPreviousPeriod(currentRange);
  const metricConfig = metricConfigMap.get(metricKey);
  const metricType = getMetricType(metricKey);
  const direction = getMetricTrendDirection(metricKey);

  const fieldKeys = new Set(rows.flatMap((row) => Object.keys(row)));
  if (metricConfig?.mode === 'formula' && (!fieldKeys.has(metricConfig.numerator) || !fieldKeys.has(metricConfig.denominator))) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: '缺少必要字段，无法诊断该指标',
      dimensionResults: [],
      suggestions: [],
      error: '缺少必要字段，无法诊断该指标',
    };
  }

  const periodRows = rows
    .map((row) => ({ ...row, __date: normalizeExcelDate(row.日期) }))
    .filter((row) => row.__date && (isInRange(row.__date, currentRange) || isInRange(row.__date, previousRange)));

  const currentRows = periodRows.filter((row) => row.__date && isInRange(row.__date, currentRange));
  const previousRows = periodRows.filter((row) => row.__date && isInRange(row.__date, previousRange));

  if (!currentRows.length) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: '当前筛选条件下暂无数据',
      dimensionResults: [],
      suggestions: [],
      error: '当前筛选条件下暂无数据',
    };
  }

  if (!previousRows.length) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: '暂无上一周期数据，无法计算环比',
      dimensionResults: [],
      suggestions: [],
      error: '暂无上一周期数据，无法计算环比',
    };
  }

  const sumByField = (targetRows: (DataRow & { __date: string | null })[], field: string) => targetRows.reduce((acc, row) => acc + toNumber(row[field]), 0);

  const defaultNumerator = metricConfig?.mode === 'formula' ? metricConfig.numerator : metricKey;
  const defaultDenominator = metricConfig?.mode === 'formula' ? metricConfig.denominator : '样本量';

  const calcMetric = (numerator: number, denominator: number) => {
    if (metricConfig?.mode === 'formula') return denominator > 0 ? numerator / denominator : null;
    return numerator;
  };

  const totalNumeratorCurrent = sumByField(currentRows, defaultNumerator);
  const totalNumeratorPrevious = sumByField(previousRows, defaultNumerator);
  const totalDenominatorCurrent = metricConfig?.mode === 'formula' ? sumByField(currentRows, defaultDenominator) : currentRows.length;
  const totalDenominatorPrevious = metricConfig?.mode === 'formula' ? sumByField(previousRows, defaultDenominator) : previousRows.length;

  const currentValue = calcMetric(totalNumeratorCurrent, totalDenominatorCurrent);
  const previousValue = calcMetric(totalNumeratorPrevious, totalDenominatorPrevious);
  const changeValue = currentValue !== null && previousValue !== null ? currentValue - previousValue : null;
  const changeRate = currentValue !== null && previousValue !== null && previousValue !== 0 ? (currentValue - previousValue) / previousValue : null;
  const status = getStatus(changeRate, direction);

  const dimensionResults: DiagnosisDimensionResult[] = dimensions.map((dimension) => {
    const grouped = new Map<string, { nc: number; np: number; dc: number; dp: number; currentMetric: number | null; previousMetric: number | null; impactScore: number }>();
    const addRow = (row: DataRow & { __date: string | null }, isCurrent: boolean) => {
      const key = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
      if (!grouped.has(key)) grouped.set(key, { nc: 0, np: 0, dc: 0, dp: 0, currentMetric: null, previousMetric: null, impactScore: 0 });
      const item = grouped.get(key)!;
      if (isCurrent) {
        item.nc += toNumber(row[defaultNumerator]);
        item.dc += metricConfig?.mode === 'formula' ? toNumber(row[defaultDenominator]) : 1;
      } else {
        item.np += toNumber(row[defaultNumerator]);
        item.dp += metricConfig?.mode === 'formula' ? toNumber(row[defaultDenominator]) : 1;
      }
    };

    currentRows.forEach((row) => addRow(row, true));
    previousRows.forEach((row) => addRow(row, false));

    const rows = Array.from(grouped.entries()).map(([dimensionValue, item]) => {
      item.currentMetric = calcMetric(item.nc, item.dc);
      item.previousMetric = calcMetric(item.np, item.dp);
      const rowChangeRate = item.currentMetric !== null && item.previousMetric !== null && item.previousMetric !== 0 ? (item.currentMetric - item.previousMetric) / item.previousMetric : null;
      const metricDelta = item.currentMetric !== null && item.previousMetric !== null ? item.currentMetric - item.previousMetric : 0;
      item.impactScore = Math.abs(metricDelta);
      const sampleWarning = item.dp < SMALL_SAMPLE_THRESHOLD || item.dc < SMALL_SAMPLE_THRESHOLD;

      return {
        key: `${dimension}-${dimensionValue}`,
        dimensionValue,
        currentMetric: item.currentMetric,
        previousMetric: item.previousMetric,
        changeRate: rowChangeRate,
        numeratorCurrent: item.nc,
        numeratorPrevious: item.np,
        denominatorCurrent: item.dc,
        denominatorPrevious: item.dp,
        reason: buildReason(metricKey, item.nc, item.np, item.dc, item.dp, sampleWarning),
        action: buildAction(metricKey),
        sampleWarning,
        impactScore: sampleWarning ? item.impactScore * 0.5 : item.impactScore,
      };
    });

    rows.sort((a, b) => b.impactScore - a.impactScore);
    return { dimension, rows };
  });

  const topDrivers = dimensionResults
    .flatMap((group) => group.rows.slice(0, 2).map((row) => ({ group: group.dimension, row })))
    .sort((a, b) => b.row.impactScore - a.row.impactScore)
    .slice(0, 2)
    .map((item) => `${item.group}=${item.row.dimensionValue}`);

  const conclusion =
    changeRate === null
      ? `当前周期「${metricKey}」暂无可比结果。`
      : `当前周期「${metricKey}」较上一周期${changeRate >= 0 ? '上升' : '下降'} ${Math.abs(changeRate * 100).toFixed(2)}%，属于${status}。主要影响维度：${topDrivers.join('、') || '暂无明显维度'}。`;

  const suggestions = COST_METRICS.has(metricKey)
    ? ['检查消耗增长较快但付费人数没有同步增长的渠道/广告组', '优先排查成本升高且消耗占比较大的维度值', '关注是否存在预算放量但转化承接不足']
    : ROI_METRICS.has(metricKey)
      ? ['检查付费金额下降但消耗未下降的渠道/广告组', '关注高消耗低回收的维度值', '优先排查 ROI 下降且消耗占比较大的账户']
      : FUNNEL_METRICS.has(metricKey)
        ? ['检查对应漏斗环节的分子是否下降', '直播间进入率下降时排查落地页承接与链路加载', '连麦或付费转化下降时排查咨询师承接、价格策略与用户质量']
        : ['优先查看变化率最大的维度值', '结合趋势图确认变化开始时间', '针对高影响维度执行定向排查'];

  return {
    currentRange,
    previousRange,
    summary: { metricKey, metricType, currentValue, previousValue, changeValue, changeRate, status, direction },
    conclusion,
    dimensionResults,
    suggestions,
  };
}
