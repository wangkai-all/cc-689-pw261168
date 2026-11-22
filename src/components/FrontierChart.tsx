import { useMemo, useRef, useState } from 'react';
import { binFor, highRiskBins, money, niceTicks } from '../lib/format';
import type { FrontierPoint, SearchResult } from '../lib/types';
import { Icon } from './ui';

const WIDTH = 920;
const HEIGHT = 420;
const PAD = { top: 52, right: 28, bottom: 56, left: 56 };

export function FrontierChart({
  result,
  budget,
  onBudgetChange,
  selectedKey,
  onSelect,
  hoverKey,
  onHover,
  maxHighRisk,
  coverageCeiling,
  budgetRange,
}: {
  result: SearchResult;
  budget: number;
  onBudgetChange: (budget: number) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
  maxHighRisk: number;
  coverageCeiling: number;
  budgetRange: { min: number; max: number; step: number };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; key: string; below: boolean } | null>(null);

  const bounds = useMemo(() => {
    const costs = result.frontier.map((point) => point.cost);
    const coverages = result.frontier.map((point) => point.coverage);
    const testValues = [...costs, budget, result.minFeasibleCost ?? 0];
    const minCost = Math.min(...testValues);
    const maxCost = Math.max(...testValues);
    const minCoverage = Math.min(...coverages);
    const maxCoverage = Math.max(...coverages);
    const costPad = Math.max(4, Math.round((maxCost - minCost) * 0.08));
    const covPad = Math.max(1, Math.round((maxCoverage - minCoverage) * 0.12));
    return {
      minCost: Math.max(0, minCost - costPad),
      maxCost: maxCost + costPad,
      minCoverage: Math.max(0, minCoverage - covPad),
      maxCoverage: Math.min(coverageCeiling, maxCoverage + covPad),
    };
  }, [result.frontier, result.minFeasibleCost, budget, coverageCeiling]);

  const xScale = (cost: number) =>
    PAD.left + ((cost - bounds.minCost) / Math.max(1, bounds.maxCost - bounds.minCost)) * (WIDTH - PAD.left - PAD.right);
  const yScale = (coverage: number) =>
    HEIGHT - PAD.bottom - ((coverage - bounds.minCoverage) / Math.max(1, bounds.maxCoverage - bounds.minCoverage)) * (HEIGHT - PAD.top - PAD.bottom);

  const xTicks = niceTicks(bounds.minCost, bounds.maxCost, 7);
  const yTicks = niceTicks(bounds.minCoverage, bounds.maxCoverage, 5);

  const bins = highRiskBins(maxHighRisk);
  const pointColor = (point: FrontierPoint) => binFor(point.highRiskCoverage, maxHighRisk).color;

  const hovered = result.frontier.find((point) => point.key === hoverKey) ?? null;
  const selected = result.frontier.find((point) => point.key === selectedKey) ?? null;
  const shown = hovered ?? selected;

  const budgetX = xScale(Math.min(bounds.maxCost, Math.max(bounds.minCost, budget)));

  const clampBudget = (value: number) => {
    const min = budgetRange.min;
    const max = budgetRange.max;
    return Math.max(min, Math.min(max, Math.round(value)));
  };

  const pointerToBudget = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return budget;
    const rect = svg.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const px = ratio * WIDTH;
    const cost = bounds.minCost + ((px - PAD.left) / (WIDTH - PAD.left - PAD.right)) * (bounds.maxCost - bounds.minCost);
    return clampBudget(cost);
  };

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    onBudgetChange(pointerToBudget(event.clientX));
  };

  const showTooltip = (point: FrontierPoint, event: React.MouseEvent | React.FocusEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const rawX = (xScale(point.cost) / WIDTH) * rect.width;
    // 提示框最小宽 186px，靠近左右边缘时向内收，避免溢出卡片。
    const px = Math.min(rect.width - 100, Math.max(100, rawX));
    const py = (yScale(point.coverage) / HEIGHT) * rect.height;
    // 点太靠近绘图区顶部时把提示放到点的下方，避免被卡片裁掉。
    setTooltip({ x: px, y: py, key: point.key, below: py < 168 });
    onHover(point.key);
    void event;
  };

  const hideTooltip = () => {
    setTooltip(null);
    onHover(null);
  };

  const exited = result.frontier.filter((point) => point.cost > budget);
  const inside = result.frontier.filter((point) => point.cost <= budget);
  const tooltipPoint = tooltip ? result.frontier.find((point) => point.key === tooltip.key) : null;

  return (
    <section className="card chart-card" aria-label="方案前沿散点图">
      <div className="card-head chart-head">
        <div>
          <h3 className="card-title">费用 × 覆盖 × 高风险覆盖</h3>
          <p className="card-sub">
            每个点是一组互不占优的方案；颜色为高风险设备覆盖量（同一蓝色顺序阶）。拖动预算线查看哪些方案退出可行范围。
          </p>
        </div>
        <div className="chart-legend" aria-label="高风险覆盖图例">
          {bins.map((bin) => (
            <span key={bin.index} className="legend-item">
              <span className="swatch swatch-dot" style={{ background: bin.color }} aria-hidden />
              <span>{bin.label}</span>
            </span>
          ))}
          <span className="legend-caption">高风险覆盖（台）</span>
        </div>
      </div>

      <div className="chart-shell">
        <svg
          ref={svgRef}
          className={`chart ${dragging ? 'is-dragging' : ''}`}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="group"
          aria-label="方案前沿散点图：横轴费用，纵轴去重覆盖设备数，颜色表示高风险设备覆盖数"
          onPointerMove={handlePointer}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => {
            setDragging(false);
            hideTooltip();
          }}
        >
          <defs>
            <clipPath id="plot-clip">
              <rect
                x={PAD.left}
                y={PAD.top}
                width={WIDTH - PAD.left - PAD.right}
                height={HEIGHT - PAD.top - PAD.bottom}
              />
            </clipPath>
          </defs>

          {/* 预算外的区域用极浅底色提示，不遮挡数据 */}
          <rect
            x={Math.max(PAD.left, budgetX)}
            y={PAD.top}
            width={Math.max(0, WIDTH - PAD.right - Math.max(PAD.left, budgetX))}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="var(--excluded-wash)"
          />

          {xTicks.map((tick) => (
            <g key={`x-${tick}`}>
              <line
                x1={xScale(tick)}
                x2={xScale(tick)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                className="gridline"
              />
              <text x={xScale(tick)} y={HEIGHT - PAD.bottom + 20} className="axis-label" textAnchor="middle">
                {tick}
              </text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y-${tick}`}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yScale(tick)}
                y2={yScale(tick)}
                className="gridline"
              />
              <text x={PAD.left - 12} y={yScale(tick) + 4} className="axis-label" textAnchor="end">
                {tick}
              </text>
            </g>
          ))}

          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={HEIGHT - PAD.bottom}
            y2={HEIGHT - PAD.bottom}
            className="axis-line"
          />
          <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="axis-line" />

          <text x={(PAD.left + WIDTH - PAD.right) / 2} y={HEIGHT - 12} className="axis-title" textAnchor="middle">
            站点组合费用（元）
          </text>
          <text
            transform={`translate(16 ${(PAD.top + HEIGHT - PAD.bottom) / 2}) rotate(-90)`}
            className="axis-title"
            textAnchor="middle"
          >
            去重覆盖设备数（台）
          </text>

          {/* 支配阶梯：把前沿点按费用连成一条不上升的折线，帮助读出互不占优的形状 */}
          <polyline
            points={result.frontier.map((point) => `${xScale(point.cost)},${yScale(point.coverage)}`).join(' ')}
            className="frontier-line"
            clipPath="url(#plot-clip)"
          />

          {/* 预算线 */}
          <g className="budget-line">
            <line
              x1={budgetX}
              x2={budgetX}
              y1={PAD.top - 8}
              y2={HEIGHT - PAD.bottom + 6}
              className="budget-rule"
            />
            <g
              transform={`translate(${budgetX} 0)`}
              className="budget-handle"
              onPointerDown={(event) => {
                event.preventDefault();
                (event.target as Element).setPointerCapture?.(event.pointerId);
                setDragging(true);
              }}
              role="slider"
              tabIndex={0}
              aria-label="预算"
              aria-valuemin={budgetRange.min}
              aria-valuemax={budgetRange.max}
              aria-valuenow={budget}
              aria-valuetext={`预算 ${money(budget)}`}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 5 : 1;
                if (event.key === 'ArrowLeft') {
                  event.preventDefault();
                  onBudgetChange(clampBudget(budget - step));
                } else if (event.key === 'ArrowRight') {
                  event.preventDefault();
                  onBudgetChange(clampBudget(budget + step));
                } else if (event.key === 'Home') {
                  event.preventDefault();
                  onBudgetChange(budgetRange.min);
                } else if (event.key === 'End') {
                  event.preventDefault();
                  onBudgetChange(budgetRange.max);
                }
              }}
            >
              <rect x={-11} y={PAD.top - 12} width={22} height={22} rx={5} className="budget-handle-bg" />
              <path d="M-4 -1h8M-1 -4v6M4 -4v6" transform={`translate(0 ${PAD.top - 1})`} className="budget-grip" />
              <g transform={`translate(0 ${PAD.top - 22})`}>
                <rect x={-52} y={-24} width={104} height={22} rx={5} className="budget-tag" />
                <text textAnchor="middle" y={-9} className="budget-tag-text">
                  预算 {money(budget)}
                </text>
              </g>
            </g>
          </g>

          {/* 预算内 / 预算外的方案点 */}
          <g clipPath="url(#plot-clip)">
            {result.frontier.map((point) => {
              const isOut = point.cost > budget;
              const isHovered = hoverKey === point.key;
              const isSelected = selectedKey === point.key;
              const cx = xScale(point.cost);
              const cy = yScale(point.coverage);
              return (
                <g key={point.key} className="point-group">
                  <circle
                    cx={cx}
                    cy={cy}
                    r={14}
                    className="point-hit"
                    fill="transparent"
                    stroke="none"
                    tabIndex={isOut ? -1 : 0}
                    role="button"
                    aria-label={`方案 ${point.id}：费用 ${money(point.cost)}，覆盖 ${point.coverage} 台，高风险覆盖 ${point.highRiskCoverage} 台${isOut ? '，已超出预算' : ''}`}
                    onClick={() => onSelect(point.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(point.key);
                      }
                    }}
                    onMouseEnter={(event) => showTooltip(point, event)}
                    onFocus={(event) => showTooltip(point, event)}
                    onMouseLeave={hideTooltip}
                    onBlur={hideTooltip}
                  />
                  {(isHovered || isSelected) && <circle cx={cx} cy={cy} r={11} className="point-halo" aria-hidden />}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 7 : isHovered ? 6.5 : 5.5}
                    fill={isOut ? 'var(--point-excluded)' : pointColor(point)}
                    stroke={isOut ? 'var(--point-excluded-ring)' : 'var(--surface-1)'}
                    strokeWidth={2}
                    className={`point ${isOut ? 'point-out' : ''}`}
                    aria-hidden
                  />
                  {isSelected ? (
                    <text x={cx} y={cy - 14} textAnchor="middle" className="point-label">
                      {point.id}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* 极值直标：只标最低费用与最高覆盖，避免每个点都挂数字 */}
          {result.minCostPoint ? (
            <text
              x={xScale(result.minCostPoint.cost) + 14}
              y={yScale(result.minCostPoint.coverage) + 26}
              className="annotation"
              textAnchor="start"
            >
              最低费用 {money(result.minCostPoint.cost)} · 覆盖 {result.minCostPoint.coverage} 台
            </text>
          ) : null}
          {result.frontier.length > 1 ? (
            <text
              x={Math.min(WIDTH - PAD.right - 6, xScale(result.frontier[result.frontier.length - 1].cost) - 12)}
              y={Math.max(PAD.top + 12, yScale(result.frontier[result.frontier.length - 1].coverage) - 16)}
              className="annotation"
              textAnchor="end"
            >
              最高覆盖 {result.frontier[result.frontier.length - 1].coverage} 台
            </text>
          ) : null}
        </svg>

        {tooltip && tooltipPoint ? (
          <div
            className={`chart-tooltip ${tooltip.below ? 'is-below' : ''}`}
            style={{ left: tooltip.x, top: tooltip.y }}
            role="status"
            aria-live="polite"
          >
            <div className="tooltip-head">
              <span className="tooltip-id">{tooltipPoint.id}</span>
              <span className={`tooltip-budget ${tooltipPoint.cost <= budget ? 'in' : 'out'}`}>
                {tooltipPoint.cost <= budget ? '预算内' : `超预算 ${money(tooltipPoint.cost - budget)}`}
              </span>
            </div>
            <dl className="tooltip-grid">
              <div>
                <dt>费用</dt>
                <dd>{money(tooltipPoint.cost)}</dd>
              </div>
              <div>
                <dt>覆盖</dt>
                <dd>
                  {tooltipPoint.coverage}
                  <span className="tooltip-unit">台</span>
                </dd>
              </div>
              <div>
                <dt>高风险</dt>
                <dd>
                  {tooltipPoint.highRiskCoverage}
                  <span className="tooltip-unit">台</span>
                </dd>
              </div>
            </dl>
            <div className="tooltip-foot">
              <span className="tooltip-swatch" style={{ background: pointColor(tooltipPoint) }} aria-hidden />
              {tooltipPoint.representative.siteIds.join(' · ')}
            </div>
            <div className="tooltip-foot muted">
              重复覆盖 {tooltipPoint.representative.duplicates} 台 · 同指标组合 {tooltipPoint.variantCount} 个
            </div>
          </div>
        ) : null}
      </div>

      <div className="chart-controls">
        <label className="budget-range">
          <span className="budget-range-label">
            <Icon name="pin" size={14} /> 预算
          </span>
          <input
            type="range"
            min={budgetRange.min}
            max={budgetRange.max}
            step={budgetRange.step}
            value={budget}
            onChange={(event) => onBudgetChange(Number(event.target.value))}
            aria-label="拖动预算"
          />
          <output className="budget-range-value">{money(budget)}</output>
        </label>
        <div className="chart-stats">
          <span className="in-count">
            <span className="swatch swatch-dot" style={{ background: 'var(--accent)' }} aria-hidden />
            预算内 {inside.length} 组
          </span>
          <span className="out-count">
            <span className="swatch swatch-dot" style={{ background: 'var(--point-excluded)' }} aria-hidden />
            已退出 {exited.length} 组
          </span>
          <span className="muted">共 {result.frontier.length} 组前沿</span>
        </div>
      </div>

      {exited.length > 0 ? (
        <div className="exited-tray" aria-live="polite">
          <div className="exited-head">
            <strong>已退出可行范围</strong>
            <span>这些方案仍在前沿中，只是费用超过当前预算；调高预算即可重新纳入。</span>
          </div>
          <div className="exited-chips">
            {exited.map((point) => (
              <button
                key={point.key}
                type="button"
                className="exited-chip"
                onClick={() => onSelect(point.key)}
                onMouseEnter={() => onHover(point.key)}
                onMouseLeave={() => onHover(null)}
              >
                <span>{point.id}</span>
                <span>{money(point.cost)}</span>
                <span className="muted">覆盖 {point.coverage}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="chart-note" aria-live="polite">
          {shown
            ? `${shown.id}：${money(shown.cost)} · 覆盖 ${shown.coverage} 台 · 高风险 ${shown.highRiskCoverage} 台。`
            : '当前预算覆盖全部前沿方案；向右拖动预算线可将方案移出可行范围。'}
        </p>
      )}
    </section>
  );
}
