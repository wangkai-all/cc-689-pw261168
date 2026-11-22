import type { ReactNode } from 'react';

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: 'alert' | 'check' | 'x' | 'lock' | 'unlock' | 'pin' | 'info' | 'chevron';
  size?: number;
  className?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };
  switch (name) {
    case 'alert':
      return (
        <svg {...common}>
          <path d="M8 2.2 14.2 13H1.8L8 2.2Z" />
          <path d="M8 6.2v3.1" />
          <circle cx="8" cy="11.2" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="m2.8 8.4 3.3 3.3 7-7.4" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="m3.4 3.4 9.2 9.2M12.6 3.4 3.4 12.6" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
          <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
        </svg>
      );
    case 'unlock':
      return (
        <svg {...common}>
          <rect x="3.2" y="7" width="9.6" height="6.4" rx="1.4" />
          <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...common}>
          <path d="M8 14s4.6-4.2 4.6-7.4A4.6 4.6 0 0 0 3.4 6.6C3.4 9.8 8 14 8 14Z" />
          <circle cx="8" cy="6.5" r="1.5" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M8 7.2v4" />
          <circle cx="8" cy="4.9" r="0.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m5 6.4 3 3 3-3" />
        </svg>
      );
  }
}

export function StatusChip({
  tone,
  children,
}: {
  tone: 'good' | 'warning' | 'critical' | 'neutral' | 'accent';
  children: ReactNode;
}) {
  const icon =
    tone === 'good' ? 'check' : tone === 'warning' ? 'alert' : tone === 'critical' ? 'x' : null;
  return (
    <span className={`status-chip status-${tone}`}>
      {icon ? <Icon name={icon} size={13} /> : null}
      <span>{children}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: 'default' | 'accent' | 'critical';
}) {
  return (
    <div className={`stat-tile stat-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function Meter({
  label,
  value,
  total,
  min,
  meta,
  tone = 'accent',
}: {
  label: string;
  value: number;
  total: number;
  min?: number;
  meta?: string;
  tone?: 'accent' | 'warning';
}) {
  const ratio = total === 0 ? 0 : Math.min(1, value / total);
  const minRatio = total === 0 || min === undefined ? null : Math.min(1, min / total);
  const unmet = min !== undefined && value < min;
  return (
    <div className={`meter ${unmet ? 'meter-unmet' : ''}`}>
      <div className="meter-head">
        <span className="meter-label">{label}</span>
        <span className="meter-value">
          {value}
          <span className="meter-total"> / {total}</span>
          {min !== undefined ? <span className="meter-min">最低 {min}</span> : null}
        </span>
      </div>
      <div
        className="meter-track"
        role="meter"
        aria-label={`${label}覆盖 ${value} 台，共 ${total} 台${min !== undefined ? `，最低 ${min} 台` : ''}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={value}
      >
        <div
          className={`meter-fill ${tone === 'warning' || unmet ? 'meter-fill-warning' : ''}`}
          style={{ width: `${ratio * 100}%` }}
        />
        {minRatio !== null ? (
          <span className="meter-threshold" style={{ left: `${minRatio * 100}%` }} aria-hidden />
        ) : null}
      </div>
      <div className="meter-foot">
        {unmet ? (
          <span className="meter-warning">
            <Icon name="alert" size={12} /> 未达最低，差 {min! - value} 台
          </span>
        ) : null}
        {meta ? <span>{meta}</span> : null}
      </div>
    </div>
  );
}

export function SegmentedBar({
  parts,
  ariaLabel,
  height = 10,
}: {
  parts: Array<{ label: string; value: number; color: string }>;
  ariaLabel: string;
  height?: number;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className="segmented" role="img" aria-label={ariaLabel}>
      <div className="segmented-track" style={{ height }}>
        {total > 0
          ? parts
              .filter((part) => part.value > 0)
              .map((part) => (
                <span
                  key={part.label}
                  className="segmented-part"
                  style={{ flexGrow: part.value, background: part.color }}
                  title={`${part.label} ${part.value}`}
                />
              ))
          : null}
      </div>
      <div className="segmented-legend">
        {parts.map((part) => (
          <span key={part.label} className="legend-item">
            <span className="swatch" style={{ background: part.color }} aria-hidden />
            <span>{part.label}</span>
            <strong>{part.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
