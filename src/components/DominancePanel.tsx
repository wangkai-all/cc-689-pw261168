import { money } from '../lib/format';
import type { DominatedSample, SearchResult } from '../lib/types';
import { Icon, StatusChip } from './ui';

export function DominancePanel({
  result,
  budget,
  compareWitness,
  onSelectKey,
  hoverKey,
  onHover,
}: {
  result: SearchResult;
  budget: number;
  compareWitness: string | null;
  onSelectKey: (key: string) => void;
  hoverKey: string | null;
  onHover: (key: string | null) => void;
  maxHighRisk: number;
}) {
  const focusedWitness = compareWitness
    ? result.frontier.find((point) => point.id === compareWitness)
    : null;
  const shown = focusedWitness
    ? result.dominatedSamples.filter((sample) => sample.reason.witnessId === focusedWitness.id)
    : result.dominatedSamples;

  return (
    <section className="card dominance-card" aria-label="被支配方案">
      <div className="card-head">
        <div>
          <h3 className="card-title">被支配方案与理由</h3>
          <p className="card-sub">
            共 {result.dominatedCombinationCount.toLocaleString('zh-CN')} 个可行组合被支配；展示其中{' '}
            {shown.length} 个。每个都给出具体支配者与逐项差距。
          </p>
        </div>
        <StatusChip tone="neutral">{budget.toLocaleString('zh-CN')} 元预算</StatusChip>
      </div>

      {focusedWitness ? (
        <div className="witness-banner">
          <span>
            正在查看 <strong>{focusedWitness.id}</strong> 支配了哪些方案 ·{' '}
            <button type="button" className="link-button" onClick={() => onSelectKey(focusedWitness.key)}>
              选中它
            </button>
          </span>
          <span className="muted">
            {money(focusedWitness.cost)} · 覆盖 {focusedWitness.coverage} · 高风险 {focusedWitness.highRiskCoverage}
          </span>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="empty-note">
          {focusedWitness
            ? '该前沿方案没有出现在抽样被支配列表中；它仍是真实的前沿点。'
            : '当前约束下没有被支配的可行组合——所有可行组合都已在前沿上。'}
        </p>
      ) : (
        <ul className="dominated-list">
          {shown.map((sample) => (
            <DominatedRow
              key={sample.key}
              sample={sample}
              result={result}
              active={hoverKey === sample.key}
              onHover={onHover}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DominatedRow({
  sample,
  result,
  active,
  onHover,
}: {
  sample: DominatedSample;
  result: SearchResult;
  active: boolean;
  onHover: (key: string | null) => void;
}) {
  const witness = result.frontier.find((point) => point.id === sample.reason.witnessId);
  return (
    <li
      className={`dominated-row ${active ? 'is-active' : ''}`}
      onMouseEnter={() => onHover(sample.key)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="dominated-head">
        <span className="dominated-id">{sample.id}</span>
        <span className="dominated-site-ids">{sample.representative.siteIds.join(' · ')}</span>
        <span className="dominated-count">同指标组合 {sample.variantCount}</span>
      </div>
      <div className="dominated-metrics">
        <span>
          费用 <strong>{money(sample.cost)}</strong>
        </span>
        <span>
          覆盖 <strong>{sample.coverage}</strong>
        </span>
        <span>
          高风险 <strong>{sample.highRiskCoverage}</strong>
        </span>
        <span className="muted">重复 {sample.representative.duplicates}</span>
      </div>
      <div className="dominated-reason">
        <span className="reason-icon" aria-hidden>
          <Icon name="alert" size={13} />
        </span>
        <div>
          <p>
            <strong>{sample.reason.summary}</strong>
          </p>
          <div className="reason-clauses">
            {sample.reason.clauses.map((clause) => (
              <span key={clause} className="clause">
                {clause}
              </span>
            ))}
          </div>
          {witness ? (
            <p className="reason-detail">
              支配者 {witness.id}：{money(witness.cost)} · 覆盖 {witness.coverage} · 高风险{' '}
              {witness.highRiskCoverage}；选中后在前沿图中高亮。
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
