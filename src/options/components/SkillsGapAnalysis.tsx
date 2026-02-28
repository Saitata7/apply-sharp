import { useState } from 'react';
import type {
  GapAnalysisResult,
  GapSeverity,
  CategorizedGap,
  RoadmapItem,
  AreaGapGroup,
} from '@core/ats/gap-analyzer';

// ── Helpers ──────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<GapSeverity, string> = {
  critical: '#ef4444',
  addressable: '#f59e0b',
  minor: '#3b82f6',
};

const SEVERITY_LABELS: Record<GapSeverity, string> = {
  critical: 'Critical',
  addressable: 'Addressable',
  minor: 'Nice-to-have',
};

function SeverityDot({ severity }: { severity: GapSeverity }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: SEVERITY_COLORS[severity],
        flexShrink: 0,
      }}
    />
  );
}

// ── Sub-Components ──────────────────────────────────────────────────────

function GapSummary({ analysis }: { analysis: GapAnalysisResult }) {
  const { summary } = analysis;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
        {summary.critical > 0 && (
          <span style={{ color: SEVERITY_COLORS.critical }}>{summary.critical} critical</span>
        )}
        {summary.addressable > 0 && (
          <span style={{ color: SEVERITY_COLORS.addressable }}>
            {summary.addressable} addressable
          </span>
        )}
        {summary.minor > 0 && (
          <span style={{ color: SEVERITY_COLORS.minor }}>{summary.minor} nice-to-have</span>
        )}
      </div>
      {summary.topAreaToFocus && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
          Focus area: <strong style={{ color: '#cbd5e1' }}>{summary.topAreaToFocus}</strong>
        </p>
      )}
    </div>
  );
}

function RoadmapSection({ roadmap }: { roadmap: RoadmapItem[] }) {
  if (roadmap.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#e2e8f0' }}>Learning Roadmap</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {roadmap.map((item, i) => (
          <div
            key={item.keyword}
            style={{
              padding: '10px 12px',
              background: '#1e293b',
              borderRadius: 6,
              borderLeft: `3px solid ${SEVERITY_COLORS[item.severity]}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, width: 18 }}>
                {i + 1}.
              </span>
              <SeverityDot severity={item.severity} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                {item.keyword}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: SEVERITY_COLORS[item.severity],
                  fontWeight: 500,
                }}
              >
                {SEVERITY_LABELS[item.severity]}
              </span>
              {item.estimatedHours && (
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>
                  ~{item.estimatedHours} hrs
                </span>
              )}
            </div>
            <div style={{ paddingLeft: 26, fontSize: 12 }}>
              <div style={{ color: '#94a3b8', marginBottom: 2 }}>{item.reason}</div>
              <div style={{ color: '#cbd5e1' }}>{item.actionText}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GapTag({ gap }: { gap: CategorizedGap }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        background: `${SEVERITY_COLORS[gap.severity]}15`,
        color: SEVERITY_COLORS[gap.severity],
        border: `1px solid ${SEVERITY_COLORS[gap.severity]}30`,
      }}
    >
      <SeverityDot severity={gap.severity} />
      {gap.keyword}
    </span>
  );
}

function AreaGroupSection({ groups }: { groups: AreaGapGroup[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) return null;

  const toggle = (area: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#e2e8f0' }}>Gaps by Area</h4>
      {groups.map((group) => (
        <div
          key={group.area}
          style={{
            border: '1px solid #334155',
            borderRadius: 6,
            marginBottom: 6,
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => toggle(group.area)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#1e293b',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#e2e8f0',
              fontSize: 13,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SeverityDot severity={group.topPriority} />
              <strong>{group.area}</strong>
              <span style={{ color: '#64748b', fontSize: 12, fontWeight: 400 }}>
                {group.gaps.length} gap{group.gaps.length !== 1 ? 's' : ''}
              </span>
            </span>
            <span style={{ color: '#64748b', fontSize: 12 }}>
              {expanded.has(group.area) ? '\u25B2' : '\u25BC'}
            </span>
          </button>
          {expanded.has(group.area) && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {group.gaps.map((gap) => (
                <GapTag key={gap.keyword} gap={gap} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

interface SkillsGapAnalysisProps {
  analysis: GapAnalysisResult;
}

export default function SkillsGapAnalysis({ analysis }: SkillsGapAnalysisProps) {
  if (analysis.gaps.length === 0) return null;

  return (
    <div className="settings-section" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>
        Skills Gap Analysis
        <span style={{ fontWeight: 400, fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
          {analysis.summary.total} gaps found
        </span>
      </h3>
      <GapSummary analysis={analysis} />
      <RoadmapSection roadmap={analysis.roadmap} />
      <AreaGroupSection groups={analysis.gapsByArea} />
    </div>
  );
}
