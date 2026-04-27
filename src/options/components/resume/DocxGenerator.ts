/**
 * DOCX Generator — Generates ATS-safe DOCX resumes
 *
 * Extracted from ResumeGenerator.tsx. Takes profile data and layout
 * configuration and produces a downloadable DOCX file using the docx library.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Tab,
  AlignmentType,
  BorderStyle,
  Table,
  ExternalHyperlink,
  TabStopType,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import type {
  MasterProfile,
  GeneratedProfile,
  EnrichedExperience,
} from '@shared/types/master-profile.types';
import type { ResumeLayout, ContentExclusions } from '@core/resume/layout-engine';
import { formatResumeDate, shortenUrl } from '@core/resume/layout-engine';
import { buildSkillCategories, type KeywordWithFrequency } from './SkillCategorizer';
import { scanHiddenContent, blockExportIfFound } from '@core/resume/hidden-content-scanner';
import type { AITellsResult } from '@core/profile/claims-validator';

export interface TailoredContent {
  optimizedSummary: string;
  enhancedBullets: Array<{
    expId: string;
    bullets: string[];
  }>;
  addedKeywords: string[];
  newScore: number;
  /**
   * Workstream 3 humanization linter result. Set by handleOptimizeResumeForJD
   * after running detectAITells across summary + bullets. The UI renders this
   * as an amber warning banner so the user can rewrite or regenerate before
   * the resume reaches a recruiter.
   */
  aiTells?: AITellsResult;
}

export interface DocxGeneratorParams {
  fileName: string;
  profile: MasterProfile;
  activeRole: GeneratedProfile;
  layout: ResumeLayout;
  exclusions: ContentExclusions;
  targetPages: number;
  tailored: TailoredContent | null;
  matchedKeywords?: KeywordWithFrequency[];
}

// Download helpers
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Collect every text blob that will end up in the exported DOCX so the
 * hidden-content scanner can vet them. Mirrors the PDF generator's helper
 * exactly. See chrome-agent.md Authenticity Guard.
 */
function collectDocxExportTexts(params: DocxGeneratorParams): string[] {
  const texts: string[] = [];
  const { profile, activeRole, tailored } = params;

  if (tailored?.optimizedSummary) texts.push(tailored.optimizedSummary);
  if (activeRole?.tailoredSummary) texts.push(activeRole.tailoredSummary);
  if (profile.careerContext?.summary) texts.push(profile.careerContext.summary);

  for (const exp of profile.experience ?? []) {
    if (exp.title) texts.push(exp.title);
    if (exp.company) texts.push(exp.company);
    for (const a of exp.achievements ?? []) {
      const t = typeof a === 'string' ? a : (a as { text?: string })?.text;
      if (t) texts.push(t);
    }
  }
  for (const ach of (tailored?.enhancedBullets ?? []).flatMap((b) => b.bullets)) {
    if (ach) texts.push(ach);
  }
  for (const proj of profile.projects ?? []) {
    if (proj.name) texts.push(proj.name);
    if (proj.description) texts.push(proj.description);
    for (const h of proj.highlights ?? []) texts.push(h);
  }
  for (const edu of profile.education ?? []) {
    if (edu.institution) texts.push(edu.institution);
    if (edu.degree) texts.push(edu.degree);
    if (edu.field) texts.push(edu.field);
  }
  return texts;
}

/**
 * Generate and download a DOCX resume file.
 */
export async function generateDocx(params: DocxGeneratorParams): Promise<void> {
  // SAFETY: Block the export if any text headed for the resume contains hidden
  // smuggling. Throws HiddenContentBlockedError on any error-severity finding;
  // the caller is responsible for showing a useful UI.
  const issues = scanHiddenContent(collectDocxExportTexts(params));
  blockExportIfFound(issues);

  const {
    fileName,
    profile,
    activeRole,
    layout,
    exclusions,
    targetPages,
    tailored,
    matchedKeywords,
  } = params;

  const personal = profile.personal;
  const experience = profile.experience || [];
  const education = profile.education || [];
  const certifications = profile.certifications || [];
  const skillsData = profile.skills;

  let summaryText =
    tailored?.optimizedSummary ||
    activeRole?.tailoredSummary ||
    profile.careerContext?.summary ||
    '';

  // Cap summary to ~3 sentences for 1-page resumes to save space
  if (targetPages === 1 && summaryText.length > 400) {
    const sentences = summaryText.match(/[^.!?]+[.!?]+/g) || [summaryText];
    summaryText = sentences.slice(0, 3).join(' ').trim();
  }

  const enhancedBulletsMap = new Map<string, string[]>();
  if (tailored?.enhancedBullets) {
    tailored.enhancedBullets.forEach((eb) => enhancedBulletsMap.set(eb.expId, eb.bullets));
  }

  // Helper: check if a role is early career (no bullets)
  const isEarlyCareerRole = (expId: string): boolean => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.isEarlyCareer ?? false;
  };

  // Helper: get max bullets for a role
  const getMaxBulletsForRole = (expId: string): number => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.maxBullets ?? 5;
  };

  // Get bullets for experience — uses layout engine for bullet budgets
  const getBullets = (exp: EnrichedExperience): string[] => {
    const expId = exp.id || exp.company;
    if (isEarlyCareerRole(expId)) return [];
    const enhanced = enhancedBulletsMap.get(expId);
    const allBullets =
      enhanced && enhanced.length > 0
        ? enhanced
        : [
            ...(exp.achievements || []).map((a) => (typeof a === 'string' ? a : a.statement)),
            ...(exp.responsibilities || []),
          ];
    const maxBullets = getMaxBulletsForRole(expId);
    return allBullets.slice(0, maxBullets);
  };

  // Build environment line
  const getEnv = (exp: EnrichedExperience): string => {
    if (exp.technologiesUsed?.length)
      return [...new Set(exp.technologiesUsed.map((t) => t.skill))].join(', ');
    return '';
  };

  // Build skill categories
  const skillCategories = buildSkillCategories(
    skillsData,
    activeRole,
    experience,
    matchedKeywords,
    tailored?.addedKeywords
  );

  // ---- Page Layout Constants (US Letter, tight margins) ----
  const MARGIN_TOP = 432;
  const MARGIN_BOTTOM = 360;
  const MARGIN_LEFT = 720;
  const MARGIN_RIGHT = 720;
  const TAB_STOP_RIGHT = convertInchesToTwip(7.5);

  // Font sizes (half-points)
  const NAME_SIZE = 36;
  const SUBTITLE_SIZE = 20;
  const CONTACT_SIZE = 17;
  const HEADER_SIZE = 22;
  const TITLE_SIZE = 20;
  const BODY_SIZE = 20;
  const SMALL_SIZE = 17;

  // Section header
  const sectionHeader = (text: string): Paragraph => {
    return new Paragraph({
      children: [new TextRun({ text, bold: true, size: HEADER_SIZE, font: 'Calibri' })],
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 },
      },
      spacing: { before: 100, after: 20, line: 240 },
    });
  };

  // Right-aligned tab stop paragraph
  const alignedLine = (
    leftRuns: TextRun[],
    rightText: string,
    spacingBefore = 0,
    spacingAfter = 0
  ): Paragraph => {
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TAB_STOP_RIGHT }],
      children: [
        ...leftRuns,
        new TextRun({ children: [new Tab()], size: BODY_SIZE, font: 'Calibri' }),
        new TextRun({ text: (rightText || '').trim(), size: BODY_SIZE, font: 'Calibri' }),
      ],
      spacing: { before: spacingBefore, after: spacingAfter, line: 240 },
    });
  };

  // Bullet point paragraph
  const bulletParagraph = (text: string): Paragraph => {
    const cleanText = text.startsWith('\u2022') ? text.substring(1).trim() : text;
    return new Paragraph({
      numbering: { reference: 'bullet-list', level: 0 },
      children: [new TextRun({ text: cleanText, size: BODY_SIZE, font: 'Calibri' })],
      spacing: { before: 0, after: 10, line: 240 },
    });
  };

  // DOCX core properties so ATS / recruiters see the candidate's name when
  // they scrape file metadata. The docx library defaults the creator field to
  // "Un-named", which looks suspicious; set it to the user's name to match
  // what Word would write.
  const docxAuthor = personal.fullName?.trim() || 'Candidate';

  const doc = new Document({
    creator: docxAuthor,
    title: `Resume - ${docxAuthor}`,
    description: 'Resume',
    lastModifiedBy: docxAuthor,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: BODY_SIZE },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 0, line: 240 },
          },
        },
        listParagraph: {
          run: { font: 'Calibri', size: BODY_SIZE },
          paragraph: { spacing: { after: 0, before: 0, line: 240, lineRule: 'auto' } },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          quickFormat: true,
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { after: 0, before: 0, line: 240 },
          },
          run: { font: 'Calibri', size: BODY_SIZE },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullet-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '\u2022',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.14) },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: MARGIN_TOP,
              bottom: MARGIN_BOTTOM,
              left: MARGIN_LEFT,
              right: MARGIN_RIGHT,
            },
          },
        },
        children: (() => {
          // ---- Section builders ----

          const buildName = (): Paragraph[] => {
            const nameP = new Paragraph({
              children: [
                new TextRun({
                  text: personal?.fullName?.toUpperCase() || 'NAME',
                  bold: true,
                  size: NAME_SIZE,
                  font: 'Calibri',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 0, line: 240 },
            });

            const roleTitle = activeRole?.targetRole || profile.careerContext?.primaryDomain || '';
            if (roleTitle) {
              return [
                nameP,
                new Paragraph({
                  children: [
                    new TextRun({
                      text: roleTitle,
                      size: SUBTITLE_SIZE,
                      font: 'Calibri',
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 0, line: 240 },
                }),
              ];
            }
            return [nameP];
          };

          const buildContact = (): Paragraph[] => {
            const parts: (TextRun | ExternalHyperlink)[] = [];
            const addSep = () => {
              if (parts.length > 0)
                parts.push(new TextRun({ text: ' | ', size: CONTACT_SIZE, font: 'Calibri' }));
            };

            if (personal?.phone) {
              parts.push(
                new TextRun({ text: personal.phone, size: CONTACT_SIZE, font: 'Calibri' })
              );
            }

            if (personal?.email) {
              addSep();
              parts.push(
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: personal.email,
                      size: CONTACT_SIZE,
                      font: 'Calibri',
                      color: '0563C1',
                      underline: { type: 'single' },
                    }),
                  ],
                  link: `mailto:${personal.email}`,
                })
              );
            }

            const loc = personal?.location;
            if (loc) {
              const locParts = [loc.city, loc.state].filter(Boolean);
              if (locParts.length > 0) {
                addSep();
                parts.push(
                  new TextRun({ text: locParts.join(', '), size: CONTACT_SIZE, font: 'Calibri' })
                );
              }
            }

            if (personal?.linkedInUrl) {
              addSep();
              parts.push(
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: shortenUrl(personal.linkedInUrl),
                      size: CONTACT_SIZE,
                      font: 'Calibri',
                      color: '0563C1',
                      underline: { type: 'single' },
                    }),
                  ],
                  link: personal.linkedInUrl,
                })
              );
            }

            if (personal?.githubUrl) {
              addSep();
              parts.push(
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: shortenUrl(personal.githubUrl),
                      size: CONTACT_SIZE,
                      font: 'Calibri',
                      color: '0563C1',
                      underline: { type: 'single' },
                    }),
                  ],
                  link: personal.githubUrl,
                })
              );
            }

            if (personal?.portfolioUrl) {
              addSep();
              parts.push(
                new ExternalHyperlink({
                  children: [
                    new TextRun({
                      text: shortenUrl(personal.portfolioUrl),
                      size: CONTACT_SIZE,
                      font: 'Calibri',
                      color: '0563C1',
                      underline: { type: 'single' },
                    }),
                  ],
                  link: personal.portfolioUrl,
                })
              );
            }

            return [
              new Paragraph({
                children: parts,
                alignment: AlignmentType.CENTER,
                spacing: { after: 20, line: 240 },
              }),
            ];
          };

          const buildSummary = (): Paragraph[] => [
            sectionHeader('PROFESSIONAL SUMMARY'),
            new Paragraph({
              children: [new TextRun({ text: summaryText, size: BODY_SIZE, font: 'Calibri' })],
              spacing: { after: 0, line: 240 },
            }),
          ];

          const buildSkills = (): Paragraph[] => {
            if (skillCategories.length === 0) return [];
            return [
              sectionHeader('TECHNICAL SKILLS'),
              ...skillCategories.map(
                (cat) =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${cat.category}: `,
                        bold: true,
                        size: BODY_SIZE,
                        font: 'Calibri',
                      }),
                      new TextRun({
                        text: cat.skills.join(', '),
                        size: BODY_SIZE,
                        font: 'Calibri',
                      }),
                    ],
                    spacing: { before: 0, after: 10, line: 240 },
                  })
              ),
            ];
          };

          const buildExperience = (): Paragraph[] => {
            const filtered = experience.filter(
              (exp) => !exclusions.excludedExperiences.has(exp.id || exp.company)
            );
            if (filtered.length === 0) return [];
            return [
              sectionHeader('WORK EXPERIENCE'),
              ...filtered.flatMap((exp, idx) => {
                const expId = exp.id || exp.company;
                const earlyCareer = isEarlyCareerRole(expId);
                const bullets = getBullets(exp);
                const env = getEnv(exp);
                const startDate = formatResumeDate(exp.startDate);
                const endDate = exp.isCurrent ? 'Present' : formatResumeDate(exp.endDate);
                const dateRange = `${startDate} \u2013 ${endDate}`;

                const location = exp.location || '';

                const spacer: Paragraph[] =
                  idx > 0 ? [new Paragraph({ spacing: { before: 40, after: 0, line: 240 } })] : [];

                const titleLine = alignedLine(
                  [
                    new TextRun({
                      text: exp.title,
                      bold: true,
                      italics: true,
                      size: TITLE_SIZE,
                      font: 'Calibri',
                    }),
                  ],
                  dateRange,
                  0,
                  0
                );

                const companyText = location ? `${exp.company} \u2014 ${location}` : exp.company;
                const companyLine = new Paragraph({
                  children: [
                    new TextRun({
                      text: companyText,
                      italics: true,
                      size: BODY_SIZE,
                      font: 'Calibri',
                    }),
                  ],
                  spacing: { before: 0, after: 20, line: 240 },
                });

                if (earlyCareer) {
                  return [...spacer, titleLine, companyLine];
                }

                const result: Paragraph[] = [
                  ...spacer,
                  titleLine,
                  companyLine,
                  ...bullets.map((b) => bulletParagraph(b)),
                ];

                if (env && targetPages > 1) {
                  result.push(
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: 'Environment: ',
                          bold: true,
                          size: BODY_SIZE,
                          font: 'Calibri',
                        }),
                        new TextRun({ text: env, size: BODY_SIZE, font: 'Calibri' }),
                      ],
                      spacing: { before: 10, after: 0, line: 240 },
                    })
                  );
                }

                return result;
              }),
            ];
          };

          const buildEducation = (): Paragraph[] => {
            if (education.length === 0) return [];
            return [
              sectionHeader('EDUCATION'),
              ...education.flatMap((edu) => {
                const eduLayout = layout.educationEntries.find((e) => e.eduId === edu.id);
                const gradDate = formatResumeDate(edu.endDate);

                const degreeHasIn = edu.degree?.toLowerCase().includes(' in ');
                const degreeText = degreeHasIn
                  ? edu.degree
                  : `${edu.degree}${edu.field ? ' in ' + edu.field : ''}`;

                const degreeLine = alignedLine(
                  [
                    new TextRun({
                      text: degreeText,
                      bold: true,
                      size: BODY_SIZE,
                      font: 'Calibri',
                    }),
                    new TextRun({
                      text: ` \u2014 ${edu.institution}`,
                      size: SMALL_SIZE,
                      font: 'Calibri',
                    }),
                  ],
                  eduLayout?.showGraduationDate && gradDate ? gradDate : '',
                  0,
                  0
                );

                const result: Paragraph[] = [degreeLine];

                if (eduLayout?.showGpa && edu.gpa) {
                  result.push(
                    new Paragraph({
                      indent: { left: 140 },
                      children: [
                        new TextRun({
                          text: `GPA: ${edu.gpa}`,
                          italics: true,
                          size: SMALL_SIZE,
                          font: 'Calibri',
                        }),
                      ],
                      spacing: { after: 0, line: 240 },
                    })
                  );
                }

                if (eduLayout?.showCoursework && edu.relevantCoursework?.length) {
                  result.push(
                    new Paragraph({
                      indent: { left: 140 },
                      children: [
                        new TextRun({
                          text: 'Relevant Coursework: ',
                          bold: true,
                          size: SMALL_SIZE,
                          font: 'Calibri',
                        }),
                        new TextRun({
                          text: edu.relevantCoursework.join(', '),
                          size: SMALL_SIZE,
                          font: 'Calibri',
                        }),
                      ],
                      spacing: { after: 0, line: 240 },
                    })
                  );
                }

                if (eduLayout?.showHonors && edu.honors?.length) {
                  result.push(
                    new Paragraph({
                      indent: { left: 140 },
                      children: [
                        new TextRun({
                          text: 'Honors: ',
                          bold: true,
                          size: SMALL_SIZE,
                          font: 'Calibri',
                        }),
                        new TextRun({
                          text: edu.honors.join(', '),
                          size: SMALL_SIZE,
                          font: 'Calibri',
                        }),
                      ],
                      spacing: { after: 0, line: 240 },
                    })
                  );
                }

                return result;
              }),
            ];
          };

          const buildCertifications = (): Paragraph[] => {
            if (certifications.length === 0) return [];
            return [
              sectionHeader('CERTIFICATIONS'),
              ...certifications.map((cert) => {
                let dateStr = '';
                if (cert.dateObtained && cert.expirationDate)
                  dateStr = `${formatResumeDate(cert.dateObtained)} \u2013 ${formatResumeDate(cert.expirationDate)}`;
                else if (cert.dateObtained) dateStr = formatResumeDate(cert.dateObtained);
                return alignedLine(
                  [
                    new TextRun({
                      text: cert.name,
                      bold: true,
                      size: BODY_SIZE,
                      font: 'Calibri',
                    }),
                  ],
                  dateStr,
                  0,
                  0
                );
              }),
            ];
          };

          const buildProjects = (): Paragraph[] => {
            const projects = (profile.projects || []).filter(
              (p) => !exclusions.excludedProjects.has(p.id || p.name)
            );
            if (!projects.length) return [];
            return [
              sectionHeader('PROJECTS'),
              ...projects.flatMap((proj, idx) => {
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
                if (proj.impact?.trim() && !isDupe(proj.impact)) {
                  bullets.push(proj.impact);
                }
                if (bullets.length < 3 && proj.description) {
                  const sentences = proj.description
                    .split(/(?<=[.!?])\s+/)
                    .filter((s) => s.trim().length > 10 && !isDupe(s));
                  if (sentences.length > 0) {
                    const needed = Math.max(0, 3 - bullets.length);
                    bullets.push(...sentences.slice(0, Math.min(needed, sentences.length)));
                  } else if (bullets.length === 0 && !isDupe(proj.description)) {
                    bullets.push(proj.description);
                  }
                }
                if (bullets.length < 5 && proj.technologies?.length) {
                  const techBullet = `Built using ${proj.technologies.join(', ')}`;
                  if (
                    !isDupe(techBullet) &&
                    !bullets.some((b) => b.includes(proj.technologies![0]))
                  ) {
                    bullets.push(techBullet);
                  }
                }

                const dateRange = proj.dateRange ? formatResumeDate(proj.dateRange) : '';

                const projTitle = proj.url ? `${proj.name} | GitHub` : proj.name;
                return [
                  alignedLine(
                    [
                      new TextRun({
                        text: projTitle,
                        bold: true,
                        size: TITLE_SIZE,
                        font: 'Calibri',
                      }),
                    ],
                    dateRange,
                    idx === 0 ? 0 : 80,
                    20
                  ),
                  ...bullets.slice(0, targetPages === 1 ? 2 : 5).map((b) => bulletParagraph(b)),
                  ...(proj.technologies?.length && targetPages > 1
                    ? [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: 'Environment: ',
                              bold: true,
                              size: BODY_SIZE,
                              font: 'Calibri',
                            }),
                            new TextRun({
                              text: proj.technologies.join(', '),
                              size: BODY_SIZE,
                              font: 'Calibri',
                            }),
                          ],
                          spacing: { before: 10, after: 0, line: 240 },
                        }),
                      ]
                    : []),
                ];
              }),
            ];
          };

          // ---- Assemble sections based on layout engine ordering ----
          const sectionBuilders: Record<string, () => (Paragraph | Table)[]> = {
            name: buildName,
            contact: buildContact,
            summary: buildSummary,
            skills: buildSkills,
            experience: buildExperience,
            education: buildEducation,
            certifications: buildCertifications,
            projects: buildProjects,
          };

          const assembled: (Paragraph | Table)[] = [];
          for (const section of layout.sections) {
            if (!section.visible) continue;
            const builder = sectionBuilders[section.type];
            if (builder) assembled.push(...builder());
          }
          return assembled;
        })(),
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${fileName}.docx`);
}
