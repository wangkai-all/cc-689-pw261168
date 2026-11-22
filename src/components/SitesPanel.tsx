import type { PreparedData } from '../lib/coverage';
import { popcount32 } from '../lib/coverage';
import { money } from '../lib/format';
import type { Site } from '../lib/types';
import { Icon } from './ui';

export function SitesPanel({
  sites,
  prepared,
  locks,
  onToggleLock,
  selectedSiteIds,
}: {
  sites: Site[];
  prepared: PreparedData;
  locks: string[];
  onToggleLock: (siteId: string) => void;
  selectedSiteIds: string[];
}) {
  const selected = new Set(selectedSiteIds);
  const locked = new Set(locks);
  const sorted = sites
    .slice()
    .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'zh-CN'));

  return (
    <section className="card sites-card" aria-label="候选站点">
      <div className="card-head">
        <h2 className="card-title">候选站点</h2>
        <span className="card-sub">{sites.length} 个 · 按费用升序</span>
      </div>
      <p className="field-help">
        每站费用与覆盖设备数；选中方案中的站点会高亮。锁图标固定/取消固定该站点。
      </p>
      <ul className="site-list">
        {sorted.map((site) => {
          const index = prepared.data.sites.findIndex((item) => item.id === site.id);
          const coverage = popcount32(prepared.siteDeviceMask[index]);
          const isSelected = selected.has(site.id);
          const isLocked = locked.has(site.id);
          const riskCount = popcount32(prepared.siteDeviceMask[index] & prepared.highRiskMask);
          return (
            <li
              key={site.id}
              className={`site-row ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''}`}
            >
              <div className="site-main">
                <span
                  className="site-dot"
                  aria-hidden
                  style={{ background: isSelected ? 'var(--accent)' : 'transparent' }}
                />
                <div>
                  <div className="site-name">
                    {site.shortName}
                    <span className="site-id">{site.id}</span>
                  </div>
                  <div className="site-meta">
                    {coverage} 台设备 · 高风险 {riskCount} · {site.problemTypes.length} 类问题
                  </div>
                </div>
              </div>
              <div className="site-right">
                <span className="site-cost">{money(site.cost)}</span>
                <button
                  type="button"
                  className={`lock-button ${isLocked ? 'is-locked' : ''}`}
                  onClick={() => onToggleLock(site.id)}
                  aria-pressed={isLocked}
                  aria-label={`${isLocked ? '解锁' : '锁定'} ${site.name}`}
                  title={`${isLocked ? '解锁' : '锁定'} ${site.name}`}
                >
                  <Icon name={isLocked ? 'lock' : 'unlock'} size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
