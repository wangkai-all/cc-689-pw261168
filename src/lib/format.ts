export function money(value: number): string {
  return `¥${value.toLocaleString('zh-CN')}`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const span = max - min;
  const rough = span / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const candidates = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude);
  const step = candidates.find((candidate) => span / candidate <= count) ?? candidates[candidates.length - 1];
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

export interface HighRiskBin {
  index: number;
  min: number;
  max: number;
  label: string;
  color: string;
}

/** 高风险覆盖用单一蓝色顺序阶（五档），与 0..max 的数值大小严格对应。 */
export function highRiskBins(max: number): HighRiskBin[] {
  const safeMax = Math.max(1, max);
  const step = Math.max(1, Math.ceil((safeMax + 1) / 5));
  return Array.from({ length: 5 }, (_, index) => {
    const min = index * step;
    const maxValue = Math.min(safeMax, min + step - 1);
    return {
      index,
      min,
      max: maxValue,
      label: min >= safeMax && index > 0 ? `${min}+` : min === maxValue ? `${min}` : `${min}–${maxValue}`,
      color: `var(--seq-${index + 1})`,
    };
  });
}

export function binFor(value: number, max: number): HighRiskBin {
  const bins = highRiskBins(max);
  const step = Math.max(1, Math.ceil((Math.max(1, max) + 1) / 5));
  const index = Math.min(4, Math.floor(value / step));
  return bins[index];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
