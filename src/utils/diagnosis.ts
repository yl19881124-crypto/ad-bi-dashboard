import dayjs from 'dayjs';
import { getMetricTrendDirection, getMetricType, metricConfigMap } from '../config/metricConfig';
import type { DataRow } from '../types';
import type { DiagnosisDimensionResult, DiagnosisResult, DiagnosisSecondaryDimensionResult } from '../types/diagnosis';
import { normalizeExcelDate } from './date';

const EPSILON = 0.0001;
const SMALL_SAMPLE_THRESHOLD = 20;
const SECONDARY_DIMENSIONS = ['渠道', '代理', '版位', '操作系统', '账户命名', '优化目标', '出价方式', '账户名称', '广告组名称'];

const COST_METRICS = new Set(['当日付费成本', '当日连麦成本', '3日付费成本']);
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

function ratioChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

function toPct(value: number | null) {
  if (value === null) return '--';
  return `${(value * 100).toFixed(2)}%`;
}

function buildFormulaReason(metricKey: string, nc: number, np: number, dc: number, dp: number, sampleWarning: boolean) {
  if (sampleWarning) return '样本量较小，波动仅供参考';

  const numeratorChange = ratioChange(nc, np);
  const denominatorChange = ratioChange(dc, dp);

  if (COST_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) > 0.02 && (denominatorChange ?? 0) <= 0.01) return `消耗上升 ${toPct(numeratorChange)}，但分母未同步增长，导致成本上升`;
    if (Math.abs(numeratorChange ?? 0) <= 0.03 && (denominatorChange ?? 0) < -0.03) return `消耗基本持平（${toPct(numeratorChange)}），但分母下降 ${toPct(denominatorChange)}，导致成本升高`;
    if ((numeratorChange ?? 0) < -0.01 && (denominatorChange ?? 0) < -0.01 && Math.abs(denominatorChange ?? 0) > Math.abs(numeratorChange ?? 0)) {
      return `消耗下降 ${toPct(numeratorChange)}，但分母下降更快（${toPct(denominatorChange)}），成本仍上升`;
    }
    return '分母较小，成本波动仅供参考';
  }

  if (ROI_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.03 && (denominatorChange ?? 0) >= -0.01) return `付费金额下降 ${toPct(numeratorChange)}，但消耗未同步下降，导致 ROI 下滑`;
    if ((denominatorChange ?? 0) > 0.03 && (numeratorChange ?? 0) <= 0.01) return `消耗上升 ${toPct(denominatorChange)}，但付费金额增长不足，导致 ROI 下滑`;
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) {
      return `付费金额和消耗均下降，但付费金额下降更快（${toPct(numeratorChange)} vs ${toPct(denominatorChange)}）`;
    }
    return '消耗较小，ROI 波动仅供参考';
  }

  if (FUNNEL_METRICS.has(metricKey)) {
    if ((numeratorChange ?? 0) < -0.03 && Math.abs(denominatorChange ?? 0) <= 0.02) return `分子下降 ${toPct(numeratorChange)}，分母基本持平，导致转化率下降`;
    if ((denominatorChange ?? 0) > 0.03 && (numeratorChange ?? 0) <= 0.01) return `分母增长 ${toPct(denominatorChange)}，但分子未同步增长，导致转化率下降`;
    if ((numeratorChange ?? 0) < 0 && (denominatorChange ?? 0) < 0 && Math.abs(numeratorChange ?? 0) > Math.abs(denominatorChange ?? 0)) {
      return `分子分母均下降，但分子下降更快（${toPct(numeratorChange)} vs ${toPct(denominatorChange)}）`;
    }
    return '样本量较小，波动仅供参考';
  }

  return '核心指标波动';
}

function buildActionByPath(path: string[]) {
  const pathText = path.join(' + ');
  if (path.includes('渠道')) return `优先检查 ${pathText} 下的消耗、人数与 ROI 是否同步恶化`;
  if (path.includes('操作系统')) return `检查 ${pathText} 下素材、落地页、直播间承接是否异常`;
  if (path.includes('广告组名称')) return `优先查看 ${pathText} 的预算、出价、素材与转化回传变化`;
  if (path.includes('账户命名') || path.includes('账户名称')) return `检查 ${pathText} 是否存在预算调整、计划暂停或素材衰退`;
  return `围绕 ${pathText} 继续逐层排查关键账户与广告组`;
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

  type PeriodRow = DataRow & { __date: string | null };
  const periodRows: PeriodRow[] = rows
    .map((row) => ({ ...row, __date: normalizeExcelDate(row.日期) }))
    .filter((row) => row.__date && (isInRange(row.__date, currentRange) || isInRange(row.__date, previousRange))) as PeriodRow[];

  const currentRows = periodRows.filter((row) => row.__date && isInRange(row.__date, currentRange));
  const previousRows = periodRows.filter((row) => row.__date && isInRange(row.__date, previousRange));

  if (!currentRows.length || !previousRows.length) {
    return {
      currentRange,
      previousRange,
      summary: { metricKey, metricType, currentValue: null, previousValue: null, changeValue: null, changeRate: null, status: '持平', direction },
      conclusion: !currentRows.length ? '当前筛选条件下暂无数据' : '暂无上一周期数据，无法计算环比',
      dimensionResults: [],
      suggestions: [],
      error: !currentRows.length ? '当前筛选条件下暂无数据' : '暂无上一周期数据，无法计算环比',
    };
  }

  const sumByField = (targetRows: PeriodRow[], field: string) => targetRows.reduce((acc, row) => acc + toNumber(row[field]), 0);

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

  const allDrillDimensions = SECONDARY_DIMENSIONS.filter((dimension) => fieldKeys.has(dimension));

  const buildGroupedRows = (
    targetCurrentRows: PeriodRow[],
    targetPreviousRows: PeriodRow[],
    dimension: string,
  ) => {
    const grouped = new Map<string, { nc: number; np: number; dc: number; dp: number }>();

    const addRow = (row: PeriodRow, isCurrent: boolean) => {
      const key = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
      if (!grouped.has(key)) grouped.set(key, { nc: 0, np: 0, dc: 0, dp: 0 });
      const item = grouped.get(key)!;
      if (isCurrent) {
        item.nc += toNumber(row[defaultNumerator]);
        item.dc += metricConfig?.mode === 'formula' ? toNumber(row[defaultDenominator]) : 1;
      } else {
        item.np += toNumber(row[defaultNumerator]);
        item.dp += metricConfig?.mode === 'formula' ? toNumber(row[defaultDenominator]) : 1;
      }
    };

    targetCurrentRows.forEach((row) => addRow(row, true));
    targetPreviousRows.forEach((row) => addRow(row, false));

    const allRows = Array.from(grouped.entries()).map(([dimensionValue, item]) => {
      const currentMetric = calcMetric(item.nc, item.dc);
      const previousMetric = calcMetric(item.np, item.dp);
      const metricDelta = currentMetric !== null && previousMetric !== null ? currentMetric - previousMetric : 0;
      const sampleWarning = item.dp < SMALL_SAMPLE_THRESHOLD || item.dc < SMALL_SAMPLE_THRESHOLD;
      return {
        key: `${dimension}-${dimensionValue}`,
        dimensionValue,
        currentMetric,
        previousMetric,
        changeRate: previousMetric !== null && previousMetric !== 0 && currentMetric !== null ? (currentMetric - previousMetric) / previousMetric : null,
        numeratorCurrent: item.nc,
        numeratorPrevious: item.np,
        denominatorCurrent: item.dc,
        denominatorPrevious: item.dp,
        sampleWarning,
        metricDelta,
      };
    });

    const totalDelta = allRows.reduce((sum, item) => sum + item.metricDelta, 0);
    const sameDirectionRows = allRows.filter((item) => (totalDelta < 0 ? item.metricDelta < 0 : item.metricDelta > 0));
    const sameDirectionSum = Math.abs(sameDirectionRows.reduce((sum, item) => sum + item.metricDelta, 0));

    return allRows.map((item) => {
      const contribution = item.metricDelta === 0 || sameDirectionSum <= EPSILON || Math.sign(item.metricDelta) !== Math.sign(totalDelta)
        ? null
        : Math.abs(item.metricDelta) / sameDirectionSum;
      const impactScore = metricConfig?.mode === 'source'
        ? Math.abs(item.metricDelta)
        : (Math.abs(item.metricDelta) * (item.denominatorCurrent + item.denominatorPrevious)) / 2;
      return {
        ...item,
        contribution,
        impactScore: item.sampleWarning ? impactScore * 0.5 : impactScore,
      };
    });
  };

  const dimensionResults: DiagnosisDimensionResult[] = dimensions.map((dimension) => {
    const rowsByDimension = buildGroupedRows(currentRows, previousRows, dimension)
      .map((item) => {
        const valueDiff = (item.currentMetric ?? 0) - (item.previousMetric ?? 0);
        const reason = metricConfig?.mode === 'source'
          ? `${dimension}=${item.dimensionValue} ${valueDiff >= 0 ? '上升' : '下降'} ${Math.abs(valueDiff).toFixed(metricType === 'number' ? 0 : 2)}，贡献 ${toPct(item.contribution)}`
          : buildFormulaReason(metricKey, item.numeratorCurrent, item.numeratorPrevious, item.denominatorCurrent, item.denominatorPrevious, item.sampleWarning);

        const secondaryResults: DiagnosisSecondaryDimensionResult[] = allDrillDimensions
          .filter((subDimension) => subDimension !== dimension)
          .map((subDimension) => {
            const scopedCurrentRows = currentRows.filter((row) => {
              const value = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
              return value === item.dimensionValue;
            });
            const scopedPreviousRows = previousRows.filter((row) => {
              const value = row[dimension] === null || row[dimension] === undefined || String(row[dimension]).trim() === '' ? '未知' : String(row[dimension]);
              return value === item.dimensionValue;
            });

            const subRows = buildGroupedRows(scopedCurrentRows, scopedPreviousRows, subDimension)
              .map((subItem) => ({
                ...subItem,
                reason: metricConfig?.mode === 'source'
                  ? `${subDimension}=${subItem.dimensionValue} 对 ${dimension}=${item.dimensionValue} 贡献 ${toPct(subItem.contribution)}`
                  : buildFormulaReason(metricKey, subItem.numeratorCurrent, subItem.numeratorPrevious, subItem.denominatorCurrent, subItem.denominatorPrevious, subItem.sampleWarning),
              }));

            const sorted = subRows
              .sort((a, b) => {
                if (metricConfig?.mode === 'source') return b.impactScore - a.impactScore;
                if (COST_METRICS.has(metricKey)) {
                  const aCostUp = ((a.currentMetric ?? 0) - (a.previousMetric ?? 0)) > 0 ? 1 : 0;
                  const bCostUp = ((b.currentMetric ?? 0) - (b.previousMetric ?? 0)) > 0 ? 1 : 0;
                  if (aCostUp !== bCostUp) return bCostUp - aCostUp;
                  return b.impactScore - a.impactScore;
                }
                const aDown = ((a.currentMetric ?? 0) - (a.previousMetric ?? 0)) < 0 ? 1 : 0;
                const bDown = ((b.currentMetric ?? 0) - (b.previousMetric ?? 0)) < 0 ? 1 : 0;
                if (aDown !== bDown) return bDown - aDown;
                return b.impactScore - a.impactScore;
              })
              .slice(0, 5);

            return { dimension: subDimension, rows: sorted };
          })
          .filter((group) => group.rows.length > 0);

        return {
          ...item,
          reason,
          action: buildActionByPath([dimension]),
          secondaryResults,
        };
      })
      .sort((a, b) => b.impactScore - a.impactScore);

    return { dimension, rows: rowsByDimension };
  });

  const primary = dimensionResults.flatMap((group) => group.rows.slice(0, 1).map((row) => ({ group: group.dimension, row })))[0];
  const secondary = primary?.row.secondaryResults?.flatMap((group) => group.rows.slice(0, 1).map((row) => ({ group: group.dimension, row })))
    .sort((a, b) => b.row.impactScore - a.row.impactScore)?.[0];

  const conclusion =
    changeRate === null
      ? `当前周期「${metricKey}」暂无可比结果。`
      : `当前周期「${metricKey}」较上一周期${changeRate >= 0 ? '上升' : '下降'} ${Math.abs(changeRate * 100).toFixed(2)}%。一级下钻主要为「${primary ? `${primary.group}=${primary.row.dimensionValue}` : '暂无'}」，贡献 ${toPct(primary?.row.contribution ?? null)}。${secondary ? `继续下钻发现「${secondary.group}=${secondary.row.dimensionValue}」是关键拖累/驱动路径，贡献 ${toPct(secondary.row.contribution)}。` : ''}`;

  const suggestions = [
    buildActionByPath(primary ? [primary.group] : ['维度']),
    buildActionByPath(primary && secondary ? [primary.group, secondary.group] : ['渠道', '广告组名称']),
    '优先核查关键路径下账户命名、广告组、预算与素材变化',
  ];

  return {
    currentRange,
    previousRange,
    summary: { metricKey, metricType, currentValue, previousValue, changeValue, changeRate, status, direction },
    conclusion,
    dimensionResults,
    suggestions,
  };
}
