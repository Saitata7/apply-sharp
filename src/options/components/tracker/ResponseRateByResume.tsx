/**
 * Response rate by resume version chart.
 *
 * The killer differentiator vs Simplify and Huntr: neither competitor can
 * compute this because they do not control the resume versioning pipeline.
 * ApplySharp does (resume-versions store + Application.resumeVersionId).
 *
 * Filters out versions with under 3 submissions to cut noise from one-off
 * tests. Sorted by rate descending so the best-performing resume version
 * is first.
 */

import { Card, BarChart } from '@tremor/react';
import type { Application } from '@shared/types/application.types';
import { getResponseRateByResumeVersion } from '@core/analytics/application-analytics';

interface Props {
  applications: Application[];
  versionLabels?: Map<string, string>;
}

export default function ResponseRateByResume({ applications, versionLabels }: Props) {
  const rows = getResponseRateByResumeVersion(applications).filter((r) => r.applied >= 3);

  if (rows.length === 0) {
    return (
      <Card>
        <div style={{ padding: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Response rate by resume version</h3>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
            Apply with at least 3 submissions per resume version and this chart will show which
            version actually gets responses. The most useful chart in the entire app.
          </p>
        </div>
      </Card>
    );
  }

  const data = rows.map((r) => ({
    version:
      versionLabels?.get(r.version) ??
      (r.version === '__legacy_default__' ? 'Legacy' : r.version.slice(0, 8)),
    'Response rate %': Math.round(r.rate * 100),
    applied: r.applied,
    responses: r.responses,
  }));

  // A11y: chart libraries do not export a screen-reader-friendly view by
  // default, so we render an offscreen <table> mirror that screen readers
  // can read in addition to the visual chart.
  return (
    <Card>
      <div style={{ padding: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Response rate by resume version</h3>
        <p style={{ margin: '6px 0 12px', color: '#64748b', fontSize: 13 }}>
          Which tailored resume actually gets replies. Shows only versions with at least 3
          submissions to cut noise.
        </p>
        <div
          role="img"
          aria-label="Bar chart of response rate by resume version. See data table below."
        >
          <BarChart
            className="mt-4"
            data={data}
            index="version"
            categories={['Response rate %']}
            colors={['indigo']}
            yAxisWidth={48}
            valueFormatter={(v) => `${v}%`}
          />
        </div>
        {/* Screen-reader-only data table mirror */}
        <table
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          <caption>Response rate by resume version</caption>
          <thead>
            <tr>
              <th>Version</th>
              <th>Applied</th>
              <th>Responses</th>
              <th>Response rate %</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.version}>
                <td>{row.version}</td>
                <td>{row.applied}</td>
                <td>{row.responses}</td>
                <td>{row['Response rate %']}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
