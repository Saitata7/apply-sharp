/**
 * Resume Preview — Full-fidelity HTML rendering matching DOCX layout
 *
 * Extracted from ResumeGenerator.tsx. Renders a preview of the resume
 * in HTML that mirrors the DOCX/PDF output.
 */

import type React from 'react';
import type {
  MasterProfile,
  GeneratedProfile,
  EnrichedExperience,
} from '@shared/types/master-profile.types';
import type { ResumeLayout, ContentExclusions } from '@core/resume/layout-engine';
import { formatResumeDate, shortenUrl } from '@core/resume/layout-engine';
import { buildSkillCategories, type KeywordWithFrequency } from './SkillCategorizer';
import type { TailoredContent } from './DocxGenerator';

export interface ResumePreviewProps {
  profile: MasterProfile;
  activeRole: GeneratedProfile | null;
  layout: ResumeLayout;
  exclusions: ContentExclusions;
  tailoredContent: TailoredContent | null;
  matchedKeywords?: KeywordWithFrequency[];
}

export default function ResumePreview({
  profile,
  activeRole,
  layout,
  exclusions,
  tailoredContent,
  matchedKeywords,
}: ResumePreviewProps): React.ReactElement {
  const personal = profile.personal;
  const experience = profile.experience || [];
  const education = profile.education || [];
  const certs = profile.certifications || [];
  const skillsData = profile.skills;

  const summaryText =
    tailoredContent?.optimizedSummary ||
    activeRole?.tailoredSummary ||
    profile.careerContext?.summary ||
    '';

  const enhancedBulletsMap = new Map<string, string[]>();
  if (tailoredContent?.enhancedBullets) {
    tailoredContent.enhancedBullets.forEach((eb) => enhancedBulletsMap.set(eb.expId, eb.bullets));
  }

  // Helper: check if a role is early career
  const isEarlyCareerRole = (expId: string): boolean => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.isEarlyCareer ?? false;
  };

  // Helper: get max bullets for a role
  const getMaxBulletsForRole = (expId: string): number => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.maxBullets ?? 5;
  };

  const previewGetBullets = (exp: EnrichedExperience): string[] => {
    const expId = exp.id || exp.company;
    if (isEarlyCareerRole(expId)) return [];
    const enhanced = enhancedBulletsMap.get(expId);
    const allBullets =
      enhanced && enhanced.length > 0
        ? enhanced
        : [
            ...(exp.achievements || []).map((a: string | { statement: string }) =>
              typeof a === 'string' ? a : a.statement
            ),
            ...(exp.responsibilities || []),
          ];
    return allBullets.slice(0, getMaxBulletsForRole(expId));
  };

  const previewGetEnv = (exp: EnrichedExperience): string => {
    if (exp.technologiesUsed?.length)
      return [...new Set(exp.technologiesUsed.map((t) => t.skill))].join(', ');
    return '';
  };

  const skillCategories = buildSkillCategories(
    skillsData,
    activeRole,
    experience,
    matchedKeywords,
    tailoredContent?.addedKeywords
  );
  const roleTitle = activeRole?.targetRole || profile.careerContext?.primaryDomain || '';

  // Page style — mirrors DOCX: US Letter, 0.5" top/bottom, 0.625" left/right
  const pageStyle: React.CSSProperties = {
    width: '8.5in',
    minHeight: '11in',
    padding: '0.5in 0.625in',
    background: '#fff',
    color: '#000',
    fontFamily: 'Calibri, sans-serif',
    fontSize: '10pt',
    lineHeight: '1.15',
    boxSizing: 'border-box',
    margin: '0 auto',
    boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '11pt',
    fontWeight: 'bold',
    borderBottom: '1px solid #000',
    paddingBottom: '2px',
    marginTop: '10px',
    marginBottom: '4px',
  };

  const alignedRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  };

  // Build section renderers keyed by SectionType
  const sectionRenderers: Record<string, () => React.ReactNode> = {
    name: () => (
      <div key="name">
        <div
          style={{
            textAlign: 'center',
            fontSize: '18pt',
            fontWeight: 'bold',
            marginBottom: '2px',
          }}
        >
          {personal?.fullName?.toUpperCase() || 'NAME'}
        </div>
        {roleTitle && (
          <div style={{ textAlign: 'center', fontSize: '11pt', marginBottom: '2px' }}>
            {roleTitle}
          </div>
        )}
      </div>
    ),

    contact: () => {
      const parts: string[] = [];
      if (personal?.phone) parts.push(personal.phone);
      if (personal?.email) parts.push(personal.email);
      const loc = personal?.location;
      if (loc) {
        const locParts = [loc.city, loc.state].filter(Boolean);
        if (locParts.length > 0) parts.push(locParts.join(', '));
      }
      if (personal?.linkedInUrl) parts.push(shortenUrl(personal.linkedInUrl));
      if (personal?.githubUrl) parts.push(shortenUrl(personal.githubUrl));
      if (personal?.portfolioUrl) parts.push(shortenUrl(personal.portfolioUrl));
      return (
        <div key="contact" style={{ textAlign: 'center', fontSize: '9pt', marginBottom: '6px' }}>
          {parts.join(' | ')}
        </div>
      );
    },

    summary: () => (
      <div key="summary">
        <div style={sectionHeaderStyle}>PROFESSIONAL SUMMARY</div>
        <div style={{ marginBottom: '4px' }}>{summaryText}</div>
      </div>
    ),

    skills: () => {
      if (skillCategories.length === 0) return null;
      return (
        <div key="skills">
          <div style={sectionHeaderStyle}>TECHNICAL SKILLS</div>
          {skillCategories.map((cat) => (
            <div key={cat.category} style={{ paddingLeft: '8px', margin: '2px 0' }}>
              <strong>{cat.category}:</strong> {cat.skills.join(', ')}
            </div>
          ))}
        </div>
      );
    },

    experience: () => {
      const filtered = experience.filter(
        (exp) => !exclusions.excludedExperiences.has(exp.id || exp.company)
      );
      if (filtered.length === 0) return null;
      return (
        <div key="experience">
          <div style={sectionHeaderStyle}>WORK EXPERIENCE</div>
          {filtered.map((exp, idx) => {
            const expId = exp.id || exp.company;
            const earlyCareer = isEarlyCareerRole(expId);
            const bullets = previewGetBullets(exp);
            const env = previewGetEnv(exp);
            const startDate = formatResumeDate(exp.startDate);
            const endDate = exp.isCurrent ? 'Present' : formatResumeDate(exp.endDate);
            const location = exp.location || '';
            const companyText = location ? `${exp.company} \u2014 ${location}` : exp.company;

            return (
              <div key={expId + idx} style={{ marginTop: idx > 0 ? '10px' : '0' }}>
                <div style={{ ...alignedRowStyle }}>
                  <span style={{ fontWeight: 'bold', fontStyle: 'italic', fontSize: '10pt' }}>
                    {exp.title}
                  </span>
                  <span>{`${startDate} \u2013 ${endDate}`}</span>
                </div>
                <div style={{ fontStyle: 'italic', marginBottom: earlyCareer ? '0' : '3px' }}>
                  {companyText}
                </div>
                {!earlyCareer && (
                  <>
                    <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc' }}>
                      {bullets.map((b, bi) => (
                        <li key={bi} style={{ margin: '1px 0' }}>
                          {b.startsWith('\u2022') ? b.substring(1).trim() : b}
                        </li>
                      ))}
                    </ul>
                    {env && (
                      <div style={{ marginTop: '2px' }}>
                        <strong>Environment:</strong> {env}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      );
    },

    education: () => {
      if (education.length === 0) return null;
      return (
        <div key="education">
          <div style={sectionHeaderStyle}>EDUCATION</div>
          {education.map((edu) => {
            const eduLayout = layout.educationEntries.find((e) => e.eduId === edu.id);
            const gradDate = formatResumeDate(edu.endDate);
            const degreeHasIn = edu.degree?.toLowerCase().includes(' in ');
            const degreeText = degreeHasIn
              ? edu.degree
              : `${edu.degree}${edu.field ? ' in ' + edu.field : ''}`;

            return (
              <div key={edu.id} style={{ marginBottom: '4px' }}>
                <div style={alignedRowStyle}>
                  <span>
                    <strong>{degreeText}</strong>
                    <span style={{ fontSize: '9pt' }}> \u2014 {edu.institution}</span>
                  </span>
                  {eduLayout?.showGraduationDate && gradDate && <span>{gradDate}</span>}
                </div>
                {eduLayout?.showGpa && edu.gpa && (
                  <div style={{ paddingLeft: '8px', fontStyle: 'italic', fontSize: '9pt' }}>
                    GPA: {edu.gpa}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    },

    certifications: () => {
      if (certs.length === 0) return null;
      return (
        <div key="certifications">
          <div style={sectionHeaderStyle}>CERTIFICATIONS</div>
          {certs.map((cert) => {
            let dateStr = '';
            if (cert.dateObtained && cert.expirationDate)
              dateStr = `${formatResumeDate(cert.dateObtained)} \u2013 ${formatResumeDate(cert.expirationDate)}`;
            else if (cert.dateObtained) dateStr = formatResumeDate(cert.dateObtained);
            return (
              <div key={cert.name} style={alignedRowStyle}>
                <strong>{cert.name}</strong>
                {dateStr && <span>{dateStr}</span>}
              </div>
            );
          })}
        </div>
      );
    },

    projects: () => {
      const projects = (profile.projects || []).filter(
        (p) => !exclusions.excludedProjects.has(p.id || p.name)
      );
      if (!projects.length) return null;
      return (
        <div key="projects">
          <div style={sectionHeaderStyle}>PROJECTS</div>
          {projects.map((proj, idx) => {
            const bullets: string[] = [];
            const isDupe = (text: string) =>
              bullets.some(
                (b) =>
                  b.toLowerCase().trim() === text.toLowerCase().trim() ||
                  b.toLowerCase().includes(text.toLowerCase().substring(0, 40))
              );
            if (proj.highlights?.length) {
              proj.highlights.forEach((h) => {
                if (!isDupe(h)) bullets.push(h);
              });
            }
            if (proj.impact?.trim() && !isDupe(proj.impact)) bullets.push(proj.impact);
            if (bullets.length < 3 && proj.description) {
              const sentences = proj.description
                .split(/(?<=[.!?])\s+/)
                .filter((s) => s.trim().length > 10 && !isDupe(s));
              if (sentences.length > 0) bullets.push(...sentences.slice(0, 3 - bullets.length));
              else if (bullets.length === 0 && !isDupe(proj.description))
                bullets.push(proj.description);
            }
            const dateRange = proj.dateRange ? formatResumeDate(proj.dateRange) : '';
            const projTitle = proj.url ? `${proj.name} | GitHub` : proj.name;
            return (
              <div key={proj.id || idx} style={{ marginTop: idx > 0 ? '6px' : '0' }}>
                <div style={alignedRowStyle}>
                  <strong style={{ fontSize: '10pt' }}>{projTitle}</strong>
                  {dateRange && <span>{dateRange}</span>}
                </div>
                <ul style={{ margin: '0', paddingLeft: '20px', listStyleType: 'disc' }}>
                  {bullets.slice(0, 5).map((b, bi) => (
                    <li key={bi} style={{ margin: '1px 0' }}>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      );
    },
  };

  return (
    <div style={pageStyle}>
      {layout.sections
        .filter((s) => s.visible)
        .map((s) => {
          const renderer = sectionRenderers[s.type];
          return renderer ? renderer() : null;
        })}
    </div>
  );
}
