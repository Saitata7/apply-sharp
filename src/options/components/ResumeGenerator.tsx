import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { MasterProfile, GeneratedProfile } from '@shared/types/master-profile.types';
import { sendMessage } from '@shared/utils/messaging';
// Layout engine and utilities extracted to core module
import {
  type ContentExclusions,
  computeYearsFromDates,
  getRecommendedPages,
  computeResumeLayout,
  computeSectionPriorities,
  applyPageSatisfaction,
  formatResumeDate,
} from '@core/resume/layout-engine';
import DiffView, { type ApprovedChanges } from './resume/DiffView';
// Extracted modules
import { generateDocx as generateDocxFile, type TailoredContent } from './resume/DocxGenerator';
import { generatePdf as generatePdfFile } from './resume/PdfGenerator';
import {
  analyzeLocally as analyzeLocallyFn,
  calculateProfileCounts as calculateProfileCountsFn,
  enrichWithProfileCounts,
  type JDAnalysis,
} from './resume/JDAnalyzer';
import ResumePreview from './resume/ResumePreview';

interface ResumeGeneratorProps {
  profile: MasterProfile;
  selectedRole?: GeneratedProfile | null;
  onClose: () => void;
}

type GeneratorMode = 'select' | 'without-jd' | 'with-jd';

export default function ResumeGenerator({ profile, selectedRole, onClose }: ResumeGeneratorProps) {
  const [mode, setMode] = useState<GeneratorMode>(selectedRole ? 'without-jd' : 'select');
  const [activeRole, setActiveRole] = useState<GeneratedProfile | null>(selectedRole || null);
  const [jobDescription, setJobDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [analysis, setAnalysis] = useState<JDAnalysis | null>(null);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [enhanceSuccess, setEnhanceSuccess] = useState<string | null>(null);
  const [tailoredContent, setTailoredContent] = useState<TailoredContent | null>(null);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoringProgress, setTailoringProgress] = useState<string>('');
  const [showSaveVersion, setShowSaveVersion] = useState(false);
  const [lastGeneratedFormat, setLastGeneratedFormat] = useState<string | null>(null);
  const [showMatchedKeywords, setShowMatchedKeywords] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [originalScore, setOriginalScore] = useState<number>(0);
  const [exclusions, setExclusions] = useState<ContentExclusions>({
    excludedExperiences: new Set(),
    excludedProjects: new Set(),
    hiddenSections: new Set(),
  });
  const [showContentControls, setShowContentControls] = useState(false);
  const [isQuickTailoring, setIsQuickTailoring] = useState(false);
  const [quickTailorStep, setQuickTailorStep] = useState('');
  const [showDiffView, setShowDiffView] = useState(false);
  const analyzeJobDescriptionRef = useRef<() => Promise<void>>();

  // Focus trap: cycles Tab/Shift+Tab within modal, Escape closes
  const handleEscape = useCallback(() => {
    if (!isAnalyzing && !isGenerating && !isTailoring) onClose();
  }, [isAnalyzing, isGenerating, isTailoring, onClose]);
  const focusTrapRef = useFocusTrap<HTMLDivElement>(handleEscape);

  // LinkedIn sidebar Tailor handoff: when the user clicks Tailor in the
  // LinkedIn sidebar inject function, the JD gets stashed in
  // chrome.storage.local.tailorHandoff. Read it on mount, pre-fill the
  // jobDescription textarea, switch to the with-jd mode, then remove
  // the key so a refresh does not re-apply it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const got = await chrome.storage.local.get('tailorHandoff');
        if (cancelled) return;
        const handoff = got?.tailorHandoff as
          | { jobTitle?: string; companyName?: string; jobDescription?: string; createdAt?: number }
          | undefined;
        if (!handoff?.jobDescription) return;
        // Drop stale handoffs older than 5 minutes
        if (
          typeof handoff.createdAt === 'number' &&
          Date.now() - handoff.createdAt > 5 * 60 * 1000
        ) {
          await chrome.storage.local.remove('tailorHandoff');
          return;
        }
        setJobDescription(handoff.jobDescription);
        setMode('with-jd');
        await chrome.storage.local.remove('tailorHandoff');
      } catch {
        // chrome.storage may be unavailable; silent fall-through
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page count control — use actual job dates as ground truth, careerContext as fallback
  const computedYears = useMemo(
    () => computeYearsFromDates(profile.experience || []),
    [profile.experience]
  );
  const yearsOfExp = computedYears || profile.careerContext?.yearsOfExperience || 0;
  const recommendedPages = getRecommendedPages(yearsOfExp);
  const [targetPages, setTargetPages] = useState<number>(recommendedPages);

  // Layout engine — computes section order, bullet budgets, visibility rules,
  // then applies user exclusions and page satisfaction auto-trimming
  const layout = useMemo(() => {
    const base = computeResumeLayout({
      yearsOfExperience: yearsOfExp,
      targetPages,
      experience: profile.experience || [],
      education: profile.education || [],
      projects: profile.projects || [],
      certifications: profile.certifications || [],
    });

    // Apply user exclusions — hide toggled-off sections
    const sections = base.sections.map((s) =>
      exclusions.hiddenSections.has(s.type) ? { ...s, visible: false } : s
    );

    // Compute priorities for page satisfaction
    const priorities = computeSectionPriorities({
      level: base.experienceLevel,
      yearsOfExperience: yearsOfExp,
      education: profile.education || [],
      projects: profile.projects || [],
      certifications: profile.certifications || [],
      jdText: jobDescription || undefined,
    });

    const withExclusions = { ...base, sections };

    // Apply page satisfaction — auto-trim if over budget
    return applyPageSatisfaction(
      withExclusions,
      exclusions,
      profile.experience || [],
      profile.projects || [],
      priorities,
      targetPages
    );
  }, [
    yearsOfExp,
    targetPages,
    profile.experience,
    profile.education,
    profile.projects,
    profile.certifications,
    exclusions,
    jobDescription,
  ]);

  // Get max bullets for a role from layout engine
  const getMaxBulletsForRole = (expId: string): number => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.maxBullets ?? 5;
  };

  const generatedProfiles = profile.generatedProfiles || [];

  // Get role icon
  const getRoleIcon = (role: string) => {
    const roleLower = role.toLowerCase();
    if (roleLower.includes('backend')) return '⚙️';
    if (roleLower.includes('frontend')) return '🎨';
    if (roleLower.includes('full') || roleLower.includes('stack')) return '🔄';
    if (roleLower.includes('devops') || roleLower.includes('sre')) return '🚀';
    if (roleLower.includes('data') || roleLower.includes('ml') || roleLower.includes('ai'))
      return '🧠';
    if (roleLower.includes('mobile')) return '📱';
    return '💼';
  };

  // Calculate profile keyword counts - delegates to extracted JDAnalyzer
  const calculateProfileCounts = useCallback((): Record<string, number> => {
    const counts = calculateProfileCountsFn(profile, generatedProfiles);
    console.debug(
      '[ResumeGenerator] Profile counts calculated:',
      Object.keys(counts).length,
      'entries'
    );
    return counts;
  }, [profile, generatedProfiles]);

  const analyzeJobDescription = async () => {
    if (!jobDescription.trim()) {
      setError('Please paste a job description');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    // Calculate profile counts first
    const profileCounts = calculateProfileCounts();

    try {
      const response = await sendMessage<
        { masterProfileId: string; jobDescription: string },
        JDAnalysis
      >({
        type: 'ANALYZE_JD_FOR_RESUME',
        payload: {
          masterProfileId: profile.id,
          jobDescription: jobDescription.trim(),
        },
      });

      if (response.success && response.data) {
        // Enrich backend results with profile counts
        const enrichedAnalysis = {
          ...response.data,
          matchedKeywords: enrichWithProfileCounts(response.data.matchedKeywords, profileCounts),
        };
        setAnalysis(enrichedAnalysis);
        setCurrentScore(enrichedAnalysis.matchScore);
        if (enrichedAnalysis.matchedRole) {
          setActiveRole(enrichedAnalysis.matchedRole);
        }
      } else {
        // Fallback: do local keyword matching if AI fails
        const localAnalysis = analyzeLocally(jobDescription);
        setAnalysis(localAnalysis);
        setCurrentScore(localAnalysis.matchScore);
        if (localAnalysis.matchedRole) {
          setActiveRole(localAnalysis.matchedRole);
        }
      }
    } catch (err) {
      // Fallback to local analysis
      const localAnalysis = analyzeLocally(jobDescription);
      setAnalysis(localAnalysis);
      setCurrentScore(localAnalysis.matchScore);
      if (localAnalysis.matchedRole) {
        setActiveRole(localAnalysis.matchedRole);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };
  analyzeJobDescriptionRef.current = analyzeJobDescription;

  // Local keyword-based analysis (fallback) - delegates to extracted JDAnalyzer
  const analyzeLocally = (jd: string): JDAnalysis => {
    const profileCounts = calculateProfileCounts();
    return analyzeLocallyFn(jd, profile, generatedProfiles, profileCounts);
  };

  // Enhance profile with AI
  const enhanceWithAI = async () => {
    if (!analysis || analysis.missingKeywords.length === 0) {
      return;
    }

    setIsEnhancing(true);
    setError(null);
    setEnhanceSuccess(null);

    try {
      const keywordsToAdd = analysis.missingKeywords.slice(0, 10).map((kw) => kw.keyword);

      const response = await sendMessage<
        { masterProfileId: string; keywords: string[]; context: string },
        { addedToSkills: string[]; addedToAtsKeywords: string[]; suggestions: string[] }
      >({
        type: 'UPDATE_ANSWER_BANK',
        payload: {
          masterProfileId: profile.id,
          keywords: keywordsToAdd,
          context: jobDescription.trim(),
        },
      });

      if (response.success && response.data) {
        const totalAdded =
          (response.data.addedToSkills?.length || 0) +
          (response.data.addedToAtsKeywords?.length || 0);
        if (totalAdded > 0) {
          setEnhanceSuccess(`Added ${totalAdded} keywords to your profile!`);
          setTimeout(() => analyzeJobDescriptionRef.current?.(), 500);
        } else {
          await enhanceLocally(keywordsToAdd);
        }
      } else {
        await enhanceLocally(keywordsToAdd);
      }
    } catch (error) {
      console.debug(
        '[ResumeGenerator] AI enhancement failed, falling back to local:',
        (error as Error).message
      );
      const keywordsToAdd = analysis.missingKeywords.slice(0, 10).map((kw) => kw.keyword);
      await enhanceLocally(keywordsToAdd);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Local enhancement
  const enhanceLocally = async (keywords: string[]) => {
    if (!activeRole) return;

    const validKeywords = keywords.filter((kw) => {
      const kwLower = kw.toLowerCase().trim();
      const wordCount = kwLower.split(/\s+/).length;
      return (
        kw.length >= 2 &&
        kw.length <= 50 &&
        wordCount <= 4 &&
        !['the', 'and', 'or', 'for', 'with', 'you', 'will', 'can', 'are'].includes(kwLower) &&
        !/^(ability|experience|knowledge|understanding|familiarity|bachelor|master|degree)\b/.test(
          kwLower
        )
      );
    });

    if (validKeywords.length === 0) {
      setError('No valid keywords to add');
      return;
    }

    const existingAtsKeywords = activeRole.atsKeywords || [];
    const newAtsKeywords = [...new Set([...existingAtsKeywords, ...validKeywords])];

    try {
      await sendMessage({
        type: 'UPDATE_PROFILE',
        payload: {
          masterProfileId: profile.id,
          roleId: activeRole.id,
          updates: { atsKeywords: newAtsKeywords },
        },
      });

      setActiveRole({ ...activeRole, atsKeywords: newAtsKeywords });
      setEnhanceSuccess(`Added ${validKeywords.length} keywords: ${validKeywords.join(', ')}`);

      setTimeout(() => {
        const localAnalysis = analyzeLocally(jobDescription);
        setAnalysis(localAnalysis);
        setCurrentScore(localAnalysis.matchScore);
      }, 300);
    } catch (error) {
      console.debug('[ResumeGenerator] Profile update failed:', (error as Error).message);
      setError('Failed to update profile');
    }
  };

  // Get bullet count for AI tailoring — aligned with layout engine so AI generates correct count
  const getBulletCountForRole = (expId: string): number => {
    return getMaxBulletsForRole(expId);
  };

  // Tailor resume content using AI
  const tailorResumeWithAI = async (): Promise<TailoredContent | null> => {
    if (!analysis || !activeRole || !jobDescription.trim()) return null;

    setIsTailoring(true);
    setTailoringProgress('Analyzing job requirements...');

    try {
      const keyBulletPoints = (profile.experience || []).map((exp) => {
        const expId = exp.id || exp.company;
        const bulletCount = getBulletCountForRole(expId);

        // Collect ALL available bullets from achievements and responsibilities
        const allBullets = [
          ...(exp.achievements || []).map((a) => (typeof a === 'string' ? a : a.statement)),
          ...(exp.responsibilities || []),
        ];

        return {
          expId,
          bullets: allBullets.slice(0, Math.max(bulletCount, allBullets.length)),
          expectedCount: bulletCount,
          durationMonths: exp.durationMonths || 12,
        };
      });

      setTailoringProgress('Rewriting summary to match JD language...');

      // Sort matched keywords by profile count (highest first) - these are your strengths
      const strengthKeywords = [...analysis.matchedKeywords]
        .sort((a, b) => (b.profileCount || 1) - (a.profileCount || 1))
        .slice(0, 10)
        .map((kw) => ({ keyword: kw.keyword, count: kw.profileCount || 1 }));

      const response = await sendMessage<
        {
          masterProfileId: string;
          roleId: string;
          jobDescription: string;
          missingKeywords: string[];
          strengthKeywords: Array<{ keyword: string; count: number }>;
          currentSummary: string;
          keyBulletPoints: Array<{
            expId: string;
            bullets: string[];
            expectedCount: number;
            durationMonths: number;
          }>;
        },
        TailoredContent
      >({
        type: 'OPTIMIZE_RESUME_FOR_JD',
        payload: {
          masterProfileId: profile.id,
          roleId: activeRole.id,
          jobDescription: jobDescription.trim(),
          missingKeywords: analysis.missingKeywords.map((kw) => kw.keyword),
          strengthKeywords, // NEW: Pass your strongest keywords
          currentSummary: activeRole.tailoredSummary || profile.careerContext?.summary || '',
          keyBulletPoints,
        },
      });

      setTailoringProgress('Enhancing bullet points with JD keywords...');

      if (response.success && response.data) {
        setOriginalScore(currentScore);
        setTailoredContent(response.data);
        setCurrentScore(response.data.newScore);
        return response.data;
      }
      return null;
    } catch (err) {
      console.error('AI tailoring failed:', err);
      return null;
    } finally {
      setIsTailoring(false);
      setTailoringProgress('');
    }
  };

  // Wrapper for DOCX generation using extracted module
  const generateDocx = async (fileName: string, tailored: TailoredContent | null) => {
    await generateDocxFile({
      fileName,
      profile,
      activeRole: activeRole!,
      layout,
      exclusions,
      targetPages,
      tailored,
      matchedKeywords: analysis?.matchedKeywords,
    });
  };

  // Wrapper for PDF generation using extracted module
  const generatePdf = (fileName: string, tailored: TailoredContent | null) => {
    generatePdfFile({
      fileName,
      profile,
      activeRole: activeRole!,
      layout,
      exclusions,
      targetPages,
      tailored,
      matchedKeywords: analysis?.matchedKeywords,
    });
  };

  // Quick Tailor + Download: one-click orchestration
  const quickTailorAndDownload = async (format: 'docx' | 'pdf') => {
    if (!activeRole || !jobDescription.trim()) {
      setError('Please select a role and paste a job description');
      return;
    }

    setIsQuickTailoring(true);
    setError(null);

    try {
      // Step 1: Analyze
      setQuickTailorStep('Analyzing job description...');
      const response = await sendMessage<
        {
          masterProfileId: string;
          roleId: string;
          jobDescription: string;
          includeCoverLetter?: boolean;
        },
        {
          analysis: Record<string, unknown>;
          tailoredContent: TailoredContent;
          coverLetter?: unknown;
          newScore?: number;
        }
      >({
        type: 'QUICK_TAILOR',
        payload: {
          masterProfileId: profile.id,
          roleId: activeRole.id,
          jobDescription: jobDescription.trim(),
          includeCoverLetter: false,
        },
      });

      if (!response.success || !response.data) {
        setError(response.error || 'Quick tailor failed');
        return;
      }

      // Step 2: Apply results
      setQuickTailorStep('Tailoring resume...');
      const { tailoredContent: tailored, newScore } = response.data;
      setTailoredContent(tailored);
      if (newScore) {
        setOriginalScore(currentScore);
        setCurrentScore(newScore);
      }

      // Step 3: Generate file
      setQuickTailorStep('Generating ' + format.toUpperCase() + '...');

      const fileName = `${(profile.personal?.fullName || 'Resume').replace(/\s+/g, '_')}_Resume`;
      if (format === 'docx') {
        await generateDocx(fileName, tailored);
      } else {
        generatePdf(fileName, tailored);
      }

      setLastGeneratedFormat(format);
      setShowSaveVersion(true);
    } catch (err) {
      console.error('[QuickTailor] Failed:', err);
      setError(`Quick tailor failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsQuickTailoring(false);
      setQuickTailorStep('');
    }
  };

  // Apply approved changes from diff view
  const handleDiffApply = useCallback(
    (approved: ApprovedChanges) => {
      if (!tailoredContent) return;

      const filtered: TailoredContent = {
        optimizedSummary: approved.summary ? tailoredContent.optimizedSummary : '', // empty means use original
        enhancedBullets: tailoredContent.enhancedBullets.map((eb) => {
          const approvals = approved.bullets[eb.expId];
          if (!approvals) return eb;

          // Find the original experience to fall back on rejected bullets
          const origExp = profile.experience?.find((e) => e.id === eb.expId);
          const origBullets = origExp
            ? [
                ...(origExp.achievements || []).map((a) =>
                  typeof a === 'string' ? a : a.statement
                ),
                ...(origExp.responsibilities || []),
              ]
            : [];

          return {
            expId: eb.expId,
            bullets: eb.bullets.map((bullet, idx) =>
              approvals[idx] ? bullet : origBullets[idx] || bullet
            ),
          };
        }),
        addedKeywords: tailoredContent.addedKeywords,
        newScore: tailoredContent.newScore,
      };

      setTailoredContent(filtered);
      setShowDiffView(false);
    },
    [tailoredContent, profile.experience]
  );

  // Download helpers
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Generate and download resume
  const generateResume = async (format: 'txt' | 'json' | 'docx' | 'pdf') => {
    if (!activeRole) {
      setError('Please select a role first');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      let tailored = tailoredContent;
      if (analysis && !tailoredContent) {
        setTailoringProgress('Tailoring resume to job description...');
        tailored = await tailorResumeWithAI();
      }

      const resumeContent = formatResume(profile, activeRole, analysis, tailored);
      const fileName = `${(profile.personal?.fullName || 'Resume').replace(/\s+/g, '_')}_Resume`;

      if (format === 'txt') {
        downloadFile(resumeContent.text, `${fileName}.txt`, 'text/plain');
      } else if (format === 'json') {
        downloadFile(
          JSON.stringify(resumeContent.json, null, 2),
          `${fileName}.json`,
          'application/json'
        );
      } else if (format === 'docx') {
        await generateDocx(fileName, tailored);
      } else if (format === 'pdf') {
        generatePdf(fileName, tailored);
      }

      try {
        await sendMessage({
          type: 'TRACK_APPLICATION',
          payload: {
            jobId: `resume-gen-${Date.now()}`,
            jobTitle: activeRole.targetRole,
            company: 'Resume Generated',
            platform: 'manual',
            profileId: activeRole.id,
            keywordsUsed: activeRole.atsKeywords || [],
          },
        });
      } catch (error) {
        console.debug('[ResumeGenerator] Application tracking failed:', (error as Error).message);
      }

      setLastGeneratedFormat(format);
      setShowSaveVersion(true);

      // Auto-save resume version
      try {
        await sendMessage({
          type: 'SAVE_RESUME_VERSION',
          payload: {
            profileId: profile.id,
            roleProfileId: activeRole?.id,
            format,
            name: `${activeRole?.targetRole || 'Resume'} - ${new Date().toLocaleDateString()}`,
            contentSnapshot: JSON.stringify({
              role: activeRole?.targetRole,
              summary: activeRole?.tailoredSummary,
              format,
            }),
            atsScore: activeRole?.atsScore,
          },
        });
      } catch {
        // Non-blocking: version save failure shouldn't affect download
      }
    } catch (err) {
      console.error('[ResumeGenerator] Failed to generate resume:', err);
      setError(`Failed to generate resume: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGenerating(false);
      setTailoringProgress('');
    }
  };

  // Format resume for text/json export
  const formatResume = (
    masterProfile: MasterProfile,
    role: GeneratedProfile,
    jdAnalysis: JDAnalysis | null,
    tailored: TailoredContent | null
  ) => {
    const personal = masterProfile.personal;
    const experience = masterProfile.experience || [];
    const education = masterProfile.education || [];
    const summaryText =
      tailored?.optimizedSummary ||
      role.tailoredSummary ||
      masterProfile.careerContext?.summary ||
      '';

    let skills = role.highlightedSkills || [];
    if (jdAnalysis?.matchedKeywords) {
      const matched = jdAnalysis.matchedKeywords.map((kw) => kw.keyword);
      const other = skills.filter(
        (s) => !matched.some((m) => m.toLowerCase().includes(s.toLowerCase()))
      );
      skills = [...new Set([...matched, ...other])];
    }

    const text = `
${personal?.fullName || 'Name'}
${personal?.email || ''} | ${personal?.phone || ''} | ${personal?.location?.formatted || ''}
${personal?.linkedInUrl || ''}${personal?.githubUrl ? ' | ' + personal.githubUrl : ''}

================================================================================
PROFESSIONAL SUMMARY
================================================================================
${summaryText}

================================================================================
TECHNICAL SKILLS
================================================================================
${skills.join(' | ')}

================================================================================
PROFESSIONAL EXPERIENCE
================================================================================
${experience
  .map((exp) => {
    const bullets =
      exp.achievements?.slice(0, 4).map((a) => (typeof a === 'string' ? a : a.statement)) || [];
    return `
${exp.title}
${exp.company}${exp.location ? ' | ' + exp.location : ''}
${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate || ''}

${bullets.map((b) => `• ${b}`).join('\n')}
`;
  })
  .join('\n')}

================================================================================
EDUCATION
================================================================================
${education
  .map(
    (edu) => `
${edu.degree?.toLowerCase().includes(' in ') ? edu.degree : `${edu.degree}${edu.field ? ' in ' + edu.field : ''}`}
${edu.institution}
${formatResumeDate(edu.startDate)} - ${formatResumeDate(edu.endDate)}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}
`
  )
  .join('\n')}
`.trim();

    const json = {
      basics: {
        name: personal?.fullName,
        email: personal?.email,
        phone: personal?.phone,
        location: personal?.location?.formatted,
        summary: summaryText,
        profiles: [
          personal?.linkedInUrl && { network: 'LinkedIn', url: personal.linkedInUrl },
          personal?.githubUrl && { network: 'GitHub', url: personal.githubUrl },
        ].filter(Boolean),
      },
      skills: skills.map((s) => ({ name: s })),
      work: experience
        .filter((exp) => !exclusions.excludedExperiences.has(exp.id || exp.company))
        .map((exp) => ({
          company: exp.company,
          position: exp.title,
          location: exp.location,
          startDate: exp.startDate,
          endDate: exp.isCurrent ? 'Present' : exp.endDate,
          highlights: exp.achievements
            ?.slice(0, 4)
            .map((a) => (typeof a === 'string' ? a : a.statement)),
        })),
      education: education.map((edu) => ({
        institution: edu.institution,
        area: edu.field,
        studyType: edu.degree,
        startDate: edu.startDate,
        endDate: edu.endDate,
        gpa: edu.gpa,
      })),
      keywords: role.atsKeywords,
    };

    return { text, json };
  };

  return (
    <div
      className="modal-overlay"
      ref={focusTrapRef}
      onClick={() => !isAnalyzing && !isGenerating && onClose()}
    >
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Generate Resume</h2>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isAnalyzing || isGenerating}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {mode === 'with-jd' && (
            <div className="resume-steps">
              <div className={`resume-step ${!analysis && !isAnalyzing ? 'active' : 'completed'}`}>
                <span className="step-num">{analysis || isAnalyzing ? '\u2713' : '1'}</span>
                <span className="step-text">Paste JD</span>
              </div>
              <div className={`step-line ${analysis || isAnalyzing ? 'completed' : ''}`} />
              <div
                className={`resume-step ${analysis && !isGenerating && !isTailoring && !showSaveVersion ? 'active' : isGenerating || isTailoring || showSaveVersion ? 'completed' : ''}`}
              >
                <span className="step-num">
                  {isGenerating || isTailoring || showSaveVersion ? '\u2713' : '2'}
                </span>
                <span className="step-text">Review Match</span>
              </div>
              <div
                className={`step-line ${isGenerating || isTailoring || showSaveVersion ? 'completed' : ''}`}
              />
              <div
                className={`resume-step ${isGenerating || isTailoring || showSaveVersion ? 'active' : ''}`}
              >
                <span className="step-num">3</span>
                <span className="step-text">Generate</span>
              </div>
            </div>
          )}

          {mode === 'select' && (
            <div className="mode-selection">
              <div className="mode-card" onClick={() => setMode('without-jd')}>
                <div className="mode-icon">📄</div>
                <h3>Quick Export</h3>
                <p>Select a role profile and download your resume instantly</p>
              </div>
              <div className="mode-card" onClick={() => setMode('with-jd')}>
                <div className="mode-icon">🎯</div>
                <h3>Tailor to Job</h3>
                <p>Paste a job description for ATS-optimized resume</p>
              </div>
            </div>
          )}

          {mode === 'without-jd' && !activeRole && (
            <div className="role-selection">
              <div className="section-header-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setMode('select')}>
                  ← Back
                </button>
                <h3>Select a Role Profile</h3>
              </div>
              <div className="role-selection-grid">
                {generatedProfiles.map((role) => (
                  <div
                    key={role.id}
                    className="role-selection-card"
                    onClick={() => setActiveRole(role)}
                  >
                    <span className="role-icon">{getRoleIcon(role.targetRole)}</span>
                    <div className="role-info">
                      <h4>{role.name}</h4>
                      <span>{role.targetRole}</span>
                    </div>
                    {role.atsScore && <span className="ats-badge">{role.atsScore}%</span>}
                  </div>
                ))}
              </div>
              {generatedProfiles.length === 0 && (
                <div className="empty-roles">
                  <p>No role profiles available</p>
                  <p className="hint">Create a role profile first in the Role Profiles section</p>
                </div>
              )}
            </div>
          )}

          {mode === 'without-jd' && activeRole && !isGenerating && (
            <div className="ready-to-generate">
              <div className="section-header-row">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setActiveRole(null);
                    setShowPreview(false);
                  }}
                >
                  ← Change Role
                </button>
              </div>
              <div className="selected-role-preview">
                <span className="role-icon-lg">{getRoleIcon(activeRole.targetRole)}</span>
                <div className="role-details">
                  <h3>{activeRole.name}</h3>
                  <span className="role-target">{activeRole.targetRole}</span>
                </div>
              </div>

              {/* Download + Preview Section */}
              <div className="generate-section">
                <div className="resume-gen-section-header-row">
                  <h4>Download Resume</h4>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? 'Hide Preview' : 'Preview Resume'}
                  </button>
                </div>
                <div className="page-control">
                  <label>Page count:</label>
                  <select
                    value={targetPages}
                    onChange={(e) => setTargetPages(Number(e.target.value))}
                    className="page-select"
                  >
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                    {yearsOfExp >= 5 && <option value={3}>3 pages</option>}
                  </select>
                  {targetPages !== recommendedPages && (
                    <span className="page-hint">
                      Recommended: {recommendedPages} for {yearsOfExp}yr experience
                    </span>
                  )}
                </div>

                {/* Content Controls — section/experience/project toggles */}
                <div style={{ marginTop: '12px' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowContentControls(!showContentControls)}
                    style={{
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                    }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18" />
                    </svg>
                    Content Controls
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                      {showContentControls ? '▲' : '▼'}
                    </span>
                  </button>

                  {showContentControls && (
                    <div className="resume-gen-content-controls">
                      {/* Section Toggles */}
                      <div style={{ marginBottom: '10px' }}>
                        <div className="resume-gen-controls-label">Sections</div>
                        {layout.sections
                          .filter((s) => !['name', 'contact'].includes(s.type))
                          .map((section) => {
                            const locked = ['summary', 'skills', 'experience'].includes(
                              section.type
                            );
                            const userHidden = exclusions.hiddenSections.has(section.type);
                            const autoHidden = !section.visible && !userHidden;
                            return (
                              <label
                                key={section.type}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 0',
                                  cursor: locked ? 'not-allowed' : 'pointer',
                                  opacity: locked ? 0.6 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={!userHidden && section.visible}
                                  disabled={locked}
                                  onChange={() => {
                                    setExclusions((prev) => {
                                      const next = new Set(prev.hiddenSections);
                                      if (next.has(section.type)) next.delete(section.type);
                                      else next.add(section.type);
                                      return { ...prev, hiddenSections: next };
                                    });
                                  }}
                                />
                                <span>{section.headerText || section.type}</span>
                                {locked && (
                                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                                    (required)
                                  </span>
                                )}
                                {autoHidden && (
                                  <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>
                                    (auto-hidden to fit {targetPages}pg)
                                  </span>
                                )}
                              </label>
                            );
                          })}
                      </div>

                      {/* Experience Toggles */}
                      {(profile.experience?.length || 0) > 1 && (
                        <div style={{ marginBottom: '10px' }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              color: '#64748b',
                              marginBottom: '6px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            Experience
                          </div>
                          {(profile.experience || []).map((exp) => {
                            const expId = exp.id || exp.company;
                            const excluded = exclusions.excludedExperiences.has(expId);
                            return (
                              <label
                                key={expId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 0',
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() => {
                                    setExclusions((prev) => {
                                      const next = new Set(prev.excludedExperiences);
                                      if (next.has(expId)) next.delete(expId);
                                      else next.add(expId);
                                      return { ...prev, excludedExperiences: next };
                                    });
                                  }}
                                />
                                <span>
                                  {exp.title} @ {exp.company}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {/* Project Toggles */}
                      {(profile.projects?.length || 0) > 0 && (
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.75rem',
                              color: '#64748b',
                              marginBottom: '6px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                            }}
                          >
                            Projects
                          </div>
                          {(profile.projects || []).map((proj) => {
                            const projId = proj.id || proj.name;
                            const excluded = exclusions.excludedProjects.has(projId);
                            return (
                              <label
                                key={projId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '3px 0',
                                  cursor: 'pointer',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() => {
                                    setExclusions((prev) => {
                                      const next = new Set(prev.excludedProjects);
                                      if (next.has(projId)) next.delete(projId);
                                      else next.add(projId);
                                      return { ...prev, excludedProjects: next };
                                    });
                                  }}
                                />
                                <span>{proj.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="format-options">
                  <button
                    className="format-card"
                    onClick={() => generateResume('docx')}
                    disabled={isGenerating}
                  >
                    <span className="format-icon">📝</span>
                    <div className="format-info">
                      <strong>DOCX</strong>
                      <span>Best for ATS systems</span>
                    </div>
                    <span className="format-badge recommended">Recommended</span>
                  </button>
                  <button
                    className="format-card"
                    onClick={() => generateResume('pdf')}
                    disabled={isGenerating}
                  >
                    <span className="format-icon">📄</span>
                    <div className="format-info">
                      <strong>PDF</strong>
                      <span>Universal format</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Full Resume Preview */}
              {showPreview && (
                <div className="resume-gen-preview-container">
                  {analysis && !tailoredContent && (
                    <div className="resume-gen-banner-warning">
                      Preview shows base content. Download will include AI-tailored summary and
                      enhanced bullets.
                    </div>
                  )}
                  {tailoredContent && (
                    <div className="resume-gen-banner-success">
                      <span>Showing AI-tailored content (score: {tailoredContent.newScore}%)</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowDiffView(true)}
                      >
                        Review Changes
                      </button>
                    </div>
                  )}
                  {/* Workstream 3 humanization linter banner. The
                      handleOptimizeResumeForJD handler runs detectAITells over
                      the optimized summary AND every enhanced bullet, then
                      returns the result on the response payload. Render the
                      summary as a soft warning so the user can rewrite or
                      regenerate before downloading the final PDF/DOCX. */}
                  {tailoredContent?.aiTells?.hasIssues && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        padding: '10px 14px',
                        marginBottom: 12,
                        background: 'var(--cl-orange-glow)',
                        border: '1px solid var(--cl-orange-glow)',
                        borderRadius: 6,
                        fontSize: 13,
                        color: 'var(--cl-orange)',
                      }}
                    >
                      <strong>Humanization check:</strong> {tailoredContent.aiTells.summary}
                      {tailoredContent.aiTells.bannedTokens.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 12 }}>
                          Banned vocabulary detected:{' '}
                          <em>{tailoredContent.aiTells.bannedTokens.join(', ')}</em>. Edit before
                          downloading or click Tailor again.
                        </div>
                      )}
                    </div>
                  )}
                  {showDiffView && tailoredContent && (
                    <DiffView
                      originalSummary={
                        activeRole?.tailoredSummary || profile.careerContext?.summary || ''
                      }
                      tailoredContent={tailoredContent}
                      experiences={profile.experience || []}
                      originalScore={originalScore}
                      onApply={handleDiffApply}
                      onClose={() => setShowDiffView(false)}
                    />
                  )}
                  {!showDiffView && (
                    <ResumePreview
                      profile={profile}
                      activeRole={activeRole}
                      layout={layout}
                      exclusions={exclusions}
                      tailoredContent={tailoredContent}
                      matchedKeywords={analysis?.matchedKeywords}
                    />
                  )}
                </div>
              )}

              {showSaveVersion && lastGeneratedFormat && (
                <div className="post-download-card">
                  <div className="post-download-icon">✅</div>
                  <div className="post-download-content">
                    <strong>Resume downloaded!</strong>
                    <p>Save this version for future reference?</p>
                  </div>
                  <div className="post-download-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          await sendMessage({
                            type: 'SAVE_RESUME_VERSION',
                            payload: {
                              profileId: profile.id,
                              roleProfileId: activeRole?.id,
                              format: lastGeneratedFormat,
                              name: `${activeRole?.targetRole || 'Resume'} - ${new Date().toLocaleDateString()}`,
                              contentSnapshot: JSON.stringify({
                                role: activeRole?.targetRole,
                                summary: activeRole?.tailoredSummary,
                                format: lastGeneratedFormat,
                              }),
                              atsScore: activeRole?.atsScore,
                            },
                          });
                          setShowSaveVersion(false);
                        } catch (err) {
                          console.error('[ResumeGenerator] Failed to save version:', err);
                        }
                      }}
                    >
                      Save Version
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSaveVersion(false)}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'with-jd' && !analysis && !isAnalyzing && (
            <div className="jd-input">
              <div className="section-header-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setMode('select')}>
                  ← Back
                </button>
                <h3>Paste Job Description</h3>
              </div>
              <textarea
                className="jd-textarea"
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={12}
              />
              <p className="jd-hint">
                AI will analyze the job description and find the best matching role profile
              </p>
            </div>
          )}

          {isAnalyzing && (
            <div className="analyzing-state">
              <div className="spinner"></div>
              <h3>Analyzing Job Description</h3>
              <p>Finding the best role match and optimizing keywords...</p>
            </div>
          )}

          {mode === 'with-jd' && analysis && !isGenerating && (
            <div className="analysis-results">
              <div className="section-header-row">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setAnalysis(null);
                    setActiveRole(null);
                    setCurrentScore(0);
                  }}
                >
                  ← Analyze Different JD
                </button>
              </div>

              {/* Score Card with Breakdown */}
              <div className="match-score-card">
                <div className="match-score-header">
                  <h3>Strategic Match Score</h3>
                  {tailoredContent && originalScore > 0 ? (
                    <div className="resume-gen-score-comparison">
                      <span className="resume-gen-original-score">{originalScore}%</span>
                      <span className="resume-gen-score-arrow">&rarr;</span>
                      <span
                        className={`score-value ${currentScore >= 70 ? 'good' : currentScore >= 50 ? 'medium' : 'low'}`}
                      >
                        {currentScore}%
                      </span>
                      <span className="resume-gen-score-improvement">
                        +{currentScore - originalScore}
                      </span>
                    </div>
                  ) : (
                    <span
                      className={`score-value ${currentScore >= 70 ? 'good' : currentScore >= 50 ? 'medium' : 'low'}`}
                    >
                      {currentScore}%
                    </span>
                  )}
                </div>
                <div className="score-bar">
                  <div
                    className={`score-fill ${currentScore >= 70 ? 'good' : currentScore >= 50 ? 'medium' : 'low'}`}
                    style={{ width: `${currentScore}%` }}
                  />
                </div>
                {analysis.scoreBreakdown && (
                  <div className="score-breakdown">
                    <div className="breakdown-item">
                      <span className="breakdown-label">Skills (40%)</span>
                      <span
                        className={`breakdown-value ${analysis.scoreBreakdown.skills >= 70 ? 'good' : analysis.scoreBreakdown.skills >= 50 ? 'medium' : 'low'}`}
                      >
                        {analysis.scoreBreakdown.skills}%
                      </span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Experience (30%)</span>
                      <span
                        className={`breakdown-value ${analysis.scoreBreakdown.experience >= 70 ? 'good' : analysis.scoreBreakdown.experience >= 50 ? 'medium' : 'low'}`}
                      >
                        {analysis.scoreBreakdown.experience}%
                      </span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Seniority (20%)</span>
                      <span
                        className={`breakdown-value ${analysis.scoreBreakdown.seniority >= 70 ? 'good' : analysis.scoreBreakdown.seniority >= 50 ? 'medium' : 'low'}`}
                      >
                        {analysis.scoreBreakdown.seniority}%
                      </span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Culture (10%)</span>
                      <span
                        className={`breakdown-value ${analysis.scoreBreakdown.culture >= 70 ? 'good' : analysis.scoreBreakdown.culture >= 50 ? 'medium' : 'low'}`}
                      >
                        {analysis.scoreBreakdown.culture}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Business Context - The Real Problem */}
              {analysis.jdAnalysis?.businessContext?.coreProblem && (
                <div className="business-context-card">
                  <h4>🎯 What They Really Need</h4>
                  <p className="core-problem">{analysis.jdAnalysis.businessContext.coreProblem}</p>
                  {analysis.jdAnalysis.businessContext.successIn6Months && (
                    <p className="success-metric">
                      <strong>Success in 6 months:</strong>{' '}
                      {analysis.jdAnalysis.businessContext.successIn6Months}
                    </p>
                  )}
                  {analysis.jdAnalysis.hiddenRequirements &&
                    analysis.jdAnalysis.hiddenRequirements.length > 0 && (
                      <div className="hidden-requirements">
                        <strong>🔍 Hidden Requirements:</strong>
                        <ul>
                          {analysis.jdAnalysis.hiddenRequirements.slice(0, 3).map((req) => (
                            <li key={req}>{req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}

              {/* Gap Analysis - Critical vs Addressable */}
              {analysis.gapAnalysis &&
                (analysis.gapAnalysis.critical.length > 0 ||
                  analysis.gapAnalysis.addressable.length > 0) && (
                  <div className="gap-analysis-card">
                    <h4>📊 Gap Analysis</h4>
                    {analysis.gapAnalysis.critical.length > 0 && (
                      <div className="gap-section critical">
                        <span className="gap-label">🚨 Critical Gaps (may reject):</span>
                        <div className="gap-tags">
                          {analysis.gapAnalysis.critical.map((gap) => (
                            <span key={gap} className="gap-tag critical">
                              {gap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysis.gapAnalysis.addressable.length > 0 && (
                      <div className="gap-section addressable">
                        <span className="gap-label">💡 Addressable (can highlight):</span>
                        <div className="gap-tags">
                          {analysis.gapAnalysis.addressable.slice(0, 6).map((gap) => (
                            <span key={gap} className="gap-tag addressable">
                              {gap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysis.gapAnalysis.minor.length > 0 && (
                      <div className="gap-section minor">
                        <span className="gap-label">✓ Minor (nice-to-have):</span>
                        <div className="gap-tags">
                          {analysis.gapAnalysis.minor.slice(0, 4).map((gap) => (
                            <span key={gap} className="gap-tag minor">
                              {gap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {analysis.matchedRole && (
                <div className="matched-role-card">
                  <h4>Best Matching Role</h4>
                  <div className="matched-role">
                    <span className="role-icon">
                      {getRoleIcon(analysis.matchedRole.targetRole)}
                    </span>
                    <div>
                      <strong>{analysis.matchedRole.name}</strong>
                      <span>{analysis.matchedRole.targetRole}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="keywords-section">
                <button
                  className="keywords-collapse-toggle"
                  onClick={() => setShowMatchedKeywords(!showMatchedKeywords)}
                >
                  <h4>✅ Matched Keywords ({analysis.matchedKeywords.length})</h4>
                  <span className={`collapse-arrow ${showMatchedKeywords ? 'open' : ''}`}>▸</span>
                </button>
                {showMatchedKeywords && (
                  <>
                    <p className="keywords-hint">JD frequency → Your profile strength</p>
                    <div className="keywords-list matched">
                      {analysis.matchedKeywords.map((kwObj) => (
                        <span key={kwObj.keyword} className="keyword-tag matched">
                          {kwObj.keyword}
                          <span className="keyword-counts">
                            <span className="jd-count" title="JD frequency">
                              {kwObj.count}
                            </span>
                            <span className="count-arrow">→</span>
                            <span className="profile-count" title="Your profile">
                              {kwObj.profileCount || 1}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {analysis.missingKeywords.length > 0 && (
                <div className="keywords-section">
                  <h4>⚠️ Missing Keywords ({analysis.missingKeywords.length})</h4>
                  <p className="keywords-hint">
                    These keywords appear in the JD but not in your profile
                  </p>
                  <div className="keywords-list missing">
                    {analysis.missingKeywords.map((kwObj) => (
                      <span
                        key={kwObj.keyword}
                        className={`keyword-tag missing ${kwObj.count >= 3 ? 'high-priority' : ''}`}
                      >
                        {kwObj.keyword}
                        <span className="keyword-counts">
                          <span className="jd-count high" title="JD frequency">
                            {kwObj.count}
                          </span>
                        </span>
                      </span>
                    ))}
                  </div>
                  <button
                    className="btn btn-enhance"
                    onClick={enhanceWithAI}
                    disabled={isEnhancing}
                  >
                    {isEnhancing ? (
                      <>
                        <span className="spinner-small"></span>
                        Adding to profile...
                      </>
                    ) : (
                      'Add Missing Keywords to Profile'
                    )}
                  </button>
                  {enhanceSuccess && <div className="enhance-success">{enhanceSuccess}</div>}
                </div>
              )}

              {/* Quick Tailor + Download */}
              {!isGenerating && !isTailoring && !isQuickTailoring && (
                <div className="resume-gen-quick-tailor-bar">
                  <button
                    className="btn btn-primary"
                    onClick={() => quickTailorAndDownload('docx')}
                    disabled={isQuickTailoring}
                  >
                    Quick Tailor + DOCX
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => quickTailorAndDownload('pdf')}
                    disabled={isQuickTailoring}
                  >
                    Quick Tailor + PDF
                  </button>
                </div>
              )}
              {isQuickTailoring && (
                <div className="resume-gen-quick-tailor-progress">
                  {quickTailorStep || 'Processing...'}
                </div>
              )}

              {/* Generate Resume Section */}
              <div className="generate-section">
                <div className="resume-gen-section-header-row">
                  <h4>Generate Resume</h4>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? 'Hide Preview' : 'Preview Resume'}
                  </button>
                </div>
                <p className="generate-hint">
                  AI will tailor your summary and bullet points to match this job description
                </p>
                <div className="page-control">
                  <label>Page count:</label>
                  <select
                    value={targetPages}
                    onChange={(e) => setTargetPages(Number(e.target.value))}
                    className="page-select"
                  >
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                    {yearsOfExp >= 5 && <option value={3}>3 pages</option>}
                  </select>
                  {targetPages !== recommendedPages && (
                    <span className="page-hint">
                      Recommended: {recommendedPages} for {yearsOfExp}yr experience
                    </span>
                  )}
                </div>
                <div className="format-options">
                  <button
                    className="format-card"
                    onClick={() => generateResume('docx')}
                    disabled={isGenerating || isTailoring}
                  >
                    <span className="format-icon">📝</span>
                    <div className="format-info">
                      <strong>DOCX</strong>
                      <span>Best for ATS systems</span>
                    </div>
                    <span className="format-badge recommended">Recommended</span>
                  </button>
                  <button
                    className="format-card"
                    onClick={() => generateResume('pdf')}
                    disabled={isGenerating || isTailoring}
                  >
                    <span className="format-icon">📄</span>
                    <div className="format-info">
                      <strong>PDF</strong>
                      <span>Universal format</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Full Resume Preview */}
              {showPreview && (
                <div className="resume-gen-preview-container">
                  {analysis && !tailoredContent && (
                    <div className="resume-gen-banner-warning">
                      Preview shows base content. Download will include AI-tailored summary and
                      enhanced bullets.
                    </div>
                  )}
                  {tailoredContent && (
                    <div className="resume-gen-banner-success">
                      <span>Showing AI-tailored content (score: {tailoredContent.newScore}%)</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowDiffView(true)}
                      >
                        Review Changes
                      </button>
                    </div>
                  )}
                  {/* Workstream 3 humanization linter banner. The
                      handleOptimizeResumeForJD handler runs detectAITells over
                      the optimized summary AND every enhanced bullet, then
                      returns the result on the response payload. Render the
                      summary as a soft warning so the user can rewrite or
                      regenerate before downloading the final PDF/DOCX. */}
                  {tailoredContent?.aiTells?.hasIssues && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        padding: '10px 14px',
                        marginBottom: 12,
                        background: 'var(--cl-orange-glow)',
                        border: '1px solid var(--cl-orange-glow)',
                        borderRadius: 6,
                        fontSize: 13,
                        color: 'var(--cl-orange)',
                      }}
                    >
                      <strong>Humanization check:</strong> {tailoredContent.aiTells.summary}
                      {tailoredContent.aiTells.bannedTokens.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 12 }}>
                          Banned vocabulary detected:{' '}
                          <em>{tailoredContent.aiTells.bannedTokens.join(', ')}</em>. Edit before
                          downloading or click Tailor again.
                        </div>
                      )}
                    </div>
                  )}
                  {showDiffView && tailoredContent && (
                    <DiffView
                      originalSummary={
                        activeRole?.tailoredSummary || profile.careerContext?.summary || ''
                      }
                      tailoredContent={tailoredContent}
                      experiences={profile.experience || []}
                      originalScore={originalScore}
                      onApply={handleDiffApply}
                      onClose={() => setShowDiffView(false)}
                    />
                  )}
                  {!showDiffView && (
                    <ResumePreview
                      profile={profile}
                      activeRole={activeRole}
                      layout={layout}
                      exclusions={exclusions}
                      tailoredContent={tailoredContent}
                      matchedKeywords={analysis?.matchedKeywords}
                    />
                  )}
                </div>
              )}

              {showSaveVersion && lastGeneratedFormat && (
                <div className="post-download-card">
                  <div className="post-download-icon">✅</div>
                  <div className="post-download-content">
                    <strong>Resume downloaded!</strong>
                    <p>Save this version for future reference?</p>
                  </div>
                  <div className="post-download-actions">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        try {
                          await sendMessage({
                            type: 'SAVE_RESUME_VERSION',
                            payload: {
                              profileId: profile.id,
                              roleProfileId: activeRole?.id,
                              format: lastGeneratedFormat,
                              name: `${activeRole?.targetRole || 'Resume'} - ${new Date().toLocaleDateString()}`,
                              contentSnapshot: JSON.stringify({
                                role: activeRole?.targetRole,
                                summary:
                                  tailoredContent?.optimizedSummary || activeRole?.tailoredSummary,
                                format: lastGeneratedFormat,
                              }),
                              atsScore: analysis?.matchScore || activeRole?.atsScore,
                            },
                          });
                          setShowSaveVersion(false);
                        } catch (err) {
                          console.error('[ResumeGenerator] Failed to save version:', err);
                        }
                      }}
                    >
                      Save Version
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSaveVersion(false)}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {(isGenerating || isTailoring) && (
            <div className="generating-state">
              <div className="spinner"></div>
              <h3>{isTailoring ? 'AI Tailoring Resume' : 'Generating Resume'}</h3>
              <p>{tailoringProgress || 'Creating ATS-optimized resume...'}</p>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            {showSaveVersion ? 'Done' : 'Cancel'}
          </button>
          {mode === 'with-jd' && !analysis && !isAnalyzing && (
            <button
              className="btn btn-primary"
              onClick={analyzeJobDescription}
              disabled={!jobDescription.trim()}
            >
              Analyze JD
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
