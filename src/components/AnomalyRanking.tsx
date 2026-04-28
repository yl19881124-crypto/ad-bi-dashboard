import { useMemo, useState } from 'react';
import { Button, Card, Empty, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataRow } from '../types';
import type { AnomalyRankingRow, AnomalyRankingType } from '../types/anomaly';
import { ANOMALY_DIMENSIONS, buildAnomalyRanking, getMissingFields, RANKING_TYPE_OPTIONS } from '../utils/anomalyRanking';

interface Props {
  rows: DataRow[];
  dateRange: [string, string] | null;
  availableFields: string[];
  hasUploadedData: boolean;
}

const topNOptions = [10, 20, 50];

const formatValue = (value: number | null, type: 'number' | 'currency' | 'percent') => {
  if (value === null || !Number.isFinite(value)) return '-';
  if (type === 'currency') return value.toFixed(2);
  if (type === 'percent') return `${(value * 100).toFixed(2)}%`;
  return `${Math.round(value)}`;
};

const typeDisplay: Record<AnomalyRankingType, { current: string; type: 'number' | 'currency' | 'percent' }> = {
  paidUsersDrop: { current: '当前周期付费人数', type: 'number' },
  paidCostRise: { current: '当前周期付费成本', type: 'currency' },
  paidRoiDrop: { current: '当前周期付费ROI', type: 'percent' },
  callUsersDrop: { current: '当前周期连麦人数', type: 'number' },
  callCostRise: { current: '当前周期连麦成本', type: 'currency' },
  enterRateDrop: { current: '当前周期直播间进入率', type: 'percent' },
  enterToCallRateDrop: { current: '当前周期直播间➡️连麦率', type: 'percent' },
};

export default function AnomalyRanking({ rows, dateRange, availableFields, hasUploadedData }: Props) {
  const [rankingType, setRankingType] = useState<AnomalyRankingType>('paidCostRise');
  const [dimension, setDimension] = useState('广告组ID');
  const [topN, setTopN] = useState(10);
  const [onlyValid, setOnlyValid] = useState(true);
  const [detailRow, setDetailRow] = useState<AnomalyRankingRow | null>(null);

  const availableDimensions = useMemo(() => ANOMALY_DIMENSIONS.filter((field) => availableFields.includes(field)), [availableFields]);
  const missingFields = useMemo(() => getMissingFields(rankingType, availableFields), [rankingType, availableFields]);

  const ranking = useMemo(
    () => buildAnomalyRanking({ rows, dateRange, dimension, rankingType, topN, onlyValid }),
    [rows, dateRange, dimension, rankingType, topN, onlyValid],
  );

  const metricMeta = typeDisplay[rankingType];

  const columns: ColumnsType<AnomalyRankingRow> = [
    { title: '排名', dataIndex: 'rank', width: 80, sorter: (a, b) => a.rank - b.rank },
    { title: '维度值', dataIndex: 'dimensionValue', width: 160 },
    { title: metricMeta.current, dataIndex: 'metricCurrent', width: 180, render: (v) => formatValue(v, metricMeta.type), sorter: (a, b) => (a.metricCurrent ?? -1) - (b.metricCurrent ?? -1) },
    { title: '上一周期指标值', dataIndex: 'metricPrevious', width: 180, render: (v) => formatValue(v, metricMeta.type) },
    { title: '变化值', dataIndex: 'changeValue', width: 150, render: (v) => formatValue(v, metricMeta.type), sorter: (a, b) => Math.abs(a.changeValue ?? 0) - Math.abs(b.changeValue ?? 0) },
    { title: '变化率', dataIndex: 'changeRate', width: 140, render: (v) => formatValue(v, 'percent') },
    { title: '当前周期消耗', dataIndex: 'spendCurrent', width: 140, render: (v) => formatValue(v, 'currency') },
    { title: '上一周期消耗', dataIndex: 'spendPrevious', width: 140, render: (v) => formatValue(v, 'currency') },
    { title: '当前周期付费人数', dataIndex: 'paidUsersCurrent', width: 160, render: (v) => formatValue(v, 'number') },
    { title: '上一周期付费人数', dataIndex: 'paidUsersPrevious', width: 160, render: (v) => formatValue(v, 'number') },
    { title: '当前周期连麦人数', dataIndex: 'callUsersCurrent', width: 160, render: (v) => formatValue(v, 'number') },
    { title: '上一周期连麦人数', dataIndex: 'callUsersPrevious', width: 160, render: (v) => formatValue(v, 'number') },
    { title: '判断原因', dataIndex: 'reason', width: 400 },
    { title: '建议动作', dataIndex: 'action', width: 320 },
    {
      title: '操作',
      key: 'ops',
      fixed: 'right',
      width: 190,
      render: (_, row) => (
        <Space>
          <Button type="link" onClick={() => setDetailRow(row)}>查看详情</Button>
          <Button
            type="link"
            onClick={async () => {
              const text = `维度值：${row.dimensionValue}\n异常类型：${RANKING_TYPE_OPTIONS.find((it) => it.value === row.rankingType)?.label ?? '-'}\n判断原因：${row.reason}\n建议动作：${row.action}`;
              try {
                await navigator.clipboard.writeText(text);
                message.success('已复制排查建议');
              } catch {
                message.warning('复制失败，请手动复制');
              }
            }}
          >
            复制建议
          </Button>
        </Space>
      ),
    },
  ];

  if (!hasUploadedData) return <Empty description="请先上传 Excel 数据" />;
  if (!dateRange) return <Empty description="请先选择日期范围" />;
  if (availableDimensions.length === 0) return <Empty description="当前数据缺少可用异常维度" />;

  return (
    <Card
      title="异常榜单"
      extra={
        <Space wrap>
          <Select style={{ width: 220 }} value={rankingType} options={RANKING_TYPE_OPTIONS} onChange={setRankingType} />
          <Select style={{ width: 160 }} value={dimension} options={availableDimensions.map((item) => ({ label: item, value: item }))} onChange={setDimension} />
          <Select style={{ width: 100 }} value={topN} options={topNOptions.map((item) => ({ label: `Top ${item}`, value: item }))} onChange={setTopN} />
          <Space size={4}>
            <Typography.Text>只看有效样本</Typography.Text>
            <Switch checked={onlyValid} onChange={setOnlyValid} />
          </Space>
        </Space>
      }
    >
      {missingFields.length > 0 ? (
        <Empty description="当前数据缺少必要字段，无法计算该榜单" />
      ) : ranking.noPreviousData ? (
        <Empty description="暂无上一周期数据，无法生成异常榜单" />
      ) : ranking.rows.length === 0 ? (
        <Empty description="当前筛选条件下暂无明显异常" />
      ) : (
        <Table rowKey="key" columns={columns} dataSource={ranking.rows} pagination={{ pageSize: 10 }} scroll={{ x: 2800 }} size="small" />
      )}

      <Modal title="异常对象计算明细" open={Boolean(detailRow)} onCancel={() => setDetailRow(null)} onOk={() => setDetailRow(null)} width={820}>
        {detailRow && (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Tag color="red">{RANKING_TYPE_OPTIONS.find((item) => item.value === detailRow.rankingType)?.label}</Tag>
            <Typography.Text>维度值：{detailRow.dimensionValue}</Typography.Text>
            <Typography.Text>当前周期指标值：{formatValue(detailRow.metricCurrent, metricMeta.type)}</Typography.Text>
            <Typography.Text>上一周期指标值：{formatValue(detailRow.metricPrevious, metricMeta.type)}</Typography.Text>
            <Typography.Text>分子：{formatValue(detailRow.detail.numeratorPrevious, 'currency')} ➜ {formatValue(detailRow.detail.numeratorCurrent, 'currency')}</Typography.Text>
            <Typography.Text>分母：{formatValue(detailRow.detail.denominatorPrevious, 'number')} ➜ {formatValue(detailRow.detail.denominatorCurrent, 'number')}</Typography.Text>
            <Typography.Text>判断原因：{detailRow.reason}</Typography.Text>
            <Typography.Text>建议动作：{detailRow.action}</Typography.Text>
          </Space>
        )}
      </Modal>
    </Card>
  );
}
