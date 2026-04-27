/**
 * PDF Generator — Generates ATS-safe PDF resumes
 *
 * Extracted from ResumeGenerator.tsx. Takes profile data and layout
 * configuration and produces a downloadable PDF file using jsPDF.
 */

import { jsPDF } from 'jspdf';
import type {
  MasterProfile,
  GeneratedProfile,
  EnrichedExperience,
} from '@shared/types/master-profile.types';
import type { ResumeLayout, ContentExclusions } from '@core/resume/layout-engine';
import { formatResumeDate, shortenUrl } from '@core/resume/layout-engine';
import { buildSkillCategories, type KeywordWithFrequency } from './SkillCategorizer';
import type { TailoredContent } from './DocxGenerator';
import { scanHiddenContent, blockExportIfFound } from '@core/resume/hidden-content-scanner';

/**
 * Collect every text blob that will end up in the exported resume so the
 * hidden-content scanner can vet them. The scanner runs BEFORE PDF generation
 * starts so we never write a blacklist-bait file. See chrome-agent.md
 * Authenticity Guard.
 */
function collectExportTexts(params: PdfGeneratorParams): string[] {
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

export interface PdfGeneratorParams {
  fileName: string;
  profile: MasterProfile;
  activeRole: GeneratedProfile;
  layout: ResumeLayout;
  exclusions: ContentExclusions;
  targetPages: number;
  tailored: TailoredContent | null;
  matchedKeywords?: KeywordWithFrequency[];
}

/**
 * Generate and save a PDF resume file.
 */
export function generatePdf(params: PdfGeneratorParams): void {
  // SAFETY: Block the export if any text headed for the resume contains hidden
  // smuggling (zero-width unicode, prompt injection, microscopic markers). The
  // white-text trick collapses to plain text in this pipeline so the only
  // detectable surfaces are the ones the scanner checks. Throws
  // HiddenContentBlockedError on any error-severity finding; the caller in
  // ResumeGenerator.tsx is responsible for showing a useful UI.
  const issues = scanHiddenContent(collectExportTexts(params));
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

  // US Letter: 215.9mm x 279.4mm
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const personal = profile.personal;

  // Set PDF metadata so ATS / recruiters see the candidate's name (not "jsPDF")
  // when they scrape the file's Author/Creator/Producer fields. Some ATS
  // systems flag generic creator strings ("jsPDF", "PDFKit") as a signal that
  // a doc was machine-generated. Putting the user's real name there matches
  // the resume content and is the convention used by Word/Pages exports.
  const authorName = personal.fullName?.trim() || 'Candidate';
  pdf.setProperties({
    title: `Resume - ${authorName}`,
    subject: 'Resume',
    author: authorName,
    creator: authorName,
    keywords: 'resume',
  });
  const experience = profile.experience || [];
  const education = profile.education || [];
  const certifications = profile.certifications || [];

  const summaryText =
    tailored?.optimizedSummary ||
    activeRole?.tailoredSummary ||
    profile.careerContext?.summary ||
    'Professional summary not available.';

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

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15.875; // 0.625" in mm
  const marginTop = 12.7; // 0.5" top
  const contentWidth = pageWidth - margin * 2;
  let y = marginTop + 4;

  // Body font size
  const bodyFs = 10;
  const smallFs = 9;
  // Dynamic line height
  const getLineH = () => pdf.getFontSize() * 1.15 * (25.4 / 72);

  // Usable content area
  const bottomMargin = 12.7;
  const usableHeight = pageHeight - bottomMargin;

  // Section spacing multiplier
  let sectionGap = 2.5;
  let bulletGap = 0;
  let roleGap = 1.5;

  const checkPage = (need: number) => {
    if (y + need > usableHeight) {
      pdf.addPage();
      y = marginTop + 2;
    }
  };

  // PDF section header helper
  const pdfSectionHeader = (text: string) => {
    checkPage(10);
    y += sectionGap;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(text, margin, y);
    y += 1.2;
    pdf.setLineWidth(0.2);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 3.5;
    pdf.setFontSize(bodyFs);
  };

  // ---- Section renderers ----

  const renderName = () => {
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(personal?.fullName?.toUpperCase() || 'NAME', pageWidth / 2, y, {
      align: 'center',
    });
    y += 5;

    const roleTitle = activeRole?.targetRole || profile.careerContext?.primaryDomain || '';
    if (roleTitle) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(roleTitle, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }
  };

  const renderContact = () => {
    pdf.setFontSize(smallFs);
    pdf.setFont('helvetica', 'normal');

    const contact = [
      personal?.phone,
      personal?.email,
      (() => {
        const loc = personal?.location;
        if (!loc) return '';
        return [loc.city, loc.state].filter(Boolean).join(', ');
      })(),
      personal?.linkedInUrl ? shortenUrl(personal.linkedInUrl) : '',
      personal?.githubUrl ? shortenUrl(personal.githubUrl) : '',
      personal?.portfolioUrl ? shortenUrl(personal.portfolioUrl) : '',
    ].filter(Boolean);
    pdf.text(contact.join(' | '), pageWidth / 2, y, { align: 'center' });
    y += 3;
  };

  const renderSummary = () => {
    pdfSectionHeader('PROFESSIONAL SUMMARY');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(bodyFs);
    const summaryLines = pdf.splitTextToSize(summaryText, contentWidth);
    pdf.text(summaryLines, margin, y);
    y += summaryLines.length * getLineH() + 0.5;
  };

  const renderSkills = () => {
    const skillCategories = buildSkillCategories(
      profile.skills,
      activeRole,
      experience,
      matchedKeywords,
      tailored?.addedKeywords
    );
    if (skillCategories.length === 0) return;

    pdfSectionHeader('TECHNICAL SKILLS');
    pdf.setFontSize(bodyFs);

    skillCategories.forEach((cat) => {
      if (!cat.category || !cat.skills?.length) return;
      checkPage(4);
      pdf.setFont('helvetica', 'bold');
      const label = (cat.category || 'Skills') + ': ';
      pdf.text(label, margin + 2, y);
      const labelWidth = pdf.getTextWidth(label);
      pdf.setFont('helvetica', 'normal');
      const skillText = cat.skills.join(', ');
      const lines = pdf.splitTextToSize(skillText || '', contentWidth - labelWidth - 4);
      if (lines && lines.length > 0) {
        pdf.text(lines, margin + 2 + labelWidth, y);
        y += lines.length * getLineH() + 0.3;
      }
    });
  };

  const renderExperience = () => {
    const filtered = experience.filter(
      (exp: EnrichedExperience) => !exclusions.excludedExperiences.has(exp.id || exp.company)
    );
    if (filtered.length === 0) return;
    pdfSectionHeader('WORK EXPERIENCE');
    pdf.setFontSize(bodyFs);

    filtered.forEach((exp: EnrichedExperience, idx: number) => {
      const expId = exp.id || exp.company;
      const earlyCareer = isEarlyCareerRole(expId);
      const startDate = formatResumeDate(exp.startDate);
      const endDate = exp.isCurrent ? 'Present' : formatResumeDate(exp.endDate);

      if (idx > 0) y += roleGap;
      checkPage(earlyCareer ? 6 : 12);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bolditalic');
      pdf.text(exp.title || 'Position', margin, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(bodyFs);
      pdf.text(`${startDate} \u2013 ${endDate}`, pageWidth - margin, y, { align: 'right' });
      y += 3.5;

      pdf.setFont('helvetica', 'italic');
      const companyText = exp.location
        ? `${exp.company} \u2014 ${exp.location}`
        : exp.company || '';
      pdf.text(companyText, margin, y);
      pdf.setFont('helvetica', 'normal');
      y += 3;

      if (earlyCareer) return;

      const enhanced = enhancedBulletsMap.get(expId);
      const allBullets =
        enhanced && enhanced.length > 0
          ? enhanced
          : [
              ...(exp.achievements || [])
                .map((a) => (typeof a === 'string' ? a : a?.statement))
                .filter(Boolean),
              ...(exp.responsibilities || []).filter(Boolean),
            ];
      const maxBullets = getMaxBulletsForRole(expId);
      const bullets = allBullets.slice(0, maxBullets);

      bullets.forEach((b) => {
        if (!b) return;
        checkPage(4);
        const lines = pdf.splitTextToSize(`\u2022 ${b}`, contentWidth - 4);
        lines.forEach((line: string, i: number) => {
          if (line) pdf.text(line, margin + (i === 0 ? 0 : 2.5), y);
          y += getLineH();
        });
        y += bulletGap;
      });
    });
  };

  const renderEducation = () => {
    if (education.length === 0) return;
    pdfSectionHeader('EDUCATION');
    pdf.setFontSize(bodyFs);

    education.forEach((edu) => {
      const eduLayout = layout.educationEntries.find((e) => e.eduId === edu.id);
      checkPage(5);

      const eduDegreeHasIn = edu.degree?.toLowerCase().includes(' in ');
      const degreeText = eduDegreeHasIn
        ? edu.degree || ''
        : `${edu.degree || ''}${edu.field ? ' in ' + edu.field : ''}`;

      pdf.setFont('helvetica', 'bold');
      pdf.text(degreeText, margin, y);
      const degWidth = pdf.getTextWidth(degreeText);
      pdf.setFontSize(smallFs);
      pdf.setFont('helvetica', 'normal');
      pdf.text(` \u2014 ${edu.institution}`, margin + degWidth, y);

      const pdfGradDate = formatResumeDate(edu.endDate);
      if (pdfGradDate && eduLayout?.showGraduationDate) {
        pdf.setFontSize(bodyFs);
        pdf.text(pdfGradDate, pageWidth - margin, y, { align: 'right' });
      }
      y += getLineH();
      pdf.setFontSize(bodyFs);

      if (eduLayout?.showGpa && edu.gpa) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(smallFs);
        pdf.text(`GPA: ${edu.gpa}`, margin + 3, y);
        y += 2.5;
        pdf.setFontSize(bodyFs);
      }
    });
  };

  const renderCertifications = () => {
    if (certifications.length === 0) return;
    pdfSectionHeader('CERTIFICATIONS');
    pdf.setFontSize(bodyFs);

    certifications.forEach((cert) => {
      checkPage(4);
      pdf.setFont('helvetica', 'bold');
      pdf.text(cert.name || 'Certification', margin, y);
      pdf.setFont('helvetica', 'normal');
      if (cert.dateObtained) {
        pdf.text(formatResumeDate(cert.dateObtained), pageWidth - margin, y, {
          align: 'right',
        });
      }
      y += getLineH();
    });
  };

  const renderProjects = () => {
    const projects = (profile.projects || []).filter(
      (p) => !exclusions.excludedProjects.has(p.id || p.name)
    );
    if (projects.length === 0) return;
    pdfSectionHeader('PROJECTS');
    pdf.setFontSize(bodyFs);

    projects.forEach((proj, idx) => {
      if (idx > 0) y += 1;
      checkPage(8);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      const projTitle = proj.url ? `${proj.name || 'Project'} | GitHub` : proj.name || 'Project';
      pdf.text(projTitle, margin, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(bodyFs);
      if (proj.dateRange)
        pdf.text(formatResumeDate(proj.dateRange), pageWidth - margin, y, { align: 'right' });
      y += 3.5;

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
      if (bullets.length < 2 && proj.description) {
        const sentences = proj.description
          .split(/(?<=[.!?])\s+/)
          .filter((s) => s.trim().length > 10 && !isDupe(s));
        bullets.push(...sentences.slice(0, 2));
      }
      if (proj.technologies?.length && bullets.length < 4) {
        const techBullet = `Technologies: ${proj.technologies.join(', ')}`;
        if (!isDupe(techBullet)) bullets.push(techBullet);
      }

      bullets.slice(0, targetPages === 1 ? 2 : 4).forEach((b) => {
        if (!b) return;
        checkPage(4);
        const lines = pdf.splitTextToSize(`\u2022 ${b}`, contentWidth - 4);
        lines.forEach((line: string, i: number) => {
          if (line) pdf.text(line, margin + (i === 0 ? 0 : 2.5), y);
          y += getLineH();
        });
      });
    });
  };

  // ---- Render sections based on layout engine ordering ----
  const pdfRenderers: Record<string, () => void> = {
    name: renderName,
    contact: renderContact,
    summary: renderSummary,
    skills: renderSkills,
    experience: renderExperience,
    education: renderEducation,
    certifications: renderCertifications,
    projects: renderProjects,
  };

  const renderAllSections = () => {
    for (const section of layout.sections) {
      if (!section.visible) continue;
      const renderer = pdfRenderers[section.type];
      if (renderer) renderer();
    }
  };

  // Pass 1: Render normally to measure content height
  renderAllSections();
  const contentEnd = y;
  const remainingSpace = usableHeight - contentEnd;
  const pageCount = pdf.getNumberOfPages();

  // If single page with significant bottom gap (>15mm), re-render with expanded spacing
  if (pageCount === 1 && remainingSpace > 15) {
    // If lots of space remaining (>40mm), try adding more bullets first
    if (remainingSpace > 40) {
      const extraBulletLines = Math.floor((remainingSpace - 20) / 3.5);
      let bulletsToAdd = extraBulletLines;

      for (const role of layout.experienceRoles) {
        if (role.isEarlyCareer || bulletsToAdd <= 0) continue;
        const exp = experience.find((e) => (e.id || e.company) === role.expId);
        if (!exp) continue;

        const availableBullets = [
          ...(exp.achievements || []).map((a) => (typeof a === 'string' ? a : a?.statement)),
          ...(exp.responsibilities || []),
        ].filter(Boolean).length;

        const canAdd = Math.min(availableBullets - role.maxBullets, 3, bulletsToAdd);
        if (canAdd > 0) {
          role.maxBullets += canAdd;
          bulletsToAdd -= canAdd;
        }
      }
    }

    // Re-measure after potential bullet increase
    pdf.addPage();
    y = marginTop + 4;
    renderAllSections();
    const pass2End = y;
    const pass2Remaining = usableHeight - pass2End;

    // Distribute remaining space across gaps
    if (pass2Remaining > 10) {
      const visibleSections = layout.sections.filter((s) => s.visible).length;
      const sectionCount = Math.max(1, visibleSections - 2);
      const expCount = experience.filter(
        (e) => !exclusions.excludedExperiences.has(e.id || e.company)
      ).length;
      const totalBullets = layout.experienceRoles.reduce((s, r) => s + r.maxBullets, 0);

      sectionGap = 2.5 + Math.min((pass2Remaining * 0.55) / sectionCount, 5.5);
      roleGap = 1.5 + (expCount > 1 ? Math.min((pass2Remaining * 0.3) / (expCount - 1), 3.5) : 0);
      bulletGap = totalBullets > 0 ? Math.min((pass2Remaining * 0.15) / totalBullets, 1.2) : 0;

      // Pass 3: Final render with adjusted spacing
      pdf.addPage();
      y = marginTop + 4;
      renderAllSections();
      pdf.deletePage(2);
    }

    pdf.deletePage(1);
    pdf.save(`${fileName}.pdf`);
  } else {
    pdf.save(`${fileName}.pdf`);
  }
}
