import type { PreparedData } from '../lib/coverage';
import { money, pct } from '../lib/format';
import type { FrontierPoint, PlanVariant, SearchResult } from '../lib/types';
import { Icon, Meter, SegmentedBar, StatusChip } from './ui';

export function PlanDetailPanel({
  result,
  point,
  variant,
  variantIndex,
  onVariantChange,
  onLockSite,
  lockedSiteIds,
  budget,
  prepared,
  onCompare,
}: {
  result: SearchResult;
  point: FrontierPoint | null;
  variant: PlanVariant | null;
  variantIndex: number;
  onVariantChange: (index: number) => void;
  onLockSite: (siteId: string) => void;
  lockedSiteIds: string[];
  budget: number;
  prepared: PreparedData;
  onCompare: (witnessId: string) => void;
}) {
  const groupBins = variant
    ? variant.detail.groupCoverage.map((row, index) => ({
        label: row.group.shortName,
        value: row.covered,
        color: `var(--group-${index + 1})`,
      }))
    : [];

  if (!point || !variant) {
    return (
      <section className="card detail-card" aria-label="方案明细">
        <div className="empty-detail">
          <Icon name="info" size={20} />
          <div>
            <h3>预算内暂时没有可选方案</h3>
            <p>提高预算，或在前沿图中选择任一方案查看明细。</p>
          </div>
        </div>
      </section>
    );
  }

  const detail = variant.detail;
  const overBudget = detail.metrics.cost > budget;
  const mustCheckSet = new Set(result.mustCheckDeviceIds);
  const missesMustCheck = result.mustCheckDeviceIds.filter((id) =>
    detail.missedDeviceIds.includes(id),
  );

  return (
    <section className="card detail-card" aria-label="方案明细">
      <div className="card-head">
        <div>
          <div className="detail-eyebrow">
            <span className="detail-id">{point.id}</span>
            <code className="detail-key">{point.key}</code>
            <span className="signature">{result.signature}</span>
          </div>
          <h3 className="card-title">方案明细</h3>
        </div>
        <StatusChip tone={overBudget ? 'warning' : 'good'}>
          {overBudget ? `超预算 ${money(detail.metrics.cost - budget)}` : '预算内'}
        </StatusChip>
      </div>

      <div className="metric-strip">
        <div>
          <span className="metric-label">费用</span>
          <span className="metric-value">{money(detail.metrics.cost)}</span>
        </div>
        <div>
          <span className="metric-label">去重覆盖</span>
          <span className="metric-value">
            {detail.metrics.coverage}
            <small> / {prepared.data.devices.length} 台</small>
          </span>
        </div>
        <div>
          <span className="metric-label">高风险覆盖</span>
          <span className="metric-value">
            {detail.metrics.highRiskCoverage}
            <small> / {prepared.highRiskCount} 台</small>
          </span>
        </div>
        <div>
          <span className="metric-label">重复覆盖</span>
          <span className="metric-value">
            {detail.duplicates}
            <small> 台 · {pct(detail.duplicateRate)}</small>
          </span>
        </div>
      </div>

      <div className="reconcile" aria-label="覆盖对账">
        <span>各站覆盖数之和 {detail.assigned}</span>
        <span className="reconcile-op">−</span>
        <span>重复覆盖 {detail.duplicates}</span>
        <span className="reconcile-op">=</span>
        <span className="reconcile-result">去重覆盖 {detail.metrics.coverage} 台</span>
        <span className="reconcile-note">不是把各站覆盖数直接相加</span>
      </div>

      <div className="detail-section">
        <div className="section-label">
          处理链顺序与新增覆盖
          <span className="muted">按站点顺序去重；新增 + 重复 = 该站覆盖数</span>
        </div>
        <ol className="site-chain">
          {detail.perSite.map((row) => {
            const isLocked = lockedSiteIds.includes(row.site.id);
            return (
              <li key={row.site.id} className="chain-row">
                <div className="chain-index" aria-hidden>
                  {detail.siteIds.indexOf(row.site.id) + 1}
                </div>
                <div className="chain-body">
                  <div className="chain-head">
                    <span className="chain-name">
                      {row.site.shortName}
                      <code>{row.site.id}</code>
                      {isLocked ? (
                        <span className="tag tag-lock">
                          <Icon name="lock" size={10} /> 锁定
                        </span>
                      ) : null}
                    </span>
                    <span className="chain-cost">{money(row.site.cost)}</span>
                  </div>
                  <div className="chain-bar" aria-hidden>
                    <span className="chain-added" style={{ flexGrow: row.added }} />
                    <span className="chain-dup" style={{ flexGrow: row.duplicate }} />
                  </div>
                  <div className="chain-meta">
                    <span>
                      新增 <strong>{row.added}</strong> 台
                    </span>
                    <span className={row.duplicate > 0 ? 'dup' : 'muted'}>
                      重复 <strong>{row.duplicate}</strong> 台
                    </span>
                    {row.duplicateDeviceIds.length > 0 ? (
                      <span className="muted chain-dup-list">
                        {row.duplicateDeviceIds
                          .map((id) => prepared.deviceById.get(id)?.name ?? id)
                          .join('、')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={`lock-button ${isLocked ? 'is-locked' : ''}`}
                  onClick={() => onLockSite(row.site.id)}
                  aria-pressed={isLocked}
                  aria-label={`${isLocked ? '解锁' : '锁定'} ${row.site.name} 后重新搜索`}
                  title={`${isLocked ? '解锁' : '锁定'} ${row.site.name}`}
                >
                  <Icon name={isLocked ? 'lock' : 'unlock'} size={14} />
                </button>
              </li>
            );
          })}
        </ol>
        {point.variantCount > 1 ? (
          <div className="variant-switch">
            <div className="variant-copy">
              同指标组合 {point.variantCount} 个，当前展示第 {variantIndex + 1} 个（按重复覆盖从少到多）
              {point.hiddenVariantCount > 0 ? `，另有 ${point.hiddenVariantCount} 个未展开` : ''}。
            </div>
            <div className="variant-buttons">
              {point.variants.map((item, index) => (
                <button
                  key={item.mask}
                  type="button"
                  className={index === variantIndex ? 'active' : ''}
                  onClick={() => onVariantChange(index)}
                  aria-pressed={index === variantIndex}
                  title={`${item.siteIds.join(' · ')}（重复 ${item.duplicates} 台）`}
                >
                  {item.siteIds.join('+')}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="detail-section two-col">
        <div>
          <div className="section-label">选中站点的设备覆盖</div>
          <SegmentedBar ariaLabel="各设备组覆盖数" parts={groupBins} />
          <div className="meters">
            {detail.groupCoverage.map((row) => (
              <Meter
                key={row.group.id}
                label={`${row.group.name}`}
                value={row.covered}
                total={row.total}
                min={row.min}
                meta={row.met ? '达到最低' : `差 ${row.min - row.covered} 台`}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="section-label">选中的站点（{detail.sites.length}）</div>
          <ul className="detail-sites">
            {detail.sites.map((site) => (
              <li key={site.id}>
                <span className="site-dot" style={{ background: 'var(--accent)' }} aria-hidden />
                <span>{site.name}</span>
                <span className="muted">{money(site.cost)}</span>
              </li>
            ))}
          </ul>
          <div className="problem-types">
            <div className="section-label">这些站点可发现的问题类型（{detail.problemTypes.length}）</div>
            <div className="chips">
              {detail.problemTypes.map((type) => (
                <span key={type} className="chip chip-quiet">
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <div className="section-label">
          漏掉的设备（{detail.missedDeviceIds.length}）
          <span className="muted">其中 {detail.missedHighRiskDeviceIds.length} 台为高风险</span>
        </div>
        {detail.missedDeviceIds.length === 0 ? (
          <p className="all-covered">
            <Icon name="check" size={14} /> 全部设备均已被覆盖。
          </p>
        ) : (
          <div className="device-groups">
            {detail.groupCoverage
              .filter((row) => row.missedDeviceIds.length > 0)
              .map((row) => (
                <div key={row.group.id} className="device-group">
                  <span className="device-group-label">
                    <span
                      className="swatch"
                      style={{
                        background: `var(--group-${prepared.data.groups.findIndex((group) => group.id === row.group.id) + 1})`,
                      }}
                      aria-hidden
                    />
                    {row.group.name}
                    <span className="muted">{row.missedDeviceIds.length} 台</span>
                  </span>
                  <div className="chips">
                    {row.missedDeviceIds.map((id) => {
                      const device = prepared.deviceById.get(id)!;
                      const uncoverable = detail.uncoverableDeviceIds.includes(id);
                      return (
                        <span
                          key={id}
                          className={`chip chip-missed ${device.highRisk ? 'chip-risk' : ''} ${uncoverable ? 'chip-uncoverable' : ''}`}
                          title={uncoverable ? '没有任何候选站点覆盖' : undefined}
                        >
                          {device.name}
                          {device.highRisk ? <span className="chip-flag">高风险</span> : null}
                          {uncoverable ? <span className="chip-flag">无候选站</span> : null}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="detail-section">
        <div className="section-label">
          必检设备
          <span className="muted">共 {result.mustCheckDeviceIds.length} 台</span>
        </div>
        <div className="chips">
          {result.mustCheckDeviceIds.map((id) => {
            const device = prepared.deviceById.get(id);
            if (!device) return null;
            const covered = detail.coveredDeviceIds.includes(id);
            return (
              <span key={id} className={`chip ${covered ? 'chip-ok' : 'chip-missed'}`}>
                {covered ? <Icon name="check" size={11} /> : <Icon name="x" size={11} />}
                {device.name}
                {mustCheckSet.has(id) && !covered ? <span className="chip-flag">{missesMustCheck.includes(id) ? '未覆盖' : ''}</span> : null}
              </span>
            );
          })}
        </div>
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            const firstUnlocked = detail.siteIds.find((id) => !lockedSiteIds.includes(id));
            if (firstUnlocked) onLockSite(firstUnlocked);
          }}
          disabled={detail.siteIds.every((id) => lockedSiteIds.includes(id))}
        >
          <Icon name="lock" size={14} />
          锁定此方案中的一站再算
        </button>
        <button type="button" className="ghost-button" onClick={() => onCompare(point.id)}>
          <Icon name="info" size={14} />
          它是被支配样本的支配者吗？
        </button>
      </div>
    </section>
  );
}
