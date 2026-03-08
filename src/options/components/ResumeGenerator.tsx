import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type {
  MasterProfile,
  GeneratedProfile,
  EnrichedExperience,
} from '@shared/types/master-profile.types';
import { sendMessage } from '@shared/utils/messaging';
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
import { jsPDF } from 'jspdf';
// Layout engine and utilities extracted to core module
import {
  type ContentExclusions,
  computeYearsFromDates,
  getRecommendedPages,
  computeResumeLayout,
  computeSectionPriorities,
  applyPageSatisfaction,
  formatResumeDate,
  normalizeSkillName,
  shortenUrl,
} from '@core/resume/layout-engine';
import DiffView, { type ApprovedChanges } from './resume/DiffView';

interface ResumeGeneratorProps {
  profile: MasterProfile;
  selectedRole?: GeneratedProfile | null;
  onClose: () => void;
}

type GeneratorMode = 'select' | 'without-jd' | 'with-jd';

interface KeywordWithFrequency {
  keyword: string;
  count: number; // JD frequency
  profileCount?: number; // Profile frequency (how many times in your experience)
}

interface JDAnalysis {
  matchedRole: GeneratedProfile | null;
  matchScore: number;
  matchedKeywords: KeywordWithFrequency[];
  missingKeywords: KeywordWithFrequency[];
  suggestions: string[];
  // Deep analysis data
  jdAnalysis?: {
    businessContext?: {
      coreProblem?: string;
      successIn6Months?: string;
      riskOfBadHire?: string;
      urgencyLevel?: string;
    };
    mustHaves?: Array<{ skill: string; context: string; yearsRequired?: number }>;
    niceToHaves?: Array<{ skill: string; context: string }>;
    hiddenRequirements?: string[];
    senioritySignals?: {
      level?: string;
      indicators?: string[];
      teamContext?: string;
    };
    cultureSignals?: {
      companyStage?: string;
      workStyle?: string;
      values?: string[];
    };
    redFlags?: string[];
  };
  gapAnalysis?: {
    critical: string[];
    addressable: string[];
    minor: string[];
  };
  scoreBreakdown?: {
    skills: number;
    experience: number;
    seniority: number;
    culture: number;
  };
}

// AI-tailored content for resume generation
interface TailoredContent {
  optimizedSummary: string;
  enhancedBullets: Array<{
    expId: string;
    bullets: string[];
  }>;
  addedKeywords: string[];
  newScore: number;
}

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

  // Close modal on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isAnalyzing && !isGenerating && !isTailoring) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isAnalyzing, isGenerating, isTailoring, onClose]);

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

  // Check if a role should be condensed (Early Career: title/company/dates only)
  const isEarlyCareerRole = (expId: string): boolean => {
    const roleLayout = layout.experienceRoles.find((r) => r.expId === expId);
    return roleLayout?.isEarlyCareer ?? false;
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

  // Analyze JD and find best matching role
  // Calculate profile keyword counts - reusable for both AI and local analysis
  const calculateProfileCounts = useCallback((): Record<string, number> => {
    const counts: Record<string, number> = {};

    // Helper to count keyword in text
    const countInText = (text: string, keyword: string): number => {
      if (!text || !keyword || keyword.length < 2) return 0;
      const textLower = text.toLowerCase();
      const keywordLower = keyword.toLowerCase();
      let count = 0;
      let pos = 0;
      while ((pos = textLower.indexOf(keywordLower, pos)) !== -1) {
        count++;
        pos += keywordLower.length;
      }
      return count;
    };

    // Collect all text for searching
    const allText: string[] = [];

    // Count from experience
    if (profile.experience && Array.isArray(profile.experience)) {
      profile.experience.forEach((exp) => {
        // Count from technologiesUsed
        if (exp.technologiesUsed && Array.isArray(exp.technologiesUsed)) {
          exp.technologiesUsed.forEach((tech) => {
            const skillName = typeof tech === 'string' ? tech : tech?.skill || '';
            if (skillName) {
              const normalized = skillName.toLowerCase().trim();
              counts[normalized] = (counts[normalized] || 0) + 1;
            }
          });
        }

        // Collect achievement text and keywords
        if (exp.achievements && Array.isArray(exp.achievements)) {
          exp.achievements.forEach((achievement) => {
            const statement =
              typeof achievement === 'string' ? achievement : achievement?.statement;
            if (statement) allText.push(statement);
            const keywords = typeof achievement === 'string' ? [] : achievement?.keywords || [];
            if (Array.isArray(keywords)) {
              keywords.forEach((kw) => {
                if (kw) {
                  const normalized = kw.toLowerCase().trim();
                  counts[normalized] = (counts[normalized] || 0) + 1;
                }
              });
            }
          });
        }

        // Collect other text
        if (exp.responsibilities && Array.isArray(exp.responsibilities)) {
          exp.responsibilities.forEach((r) => {
            if (r) allText.push(r);
          });
        }
        if (exp.description) allText.push(exp.description);
        if (exp.title) allText.push(exp.title);
      });
    }

    // Count from ALL skill categories
    const skillCategories = [
      profile.skills?.technical,
      profile.skills?.frameworks,
      profile.skills?.tools,
      profile.skills?.programmingLanguages,
    ];

    skillCategories.forEach((category) => {
      if (category && Array.isArray(category)) {
        category.forEach((skill) => {
          if (skill?.name) {
            const normalized = skill.name.toLowerCase().trim();
            const evidenceCount = skill.evidenceFrom?.length || 1;
            counts[normalized] = (counts[normalized] || 0) + evidenceCount;
          }
        });
      }
    });

    // Count from role profiles
    generatedProfiles.forEach((role) => {
      if (role.atsKeywords && Array.isArray(role.atsKeywords)) {
        role.atsKeywords.forEach((kw) => {
          if (kw) {
            const normalized = kw.toLowerCase().trim();
            counts[normalized] = (counts[normalized] || 0) + 1;
          }
        });
      }
      if (role.highlightedSkills && Array.isArray(role.highlightedSkills)) {
        role.highlightedSkills.forEach((skill) => {
          if (skill) {
            const normalized = skill.toLowerCase().trim();
            counts[normalized] = (counts[normalized] || 0) + 1;
          }
        });
      }
    });

    // Count mentions in text for existing skills
    const fullText = allText.join(' ');
    Object.keys(counts).forEach((skillKey) => {
      const textMentions = countInText(fullText, skillKey);
      if (textMentions > 0) {
        counts[skillKey] = counts[skillKey] + textMentions;
      }
    });

    console.debug(
      '[ResumeGenerator] Profile counts calculated:',
      Object.keys(counts).length,
      'entries'
    );
    return counts;
  }, [profile.experience, profile.skills, generatedProfiles]);

  // Add profile counts to matched keywords
  const enrichWithProfileCounts = (
    matchedKeywords: KeywordWithFrequency[],
    profileCounts: Record<string, number>
  ): KeywordWithFrequency[] => {
    return matchedKeywords.map((kwObj) => {
      const jdKeyLower = kwObj.keyword.toLowerCase().trim();

      // Get direct count
      let profileCount = profileCounts[jdKeyLower] || 0;

      // Also check for related keywords
      Object.entries(profileCounts).forEach(([key, count]) => {
        if (key !== jdKeyLower) {
          if (key.includes(jdKeyLower) || jdKeyLower.includes(key)) {
            // Avoid false positives
            const isValidMatch =
              key.startsWith(jdKeyLower + ' ') ||
              key.endsWith(' ' + jdKeyLower) ||
              jdKeyLower.startsWith(key + ' ') ||
              jdKeyLower.endsWith(' ' + key) ||
              (jdKeyLower.length >= 4 && key.length >= 4);
            if (isValidMatch) {
              profileCount += count;
            }
          }
        }
      });

      return { ...kwObj, profileCount: Math.max(profileCount, 1) };
    });
  };

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

  // Local keyword-based analysis (fallback) - REAL SCORES ONLY
  const analyzeLocally = (jd: string): JDAnalysis => {
    const jdLower = jd.toLowerCase();

    // Extract ALL keywords from JD with FREQUENCY count
    const keywordFrequency: Map<string, number> = new Map();

    // Programming Languages
    const languagePatterns = [
      /\bjava\b/gi,
      /\bjavascript\b/gi,
      /\btypescript\b/gi,
      /\bpython\b/gi,
      /\bc#\b/gi,
      /\bc\+\+/gi,
      /\bgolang\b/gi,
      /\bgo\b(?!\s+to)/gi,
      /\brust\b/gi,
      /\bscala\b/gi,
      /\bruby\b/gi,
      /\bphp\b/gi,
      /\bswift\b/gi,
      /\bkotlin\b/gi,
      /\br\b(?=\s+(programming|language|studio))/gi,
      /\bperl\b/gi,
      /\bhtml\b/gi,
      /\bcss\b/gi,
      /\bsass\b/gi,
      /\bless\b/gi,
      /\bshell\b/gi,
      /\bbash\b/gi,
      /\bsql\b/gi,
      /\bplsql\b/gi,
      /\bt-sql\b/gi,
    ];

    // Frameworks & Libraries
    const frameworkPatterns = [
      /\breact\b/gi,
      /\bangular\b/gi,
      /\bvue\.?js?\b/gi,
      /\bsvelte\b/gi,
      /\bnode\.?js?\b/gi,
      /\bexpress\.?js?\b/gi,
      /\bnext\.?js?\b/gi,
      /\bspring\b/gi,
      /\bspring\s*boot\b/gi,
      /\b\.net\b/gi,
      /\basp\.net\b/gi,
      /\bdjango\b/gi,
      /\bflask\b/gi,
      /\bfastapi\b/gi,
      /\brails\b/gi,
      /\blaravel\b/gi,
      /\bjquery\b/gi,
      /\bbootstrap\b/gi,
      /\btailwind\b/gi,
      /\bredux\b/gi,
      /\bmobx\b/gi,
      /\bgraphql\b/gi,
      /\brest\s*api\b/gi,
      /\bweb\s*api\b/gi,
      /\bapi\s*development\b/gi,
      /\bapi\b/gi,
    ];

    // Databases
    const dbPatterns = [
      /\bmongodb\b/gi,
      /\bpostgresql\b/gi,
      /\bpostgres\b/gi,
      /\bmysql\b/gi,
      /\boracle\b/gi,
      /\bsql\s*server\b/gi,
      /\bredis\b/gi,
      /\bcassandra\b/gi,
      /\bdynamodb\b/gi,
      /\bfirebase\b/gi,
      /\belasticsearch\b/gi,
      /\bnosql\b/gi,
      /\bsqlite\b/gi,
      /\bmariadb\b/gi,
      /\bcouchdb\b/gi,
      /\bneo4j\b/gi,
    ];

    // Cloud & DevOps
    const cloudPatterns = [
      /\baws\b/gi,
      /\bazure\b/gi,
      /\bgcp\b/gi,
      /\bgoogle\s*cloud\b/gi,
      /\bdocker\b/gi,
      /\bkubernetes\b/gi,
      /\bk8s\b/gi,
      /\bterraform\b/gi,
      /\bansible\b/gi,
      /\bjenkins\b/gi,
      /\bgithub\s*actions\b/gi,
      /\bgitlab\s*ci\b/gi,
      /\bci\/cd\b/gi,
      /\bdevops\b/gi,
      /\bcloud\b/gi,
      /\bmicroservices\b/gi,
      /\bserverless\b/gi,
      /\blambda\b/gi,
      /\bec2\b/gi,
      /\bs3\b/gi,
      /\blinux\b/gi,
      /\bunix\b/gi,
      /\bgit\b/gi,
      /\bversion\s*control\b/gi,
    ];

    // AI/ML Keywords
    const aiPatterns = [
      /\bgen\s*ai\b/gi,
      /\bgenerative\s*ai\b/gi,
      /\bmachine\s*learning\b/gi,
      /\bml\b/gi,
      /\bdeep\s*learning\b/gi,
      /\bai\b/gi,
      /\bartificial\s*intelligence\b/gi,
      /\bllm\b/gi,
      /\blarge\s*language\s*model/gi,
      /\bnlp\b/gi,
      /\bnatural\s*language/gi,
      /\btensorflow\b/gi,
      /\bpytorch\b/gi,
      /\bkeras\b/gi,
      /\bscikit/gi,
      /\bopenai\b/gi,
      /\bchatgpt\b/gi,
      /\bgpt\b/gi,
      /\bclaude\b/gi,
      /\bcomputer\s*vision\b/gi,
      /\bneural\s*network/gi,
      /\bdata\s*science\b/gi,
    ];

    // Soft Skills & Methodologies
    const softSkillPatterns = [
      /\bproblem[\s-]*solving\b/gi,
      /\bcommunication\s*skills?\b/gi,
      /\bcollaborat(ion|ive)\b/gi,
      /\bteamwork\b/gi,
      /\bteam\s*player\b/gi,
      /\bleadership\b/gi,
      /\banalytical\b/gi,
      /\bcritical\s*thinking\b/gi,
      /\btime\s*management\b/gi,
      /\battention\s*to\s*detail\b/gi,
      /\bagile\b/gi,
      /\bscrum\b/gi,
      /\bkanban\b/gi,
      /\bwaterfall\b/gi,
      /\bsoftware\s*engineering\b/gi,
      /\bsdlc\b/gi,
      /\btdd\b/gi,
      /\btest[\s-]*driven\b/gi,
      /\bunit\s*test/gi,
      /\bintegration\s*test/gi,
      /\bcode\s*review\b/gi,
      /\bpair\s*programming\b/gi,
      /\bdeductive\s*reasoning\b/gi,
    ];

    // Other Tech Terms
    const otherPatterns = [
      /\bfrontend\b/gi,
      /\bfront[\s-]*end\b/gi,
      /\bbackend\b/gi,
      /\bback[\s-]*end\b/gi,
      /\bfull[\s-]*stack\b/gi,
      /\bmobile\b/gi,
      /\bios\b/gi,
      /\bandroid\b/gi,
      /\bresponsive\b/gi,
      /\bux\b/gi,
      /\bui\b/gi,
      /\buser\s*experience\b/gi,
      /\bsecurity\b/gi,
      /\bcybersecurity\b/gi,
      /\boauth\b/gi,
      /\bjwt\b/gi,
      /\bauthentication\b/gi,
      /\bauthorization\b/gi,
      /\bencryption\b/gi,
      /\bscripting\b/gi,
      /\bautomation\b/gi,
      /\bweb[\s-]*based\b/gi,
      /\bobject[\s-]*oriented\b/gi,
      /\boop\b/gi,
      /\bfunctional\s*programming\b/gi,
      /\bdesign\s*patterns\b/gi,
      /\bsolid\b/gi,
      /\bmvc\b/gi,
      /\bmvvm\b/gi,
      /\brestful\b/gi,
      /\bsoap\b/gi,
      /\bjson\b/gi,
      /\bxml\b/gi,
      /\byaml\b/gi,
      /\bwebsocket/gi,
      /\rabbitmq\b/gi,
      /\bkafka\b/gi,
      /\bmessage\s*queue/gi,
    ];

    // Combine all patterns
    const allPatterns = [
      ...languagePatterns,
      ...frameworkPatterns,
      ...dbPatterns,
      ...cloudPatterns,
      ...aiPatterns,
      ...softSkillPatterns,
      ...otherPatterns,
    ];

    allPatterns.forEach((pattern) => {
      const matches = jdLower.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const normalized = match.toLowerCase().trim().replace(/\s+/g, ' ');
          if (normalized && normalized.length > 1) {
            keywordFrequency.set(normalized, (keywordFrequency.get(normalized) || 0) + 1);
          }
        });
      }
    });

    // Convert to array and sort by frequency
    const allJdKeywords: KeywordWithFrequency[] = Array.from(keywordFrequency.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count);

    // Collect all profile keywords for matching
    const profileKeywords: string[] = [];

    generatedProfiles.forEach((role) => {
      if (role.highlightedSkills) profileKeywords.push(...role.highlightedSkills);
      if (role.atsKeywords) profileKeywords.push(...role.atsKeywords);
    });

    if (profile.skills) {
      if (profile.skills.technical)
        profileKeywords.push(...profile.skills.technical.map((s) => s.name));
      if (profile.skills.frameworks)
        profileKeywords.push(...profile.skills.frameworks.map((s) => s.name));
      if (profile.skills.tools) profileKeywords.push(...profile.skills.tools.map((s) => s.name));
      if (profile.skills.programmingLanguages)
        profileKeywords.push(...profile.skills.programmingLanguages.map((s) => s.name));
    }

    // Add experience technologiesUsed to profileKeywords
    profile.experience?.forEach((exp) => {
      if (exp.technologiesUsed && Array.isArray(exp.technologiesUsed)) {
        exp.technologiesUsed.forEach((t) => {
          const skill = typeof t === 'string' ? t : t?.skill || '';
          if (skill) profileKeywords.push(skill);
        });
      }
    });

    // Use shared profile counts calculation
    const profileKeywordCounts = calculateProfileCounts();

    const profileKeywordsLower = profileKeywords.map((k) => k.toLowerCase());

    // Separate matched vs missing keywords with profile counts
    const matchedKeywords: KeywordWithFrequency[] = [];
    const missingKeywords: KeywordWithFrequency[] = [];

    allJdKeywords.forEach((jdKwObj) => {
      const jdKeyLower = jdKwObj.keyword.toLowerCase().trim();

      // Check if profile has this keyword
      const hasKeyword = profileKeywordsLower.some(
        (pKw) => pKw === jdKeyLower || pKw.includes(jdKeyLower) || jdKeyLower.includes(pKw)
      );

      // Get profile count
      let profileCount = profileKeywordCounts[jdKeyLower] || 0;

      // Also check for related keywords
      Object.entries(profileKeywordCounts).forEach(([key, count]) => {
        if (key !== jdKeyLower) {
          if (key.includes(jdKeyLower) || jdKeyLower.includes(key)) {
            const isValidMatch =
              key.startsWith(jdKeyLower + ' ') ||
              key.endsWith(' ' + jdKeyLower) ||
              jdKeyLower.startsWith(key + ' ') ||
              jdKeyLower.endsWith(' ' + key) ||
              (jdKeyLower.length >= 4 && key.length >= 4);
            if (isValidMatch) {
              profileCount += count;
            }
          }
        }
      });

      if (hasKeyword || profileCount > 0) {
        matchedKeywords.push({ ...jdKwObj, profileCount: Math.max(profileCount, 1) });
      } else {
        missingKeywords.push(jdKwObj);
      }
    });

    const totalJdKeywords = allJdKeywords.length;
    const matchScore =
      totalJdKeywords > 0 ? Math.round((matchedKeywords.length / totalJdKeywords) * 100) : 0;

    // Find best matching role
    let bestRole: GeneratedProfile | null = null;
    let bestRoleScore = 0;

    generatedProfiles.forEach((role) => {
      const roleKeywords = [...(role.highlightedSkills || []), ...(role.atsKeywords || [])].map(
        (k) => k.toLowerCase()
      );

      const roleMatches = allJdKeywords.filter((jdKwObj) =>
        roleKeywords.some((rKw) => rKw.includes(jdKwObj.keyword) || jdKwObj.keyword.includes(rKw))
      ).length;

      if (roleMatches > bestRoleScore) {
        bestRoleScore = roleMatches;
        bestRole = role;
      }
    });

    const topMissing = missingKeywords
      .slice(0, 3)
      .map((kw) => `${kw.keyword} (${kw.count})`)
      .join(', ');

    return {
      matchedRole: bestRole,
      matchScore,
      matchedKeywords,
      missingKeywords: missingKeywords.slice(0, 15),
      suggestions: [
        `${matchedKeywords.length}/${totalJdKeywords} JD keywords in your profile`,
        missingKeywords.length > 0 ? `Top missing: ${topMissing}` : 'Great match!',
      ],
    };
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

  // ============================================================================
  // DOCX GENERATION - Matching Reference Format Exactly
  // Using tab stops for left/right alignment and native Word bullet lists
  // ============================================================================
  const generateDocx = async (fileName: string, tailored: TailoredContent | null) => {
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

    // Get bullets for experience — uses layout engine for bullet budgets
    const getBullets = (exp: EnrichedExperience): string[] => {
      const expId = exp.id || exp.company;
      if (isEarlyCareerRole(expId)) return []; // Early career: no bullets
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

    // Build skill categories — pass JD keywords for sorting and AI-added keywords for injection
    const skillCategories = buildSkillCategories(
      skillsData,
      activeRole,
      analysis?.matchedKeywords,
      tailored?.addedKeywords
    );

    // ---- Page Layout Constants (US Letter, tight margins) ----
    // US Letter: 8.5" x 11.0" = 12240 x 15840 twips
    // Margins: 0.5" left/right (720 twips), 0.3" top, 0.25" bottom
    // Content width: 8.5" - 1.0" = 7.5" = 10800 twips
    const MARGIN_TOP = 432;
    const MARGIN_BOTTOM = 360;
    const MARGIN_LEFT = 720;
    const MARGIN_RIGHT = 720;
    const TAB_STOP_RIGHT = convertInchesToTwip(7.5);

    // Font sizes (half-points) — ATS-safe minimums per CLAUDE.md
    const NAME_SIZE = 36; // 18pt (CLAUDE.md: 18-22pt)
    const SUBTITLE_SIZE = 20; // 10pt
    const CONTACT_SIZE = 17; // 8.5pt
    const HEADER_SIZE = 22; // 11pt
    const TITLE_SIZE = 20; // 10pt
    const BODY_SIZE = 20; // 10pt (CLAUDE.md: 10-12pt)
    const SMALL_SIZE = 17; // 8.5pt

    // Section header — 12pt bold, bottom border line, compact spacing
    const sectionHeader = (text: string): Paragraph => {
      return new Paragraph({
        children: [new TextRun({ text, bold: true, size: HEADER_SIZE, font: 'Calibri' })],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 },
        },
        spacing: { before: 100, after: 20, line: 240 },
      });
    };

    // Right-aligned tab stop paragraph (for Title | Date, Company | Location patterns)
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

    // Bullet point paragraph — tight spacing, reduced indent
    const bulletParagraph = (text: string): Paragraph => {
      const cleanText = text.startsWith('\u2022') ? text.substring(1).trim() : text;
      return new Paragraph({
        numbering: { reference: 'bullet-list', level: 0 },
        children: [new TextRun({ text: cleanText, size: BODY_SIZE, font: 'Calibri' })],
        spacing: { before: 0, after: 10, line: 240 },
      });
    };

    const doc = new Document({
      // Override Word defaults: single spacing, no after-paragraph spacing
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
              size: { width: 12240, height: 15840 }, // US Letter
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

            // NAME — 20pt bold centered, ALL CAPS
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

              // Role subtitle — centered
              const roleTitle =
                activeRole?.targetRole || profile.careerContext?.primaryDomain || '';
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

            // CONTACT — 9pt centered, pipe-separated: phone | email | linkedin | github
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

              // Location: City, State
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

            // PROFESSIONAL SUMMARY
            const buildSummary = (): Paragraph[] => [
              sectionHeader('PROFESSIONAL SUMMARY'),
              new Paragraph({
                children: [new TextRun({ text: summaryText, size: BODY_SIZE, font: 'Calibri' })],
                spacing: { after: 0, line: 240 },
              }),
            ];

            // TECHNICAL SKILLS — Inline format: "Category: skill1, skill2, skill3"
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

            // WORK EXPERIENCE — Title first (bold, 11pt) with date, Company (italic, 10pt) below
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

                  // Location: prefer "City, ST" format
                  const location = exp.location || '';

                  // Spacer paragraph between entries (separate from title to avoid breaking tab stops)
                  const spacer: Paragraph[] =
                    idx > 0
                      ? [new Paragraph({ spacing: { before: 40, after: 0, line: 240 } })]
                      : [];

                  // Line 1: Title (bold) ---- Date (right-aligned) — always spacingBefore: 0
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

                  // Line 2: Company — Location (italic, 10pt)
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

                  // Early Career: title/company/dates only, no bullets
                  if (earlyCareer) {
                    return [...spacer, titleLine, companyLine];
                  }

                  const result: Paragraph[] = [
                    ...spacer,
                    titleLine,
                    companyLine,
                    ...bullets.map((b) => bulletParagraph(b)),
                  ];

                  // Environment line — skip for 1-page to save space
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

            // EDUCATION — Degree (bold) — Institution inline, concentration indented
            const buildEducation = (): Paragraph[] => {
              if (education.length === 0) return [];
              return [
                sectionHeader('EDUCATION'),
                ...education.flatMap((edu) => {
                  const eduLayout = layout.educationEntries.find((e) => e.eduId === edu.id);
                  const gradDate = formatResumeDate(edu.endDate);

                  // Avoid double "in": "M.S. in Computer Science in Software Development"
                  const degreeHasIn = edu.degree?.toLowerCase().includes(' in ');
                  const degreeText = degreeHasIn
                    ? edu.degree
                    : `${edu.degree}${edu.field ? ' in ' + edu.field : ''}`;

                  // Line 1: Degree (bold, 10pt) — Institution (9pt)  ---- Date
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

                  // GPA — only if layout says to show
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

                  // Coursework — only if layout says to show
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

                  // Honors — only if layout says to show
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

            // CERTIFICATIONS — inline with date
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

            // PROJECTS
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

                  // Project name (bold, 11pt) ---- Date
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
  };

  // Build skill categories — with optional JD-aware ordering and keyword injection
  const buildSkillCategories = (
    skillsData: typeof profile.skills | undefined,
    role: GeneratedProfile | null,
    matchedKeywords?: KeywordWithFrequency[],
    addedKeywords?: string[]
  ): Array<{ category: string; skills: string[] }> => {
    const allSkills: Array<{ name: string; category?: string }> = [];

    if (skillsData?.programmingLanguages?.length) {
      skillsData.programmingLanguages.forEach((s) =>
        allSkills.push({ name: s.name, category: 'Programming Languages' })
      );
    }
    if (skillsData?.frameworks?.length) {
      skillsData.frameworks.forEach((s) =>
        allSkills.push({ name: s.name, category: s.category || 'Frameworks' })
      );
    }
    if (skillsData?.tools?.length) {
      skillsData.tools.forEach((s) =>
        allSkills.push({ name: s.name, category: s.category || 'Tools' })
      );
    }
    if (skillsData?.technical?.length) {
      skillsData.technical.forEach((s) =>
        allSkills.push({ name: s.name, category: s.category || 'Technical' })
      );
    }

    if (profile.experience?.length) {
      profile.experience.forEach((exp) => {
        exp.technologiesUsed?.forEach((t) => {
          if (!allSkills.some((s) => s.name.toLowerCase() === t.skill.toLowerCase())) {
            allSkills.push({ name: t.skill });
          }
        });
      });
    }

    if (role?.highlightedSkills?.length) {
      role.highlightedSkills.forEach((skill) => {
        if (!allSkills.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
          allSkills.push({ name: skill });
        }
      });
    }
    if (role?.atsKeywords?.length) {
      role.atsKeywords.forEach((skill) => {
        if (!allSkills.some((s) => s.name.toLowerCase() === skill.toLowerCase())) {
          allSkills.push({ name: skill });
        }
      });
    }

    const categorize = (name: string, existing?: string): string => {
      const n = name.toLowerCase().trim();

      // ---- SKIP CHECK FIRST — before any category matching ----
      // Exact match: generic technical terms that aren't real skills
      const exactSkip = [
        'development',
        'database concepts',
        'api design and development',
        'api design',
        'web development',
        'agile methodologies',
        'software engineering',
        'backend development',
        'frontend development',
        'full-stack',
        'full stack',
        'object-oriented',
        'test-driven',
        'data processing',
        'data processing and optimization',
        'cloud computing',
        'sdlc',
        'oop',
      ];
      if (exactSkip.includes(n)) return '__SKIP__';

      // Substring match: soft skills and non-technical descriptors
      const softSkip = [
        'communication',
        'leadership',
        'teamwork',
        'team collaboration',
        'problem solving',
        'analytical',
        'critical thinking',
        'time management',
        'collaboration',
        'interpersonal',
        'decision making',
        'adaptability',
        'attention to detail',
        'organizational',
        'mentoring',
        'cross-functional',
        'stakeholder',
        'project management',
        'technical leadership',
      ];
      if (softSkip.some((s) => n.includes(s))) return '__SKIP__';

      // Programming Languages
      if (
        /^(java|javascript|typescript|python|c#|c\+\+|golang|go|rust|scala|ruby|php|swift|kotlin|sql|r|matlab|perl|bash|shell)$/i.test(
          name
        )
      )
        return 'Programming Languages';

      // Web Frameworks
      if (
        [
          'spring',
          'node',
          'express',
          'fastapi',
          'flask',
          'django',
          'rails',
          '.net',
          'nestjs',
          'asp.net',
        ].some((f) => n.includes(f))
      )
        return 'Web Frameworks';

      // Frontend Technologies
      if (
        [
          'react',
          'angular',
          'vue',
          'html',
          'css',
          'bootstrap',
          'tailwind',
          'redux',
          'next',
          'sass',
          'webpack',
        ].some((f) => n.includes(f))
      )
        return 'Frontend Technologies';

      // Databases
      if (
        [
          'mongodb',
          'postgresql',
          'mysql',
          'redis',
          'firebase',
          'oracle',
          'cassandra',
          'dynamodb',
          'elasticsearch',
          'sql server',
          'sqlite',
          'mariadb',
          'snowflake',
          'bigquery',
        ].some((d) => n.includes(d))
      )
        return 'Databases';

      // Cloud & DevOps
      if (
        [
          'aws',
          'azure',
          'gcp',
          'docker',
          'kubernetes',
          'terraform',
          'jenkins',
          'ci/cd',
          'devops',
          'lambda',
          'ec2',
          's3',
          'cloudformation',
          'ansible',
          'nginx',
          'linux',
          'unix',
          'grafana',
          'loki',
          'prometheus',
          'datadog',
          'new relic',
          'elk',
          'monitoring',
        ].some((c) => n.includes(c))
      )
        return 'Cloud & DevOps';

      // Testing & Automation
      if (
        [
          'junit',
          'mockito',
          'cypress',
          'jest',
          'pytest',
          'selenium',
          'postman',
          'testing',
          'qa',
          'automation',
        ].some((t) => n.includes(t))
      )
        return 'Testing & QA';

      // AI/ML Technologies
      if (
        [
          'tensorflow',
          'pytorch',
          'keras',
          'scikit',
          'mlflow',
          'openai',
          'llm',
          'machine learning',
          'deep learning',
          'nlp',
          'neural',
          'opencv',
          'computer vision',
          'hugging',
          'ai/ml',
          'langchain',
        ].some((m) => n.includes(m))
      )
        return 'AI/ML Technologies';

      // Data & Analytics
      if (
        [
          'pandas',
          'numpy',
          'tableau',
          'powerbi',
          'power bi',
          'excel',
          'looker',
          'data analysis',
          'data visualization',
          'analytics',
          'statistical',
          'statistics',
          'big data',
          'spark',
          'hadoop',
          'etl',
          'data warehouse',
          'business intelligence',
          'bi ',
        ].some((d) => n.includes(d))
      )
        return 'Data & Analytics';

      // Version Control & PM
      if (
        [
          'git',
          'github',
          'gitlab',
          'bitbucket',
          'jira',
          'confluence',
          'agile',
          'scrum',
          'kanban',
          'trello',
          'asana',
        ].some((v) => n.includes(v))
      )
        return 'Version Control & PM';

      // APIs & Messaging
      if (
        ['rest', 'graphql', 'grpc', 'api', 'kafka', 'rabbitmq', 'soap', 'web services'].some((a) =>
          n.includes(a)
        )
      )
        return 'APIs & Messaging';

      // Architecture & Design
      if (
        [
          'microservices',
          'architecture',
          'system design',
          'design patterns',
          'solid',
          'distributed systems',
          'event-driven',
          'event driven',
          'cqrs',
          'event sourcing',
          'domain-driven',
          'ddd',
          'scalability',
          'high availability',
          'load balancing',
        ].some((a) => n.includes(a))
      )
        return 'Architecture & Design';

      // Security
      if (
        [
          'oauth',
          'jwt',
          'sso',
          'encryption',
          'owasp',
          'security',
          'authentication',
          'authorization',
          'rbac',
          'zero trust',
          'penetration',
          'vulnerability',
          'ssl',
          'tls',
          'saml',
          'ldap',
          'iam',
          'identity',
        ].some((s) => n.includes(s))
      )
        return 'Security';

      // Office & Productivity
      if (
        [
          'word',
          'powerpoint',
          'outlook',
          'microsoft office',
          'google sheets',
          'sharepoint',
          'teams',
          'slack',
          'notion',
        ].some((o) => n.includes(o))
      )
        return 'Office & Productivity';

      // Design & Diagramming Tools
      if (
        [
          'figma',
          'sketch',
          'adobe',
          'photoshop',
          'illustrator',
          'draw.io',
          'visio',
          'lucidchart',
          'miro',
          'canva',
          'xd',
        ].some((d) => n.includes(d))
      )
        return 'Design Tools';

      // Clean up malformed categories from existing
      if (existing) {
        const cleanCat = existing.replace(/^(ai|other|database|skills?):\s*/gi, '').trim();
        if (cleanCat && cleanCat.length > 2 && !cleanCat.includes(':')) {
          return cleanCat.charAt(0).toUpperCase() + cleanCat.slice(1);
        }
      }

      return 'Technical Skills';
    };

    const categoryMap = new Map<string, Set<string>>();
    // Track lowercase versions to prevent duplicates like "API design" / "API Design"
    const seenLower = new Map<string, string>(); // lowercase → normalized display name
    allSkills.forEach((skill) => {
      const cat = categorize(skill.name, skill.category);
      if (cat === '__SKIP__') return;
      const normalized = normalizeSkillName(skill.name);
      // Split compound skills (e.g., "Kafka, RabbitMQ" from "kafka or rabbitmq")
      const parts = normalized.includes(', ') ? normalized.split(', ') : [normalized];
      parts.forEach((part) => {
        const lower = part.toLowerCase().trim();
        if (!lower || seenLower.has(lower)) return;
        seenLower.set(lower, part);
        if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
        categoryMap.get(cat)!.add(part);
      });
    });

    const order = [
      'Programming Languages',
      'Web Frameworks',
      'Frontend Technologies',
      'Databases',
      'Cloud & DevOps',
      'APIs & Messaging',
      'Architecture & Design',
      'Security',
      'Testing & QA',
      'AI/ML Technologies',
      'Data & Analytics',
      'Version Control & PM',
      'Design Tools',
      'Office & Productivity',
      'Technical Skills',
    ];
    // Inject addedKeywords from AI tailoring (keywords found in JD, not yet in profile)
    if (addedKeywords?.length) {
      addedKeywords.forEach((kw) => {
        const normalized = normalizeSkillName(kw);
        const lower = normalized.toLowerCase().trim();
        if (!lower || seenLower.has(lower)) return;
        const cat = categorize(kw);
        if (cat === '__SKIP__') return;
        seenLower.set(lower, normalized);
        if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
        categoryMap.get(cat)!.add(normalized);
      });
    }

    // Acronym expansion for ATS — expand lone acronyms to "Full Form (ACRONYM)"
    const acronymExpansions: Record<string, string> = {
      AWS: 'Amazon Web Services (AWS)',
      GCP: 'Google Cloud Platform (GCP)',
      ML: 'Machine Learning (ML)',
      NLP: 'Natural Language Processing (NLP)',
      AI: 'Artificial Intelligence (AI)',
      ETL: 'Extract, Transform, Load (ETL)',
    };
    const expandedLower = new Set<string>();
    categoryMap.forEach((skills) => {
      const expanded: string[] = [];
      const toRemove: string[] = [];
      skills.forEach((skill) => {
        const upper = skill.toUpperCase();
        if (acronymExpansions[upper] && !expandedLower.has(upper.toLowerCase())) {
          // Check if full form already exists in any category
          const fullFormLower = acronymExpansions[upper].toLowerCase();
          const alreadyHasFullForm = Array.from(seenLower.keys()).some(
            (k) => fullFormLower.includes(k) && k.length > upper.length
          );
          if (!alreadyHasFullForm) {
            toRemove.push(skill);
            expanded.push(acronymExpansions[upper]);
            expandedLower.add(upper.toLowerCase());
          }
        }
      });
      toRemove.forEach((s) => skills.delete(s));
      expanded.forEach((s) => skills.add(s));
    });

    // Build JD-matched keyword set for sorting
    const jdMatchedLower = new Set<string>();
    if (matchedKeywords?.length) {
      matchedKeywords.forEach((kw) => jdMatchedLower.add(kw.keyword.toLowerCase().trim()));
    }

    const result: Array<{ category: string; skills: string[] }> = [];
    order.forEach((cat) => {
      const skills = categoryMap.get(cat);
      if (skills && skills.size > 0) {
        const arr = Array.from(skills);
        // Sort JD-matched skills to front within category
        if (jdMatchedLower.size > 0) {
          arr.sort((a, b) => {
            const aMatch = jdMatchedLower.has(a.toLowerCase()) ? 1 : 0;
            const bMatch = jdMatchedLower.has(b.toLowerCase()) ? 1 : 0;
            return bMatch - aMatch;
          });
        }
        result.push({ category: cat, skills: arr });
      }
    });
    // Add any remaining categories not in the order
    categoryMap.forEach((skills, cat) => {
      if (!order.includes(cat) && skills.size > 0 && cat !== '__SKIP__') {
        const arr = Array.from(skills);
        if (jdMatchedLower.size > 0) {
          arr.sort((a, b) => {
            const aMatch = jdMatchedLower.has(a.toLowerCase()) ? 1 : 0;
            const bMatch = jdMatchedLower.has(b.toLowerCase()) ? 1 : 0;
            return bMatch - aMatch;
          });
        }
        result.push({ category: cat, skills: arr });
      }
    });

    // Reorder categories: those with more JD matches come first
    if (jdMatchedLower.size > 0) {
      result.sort((a, b) => {
        const aMatches = a.skills.filter((s) => jdMatchedLower.has(s.toLowerCase())).length;
        const bMatches = b.skills.filter((s) => jdMatchedLower.has(s.toLowerCase())).length;
        if (bMatches !== aMatches) return bMatches - aMatches;
        return 0; // Keep original order if tie
      });
    }

    return result;
  };

  // Download helpers
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, filename);
  };

  // PDF Generation — section-builder pattern driven by layout engine
  const generatePdf = (fileName: string, tailored: TailoredContent | null) => {
    try {
      // US Letter: 215.9mm x 279.4mm
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const personal = profile.personal;
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

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15.875; // 0.625" in mm (matches DOCX)
      const marginTop = 12.7; // 0.5" top
      const contentWidth = pageWidth - margin * 2;
      let y = marginTop + 4;

      // Body font size used throughout — ATS-safe minimums per CLAUDE.md
      const bodyFs = 10;
      const smallFs = 9;
      // Dynamic line height: matches jsPDF rendering (fontSize * lineHeightFactor * mm/pt)
      const getLineH = () => pdf.getFontSize() * 1.15 * (25.4 / 72);

      const checkPage = (need: number) => {
        if (y + need > pageHeight - 10) {
          // tight bottom margin
          pdf.addPage();
          y = marginTop + 2;
        }
      };

      // PDF section header helper — compact
      const pdfSectionHeader = (text: string) => {
        checkPage(10);
        y += 2.5;
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

        // Role subtitle
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
          analysis?.matchedKeywords,
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
          (exp) => !exclusions.excludedExperiences.has(exp.id || exp.company)
        );
        if (filtered.length === 0) return;
        pdfSectionHeader('WORK EXPERIENCE');
        pdf.setFontSize(bodyFs);

        filtered.forEach((exp, idx) => {
          const expId = exp.id || exp.company;
          const earlyCareer = isEarlyCareerRole(expId);
          const startDate = formatResumeDate(exp.startDate);
          const endDate = exp.isCurrent ? 'Present' : formatResumeDate(exp.endDate);

          if (idx > 0) y += 1.5;
          checkPage(earlyCareer ? 6 : 12);

          // Title (bold italic) | Dates — Harvard/consulting standard
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bolditalic');
          pdf.text(exp.title || 'Position', margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(bodyFs);
          pdf.text(`${startDate} \u2013 ${endDate}`, pageWidth - margin, y, { align: 'right' });
          y += 3.5;

          // Company — Location (italic)
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
          const projTitle = proj.url
            ? `${proj.name || 'Project'} | GitHub`
            : proj.name || 'Project';
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

      for (const section of layout.sections) {
        if (!section.visible) continue;
        const renderer = pdfRenderers[section.type];
        if (renderer) renderer();
      }

      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('[ResumeGenerator] PDF generation failed:', error);
      setError('Failed to generate PDF. Please try again.');
    }
  };

  // Format resume for text/json
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

  // ============================================================================
  // RESUME PREVIEW — Full-fidelity HTML rendering matching DOCX layout
  // ============================================================================
  const renderResumePreview = () => {
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
      analysis?.matchedKeywords,
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
                  {/* Title (bold, 11pt) ---- Date */}
                  <div style={{ ...alignedRowStyle }}>
                    <span style={{ fontWeight: 'bold', fontStyle: 'italic', fontSize: '10pt' }}>
                      {exp.title}
                    </span>
                    <span>{`${startDate} \u2013 ${endDate}`}</span>
                  </div>
                  {/* Company — Location (italic) */}
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
  };

  return (
    <div className="modal-overlay" onClick={() => !isAnalyzing && !isGenerating && onClose()}>
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
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <h4 style={{ margin: 0 }}>Download Resume</h4>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowPreview(!showPreview)}
                    style={{ fontSize: '13px' }}
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
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '12px',
                        background: '#141820',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        fontSize: '0.8rem',
                      }}
                    >
                      {/* Section Toggles */}
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
                          Sections
                        </div>
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
                <div
                  style={{
                    marginTop: '16px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    background: '#0e1219',
                    padding: '16px',
                  }}
                >
                  {analysis && !tailoredContent && (
                    <div
                      style={{
                        background: 'rgba(232,168,50,0.1)',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#e8a832',
                      }}
                    >
                      Preview shows base content. Download will include AI-tailored summary and
                      enhanced bullets.
                    </div>
                  )}
                  {tailoredContent && (
                    <div
                      style={{
                        background: 'rgba(52,211,153,0.1)',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Showing AI-tailored content (score: {tailoredContent.newScore}%)</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowDiffView(true)}
                        style={{ marginLeft: '12px' }}
                      >
                        Review Changes
                      </button>
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
                  {!showDiffView && renderResumePreview()}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          color: '#94a3b8',
                          fontSize: '0.9rem',
                          textDecoration: 'line-through',
                        }}
                      >
                        {originalScore}%
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '1rem' }}>→</span>
                      <span
                        className={`score-value ${currentScore >= 70 ? 'good' : currentScore >= 50 ? 'medium' : 'low'}`}
                      >
                        {currentScore}%
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: '#22c55e',
                          background: 'rgba(52,211,153,0.12)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
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
                          {analysis.jdAnalysis.hiddenRequirements.slice(0, 3).map((req, i) => (
                            <li key={i}>{req}</li>
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
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginBottom: '12px',
                    padding: '12px',
                    background: 'rgba(232,168,50,0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(232,168,50,0.15)',
                  }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={() => quickTailorAndDownload('docx')}
                    disabled={isQuickTailoring}
                    style={{ flex: 1 }}
                  >
                    Quick Tailor + DOCX
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => quickTailorAndDownload('pdf')}
                    disabled={isQuickTailoring}
                    style={{ flex: 1 }}
                  >
                    Quick Tailor + PDF
                  </button>
                </div>
              )}
              {isQuickTailoring && (
                <div
                  style={{
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'rgba(232,168,50,0.06)',
                    borderRadius: '8px',
                    border: '1px solid rgba(232,168,50,0.15)',
                    textAlign: 'center',
                    color: '#e8a832',
                    fontSize: '13px',
                  }}
                >
                  {quickTailorStep || 'Processing...'}
                </div>
              )}

              {/* Generate Resume Section */}
              <div className="generate-section">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <h4 style={{ margin: 0 }}>Generate Resume</h4>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowPreview(!showPreview)}
                    style={{ fontSize: '13px' }}
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
                <div
                  style={{
                    marginTop: '16px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    background: '#0e1219',
                    padding: '16px',
                  }}
                >
                  {analysis && !tailoredContent && (
                    <div
                      style={{
                        background: 'rgba(232,168,50,0.1)',
                        border: '1px solid #f59e0b',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#e8a832',
                      }}
                    >
                      Preview shows base content. Download will include AI-tailored summary and
                      enhanced bullets.
                    </div>
                  )}
                  {tailoredContent && (
                    <div
                      style={{
                        background: 'rgba(52,211,153,0.1)',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Showing AI-tailored content (score: {tailoredContent.newScore}%)</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowDiffView(true)}
                        style={{ marginLeft: '12px' }}
                      >
                        Review Changes
                      </button>
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
                  {!showDiffView && renderResumePreview()}
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
