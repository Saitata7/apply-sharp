import { useState } from 'react';
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
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
  ExternalHyperlink,
  HeightRule,
  TabStopType,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import { jsPDF } from 'jspdf';

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

  // Page count control based on years of experience
  const yearsOfExp = profile.careerContext?.yearsOfExperience || 0;
  const recommendedPages = yearsOfExp <= 5 ? 1 : yearsOfExp <= 10 ? 2 : 2;
  const [targetPages, setTargetPages] = useState<number>(recommendedPages);

  // Max bullets per role based on target page count and seniority
  const getMaxBulletsForRole = (roleIndex: number, totalRoles: number): number => {
    if (targetPages === 1) {
      // 1-page resume: tight bullet budgets
      if (roleIndex === 0) return 5; // Most recent role: up to 5
      if (roleIndex === 1) return 3; // Second role: up to 3
      return 2; // Older roles: 2
    }
    // 2-page resume: more generous
    if (roleIndex === 0) return 8;
    if (roleIndex === 1) return 6;
    if (roleIndex < totalRoles - 1) return 5;
    return 3; // Oldest role
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
  const calculateProfileCounts = (): Record<string, number> => {
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

    console.log('[ResumeGenerator] Profile counts calculated:', counts);
    return counts;
  };

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
          setTimeout(() => analyzeJobDescription(), 500);
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
      const kwLower = kw.toLowerCase();
      return (
        /^[a-z0-9#+.\-/\s]+$/i.test(kw) &&
        kw.length >= 2 &&
        kw.length <= 30 &&
        !['the', 'and', 'or', 'for', 'with', 'you', 'will', 'can', 'are'].includes(kwLower)
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

  // Calculate bullet count based on tenure duration
  const getBulletCountForDuration = (
    startDate: string | undefined,
    endDate: string | undefined,
    isCurrent: boolean
  ): number => {
    if (!startDate) return 4; // Default

    const start = new Date(startDate);
    const end = isCurrent ? new Date() : endDate ? new Date(endDate) : new Date();
    const months = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))
    );

    // Duration-based bullet count rules
    if (months <= 6) return 4; // 6 months: 4 bullets
    if (months <= 12) return 7; // 1 year: 7-8 bullets
    if (months <= 24) return 11; // 2 years: 11-12 bullets
    if (months <= 36) return 15; // 3 years: 15 bullets
    return 16; // 4+ years: 15-16 bullets
  };

  // Tailor resume content using AI
  const tailorResumeWithAI = async (): Promise<TailoredContent | null> => {
    if (!analysis || !activeRole || !jobDescription.trim()) return null;

    setIsTailoring(true);
    setTailoringProgress('Analyzing job requirements...');

    try {
      const keyBulletPoints = (profile.experience || []).map((exp) => {
        const bulletCount = getBulletCountForDuration(
          exp.startDate,
          exp.endDate,
          exp.isCurrent || false
        );

        // Collect ALL available bullets from achievements and responsibilities
        const allBullets = [
          ...(exp.achievements || []).map((a) => (typeof a === 'string' ? a : a.statement)),
          ...(exp.responsibilities || []),
        ];

        return {
          expId: exp.id || exp.company,
          bullets: allBullets.slice(0, Math.max(bulletCount, allBullets.length)), // Take at least bulletCount, or all available
          expectedCount: bulletCount, // Tell AI how many we want
          durationMonths: exp.startDate
            ? Math.round(
                ((exp.isCurrent ? new Date() : new Date(exp.endDate || Date.now())).getTime() -
                  new Date(exp.startDate).getTime()) /
                  (1000 * 60 * 60 * 24 * 30)
              )
            : 12,
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
      const fileName = `${profile.personal?.fullName || 'Resume'}_${activeRole.targetRole.replace(/\s+/g, '_')}`;

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

    const summaryText =
      tailored?.optimizedSummary ||
      activeRole?.tailoredSummary ||
      profile.careerContext?.summary ||
      '';

    const enhancedBulletsMap = new Map<string, string[]>();
    if (tailored?.enhancedBullets) {
      tailored.enhancedBullets.forEach((eb) => enhancedBulletsMap.set(eb.expId, eb.bullets));
    }

    // Format date from "2021-01" to "January 2021"
    const formatDate = (dateStr: string | undefined): string => {
      if (!dateStr) return '';
      const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      if (dateStr.toLowerCase() === 'current' || dateStr.toLowerCase() === 'present')
        return 'Present';
      const match = dateStr.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
      if (match) {
        const monthIndex = parseInt(match[2], 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) return `${months[monthIndex]} ${match[1]}`;
      }
      return dateStr;
    };

    // Get bullets for experience
    const getBullets = (exp: EnrichedExperience, expIndex?: number): string[] => {
      const key = exp.id || exp.company;
      const enhanced = enhancedBulletsMap.get(key);
      const allBullets =
        enhanced && enhanced.length > 0
          ? enhanced
          : [
              ...(exp.achievements || []).map((a) => (typeof a === 'string' ? a : a.statement)),
              ...(exp.responsibilities || []),
            ];
      // Apply page-count-aware bullet limiting
      const maxBullets = getMaxBulletsForRole(expIndex ?? 0, experience.length);
      return allBullets.slice(0, maxBullets);
    };

    // Build environment line
    const getEnv = (exp: EnrichedExperience): string => {
      if (exp.technologiesUsed?.length)
        return [...new Set(exp.technologiesUsed.map((t) => t.skill))].join(', ');
      return '';
    };

    // Build skill categories
    const skillCategories = buildSkillCategories(skillsData, activeRole);

    // Black border for skills table (matching reference: w:sz="8")
    const blackBorder = { style: BorderStyle.SINGLE, size: 8, color: '000000' };

    // Section header with bottom border (underline) — ATS-safe: 12pt bold Calibri
    const sectionHeader = (text: string): Paragraph => {
      return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 24, font: 'Calibri' })],
        border: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        spacing: { before: 240, after: 100 },
      });
    };

    // Create aligned paragraph with tab stop (left text + tab + right text)
    // ATS-safe: 10pt Calibri, tab stop at content width for right-aligned dates
    const createAlignedParagraph = (
      leftText: string,
      rightText: string,
      leftBold = false
    ): Paragraph => {
      // Page width: 12240 twips (8.5"), margins: 1080 twips (0.75") each side
      // Content width: 10080 twips (7.0")
      // Right tab stop at right margin edge: 8.5" - 0.75" = 7.75" → use 7.0" for content
      if (!leftText && !rightText) {
        return new Paragraph({ spacing: { after: 40 } });
      }

      return new Paragraph({
        alignment: AlignmentType.LEFT,
        indent: { left: 0, right: 0, firstLine: 0 },
        tabStops: [
          {
            type: TabStopType.RIGHT,
            position: convertInchesToTwip(7.0),
          },
        ],
        children: [
          new TextRun({ text: (leftText || '').trim(), bold: leftBold, size: 20, font: 'Calibri' }),
          new TextRun({ text: '\t', size: 20, font: 'Calibri' }),
          new TextRun({ text: (rightText || '').trim(), size: 20, font: 'Calibri' }),
        ],
      });
    };

    // Create bullet point paragraph (native Word list style)
    const createBulletParagraph = (text: string): Paragraph => {
      // Remove leading bullet if present
      const cleanText = text.startsWith('•') ? text.substring(1).trim() : text;
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun({ text: cleanText, size: 20, font: 'Calibri' })],
        spacing: { after: 40 },
      });
    };

    const doc = new Document({
      numbering: {
        config: [
          {
            reference: 'bullet-list',
            levels: [
              {
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: {
                  paragraph: {
                    indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
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
            // ATS-safe margins: 0.75" all sides (1080 twips)
            page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
          },
          children: [
            // NAME - Centered, ATS-safe: 18pt bold Calibri
            new Paragraph({
              children: [
                new TextRun({
                  text: personal?.fullName?.toUpperCase() || 'NAME',
                  bold: true,
                  size: 36,
                  font: 'Calibri',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
            }),

            // CONTACT - Centered
            (() => {
              const contactChildren: (TextRun | ExternalHyperlink)[] = [];

              if (personal?.email) {
                contactChildren.push(
                  new ExternalHyperlink({
                    children: [
                      new TextRun({
                        text: personal.email,
                        size: 20,
                        font: 'Calibri',
                        color: '0563C1',
                        underline: { type: 'single' },
                      }),
                    ],
                    link: `mailto:${personal.email}`,
                  })
                );
              }

              if (personal?.phone) {
                if (contactChildren.length > 0) {
                  contactChildren.push(new TextRun({ text: ' | ', size: 20, font: 'Calibri' }));
                }
                contactChildren.push(
                  new TextRun({ text: personal.phone, size: 20, font: 'Calibri' })
                );
              }

              if (personal?.linkedInUrl) {
                if (contactChildren.length > 0) {
                  contactChildren.push(new TextRun({ text: ' | ', size: 20, font: 'Calibri' }));
                }
                contactChildren.push(
                  new ExternalHyperlink({
                    children: [
                      new TextRun({
                        text: 'LinkedIn',
                        size: 20,
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
                if (contactChildren.length > 0) {
                  contactChildren.push(new TextRun({ text: ' | ', size: 20, font: 'Calibri' }));
                }
                contactChildren.push(
                  new ExternalHyperlink({
                    children: [
                      new TextRun({
                        text: 'GitHub',
                        size: 20,
                        font: 'Calibri',
                        color: '0563C1',
                        underline: { type: 'single' },
                      }),
                    ],
                    link: personal.githubUrl,
                  })
                );
              }

              // Simple paragraph with center alignment
              return new Paragraph({
                children: contactChildren,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              });
            })(),

            // SUMMARY
            sectionHeader('SUMMARY'),
            new Paragraph({
              children: [new TextRun({ text: summaryText, size: 20, font: 'Calibri' })],
              spacing: { after: 200 },
            }),

            // TECHNICAL SKILLS - Table with fixed column widths (content width: 10080 twips at 0.75" margins)
            sectionHeader('TECHNICAL SKILLS'),
            new Table({
              width: { size: 10080, type: WidthType.DXA },
              columnWidths: [1926, 8154],
              rows: skillCategories.map(
                (cat) =>
                  new TableRow({
                    height: { value: 300, rule: HeightRule.ATLEAST },
                    children: [
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: cat.category,
                                bold: true,
                                size: 20,
                                font: 'Calibri',
                              }),
                            ],
                          }),
                        ],
                        width: { size: 1926, type: WidthType.DXA },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 80, bottom: 80, left: 80, right: 80 },
                        borders: {
                          top: blackBorder,
                          bottom: blackBorder,
                          left: blackBorder,
                          right: blackBorder,
                        },
                      }),
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: cat.skills.join(', '),
                                size: 20,
                                font: 'Calibri',
                              }),
                            ],
                          }),
                        ],
                        width: { size: 8874, type: WidthType.DXA },
                        verticalAlign: VerticalAlign.CENTER,
                        margins: { top: 80, bottom: 80, left: 80, right: 80 },
                        borders: {
                          top: blackBorder,
                          bottom: blackBorder,
                          left: blackBorder,
                          right: blackBorder,
                        },
                      }),
                    ],
                  })
              ),
            }),
            new Paragraph({ spacing: { after: 100 } }),

            // WORK EXPERIENCE
            sectionHeader('WORK EXPERIENCE'),
            ...experience.flatMap((exp, idx) => {
              const bullets = getBullets(exp, idx);
              const env = getEnv(exp);
              const startDate = formatDate(exp.startDate);
              const endDate = exp.isCurrent ? 'Present' : formatDate(exp.endDate);
              const isLast = idx === experience.length - 1;

              return [
                // Company | Location (using tab stop)
                createAlignedParagraph(exp.company, exp.location || '', true),
                // Title | Dates (using tab stop)
                createAlignedParagraph(exp.title, `${startDate} – ${endDate}`, false),
                // Bullets (native Word list)
                ...bullets.map((b) => createBulletParagraph(b)),
                // Environment
                ...(env
                  ? [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: 'Environment: ',
                            bold: true,
                            size: 20,
                            font: 'Calibri',
                          }),
                          new TextRun({ text: env, size: 20, font: 'Calibri' }),
                        ],
                        spacing: { after: isLast ? 100 : 200 },
                      }),
                    ]
                  : [new Paragraph({ spacing: { after: isLast ? 100 : 160 } })]),
              ];
            }),

            // EDUCATION
            sectionHeader('EDUCATION'),
            ...education.flatMap((edu) => {
              const locMatch = edu.institution.match(/,\s*([A-Za-z\s]+,\s*[A-Z]{2})$/);
              const loc = locMatch ? locMatch[1].trim() : '';
              const inst = loc
                ? edu.institution.replace(/,\s*[A-Za-z\s]+,\s*[A-Z]{2}$/, '').trim()
                : edu.institution;
              return [
                createAlignedParagraph(inst, loc, true),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${edu.degree}${edu.field ? ' in ' + edu.field : ''}`,
                      size: 20,
                      font: 'Calibri',
                    }),
                    ...(edu.gpa
                      ? [new TextRun({ text: ` | GPA: ${edu.gpa}`, size: 20, font: 'Calibri' })]
                      : []),
                  ],
                  spacing: { after: 100 },
                }),
              ];
            }),

            // CERTIFICATIONS
            ...(certifications.length > 0
              ? [
                  sectionHeader('CERTIFICATIONS'),
                  ...certifications.map((cert) => {
                    let dateStr = '';
                    if (cert.dateObtained && cert.expirationDate)
                      dateStr = `${formatDate(cert.dateObtained)} – ${formatDate(cert.expirationDate)}`;
                    else if (cert.dateObtained) dateStr = formatDate(cert.dateObtained);
                    return createAlignedParagraph(cert.name, dateStr, true);
                  }),
                  new Paragraph({ spacing: { after: 100 } }),
                ]
              : []),

            // PROJECTS
            ...(profile.projects && profile.projects.length > 0
              ? [
                  sectionHeader('ACADEMIC PROJECTS / PERSONAL PROJECTS'),
                  ...profile.projects.flatMap((proj, idx) => {
                    const bullets: string[] = [];

                    // Add highlights first
                    if (proj.highlights?.length) {
                      bullets.push(...proj.highlights);
                    }

                    // Add impact if available
                    if (proj.impact?.trim()) {
                      bullets.push(proj.impact);
                    }

                    // If we don't have enough bullets, extract from description
                    if (bullets.length < 3 && proj.description) {
                      const sentences = proj.description
                        .split(/(?<=[.!?])\s+/)
                        .filter((s) => s.trim().length > 10);
                      if (sentences.length > 0) {
                        // Add sentences up to fill to at least 3 bullets
                        const needed = Math.max(0, 3 - bullets.length);
                        bullets.push(...sentences.slice(0, Math.min(needed, sentences.length)));
                      } else if (bullets.length === 0) {
                        // If no sentences found and no bullets, use full description
                        bullets.push(proj.description);
                      }
                    }

                    // Add technologies as a bullet if we have space and it's not already in Environment
                    if (bullets.length < 5 && proj.technologies?.length) {
                      const techBullet = `Built using ${proj.technologies.join(', ')}`;
                      if (!bullets.some((b) => b.includes(proj.technologies![0]))) {
                        bullets.push(techBullet);
                      }
                    }

                    // Ensure we have at least 2-3 bullets by splitting description further if needed
                    if (bullets.length < 2 && proj.description && proj.description.length > 50) {
                      // Split by periods, semicolons, or newlines
                      const additionalSentences = proj.description
                        .split(/[.;]\s+|\n/)
                        .filter((s) => s.trim().length > 15)
                        .slice(0, 2 - bullets.length);
                      bullets.push(...additionalSentences);
                    }

                    const dateRange = proj.dateRange ? formatDate(proj.dateRange) : '';
                    const isLast = idx === (profile.projects?.length || 0) - 1;

                    return [
                      createAlignedParagraph(
                        proj.url ? `${proj.name} | GitHub` : proj.name,
                        dateRange,
                        true
                      ),
                      ...bullets.slice(0, 5).map((b) => createBulletParagraph(b)),
                      ...(proj.technologies?.length
                        ? [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: 'Environment: ',
                                  bold: true,
                                  size: 20,
                                  font: 'Calibri',
                                }),
                                new TextRun({
                                  text: proj.technologies.join(', '),
                                  size: 20,
                                  font: 'Calibri',
                                }),
                              ],
                              spacing: { after: isLast ? 0 : 160 },
                            }),
                          ]
                        : [new Paragraph({ spacing: { after: isLast ? 0 : 120 } })]),
                    ];
                  }),
                ]
              : []),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${fileName}.docx`);
  };

  // Build skill categories
  const buildSkillCategories = (
    skillsData: typeof profile.skills | undefined,
    role: GeneratedProfile | null
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
      const n = name.toLowerCase();

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
          'database',
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
          'lambda',
          'ec2',
          's3',
          'cloudformation',
          'ansible',
          'nginx',
          'linux',
          'unix',
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

      // APIs & Architecture
      if (
        [
          'rest',
          'graphql',
          'grpc',
          'api',
          'microservices',
          'kafka',
          'rabbitmq',
          'soap',
          'web services',
          'architecture',
        ].some((a) => n.includes(a))
      )
        return 'APIs & Architecture';

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

      // Skip soft skills and generic terms - don't add to resume
      if (
        [
          'communication',
          'leadership',
          'teamwork',
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
        ].some((s) => n.includes(s))
      ) {
        return '__SKIP__'; // Will be filtered out
      }

      return 'Technical Skills';
    };

    const categoryMap = new Map<string, Set<string>>();
    allSkills.forEach((skill) => {
      const cat = categorize(skill.name, skill.category);
      if (cat === '__SKIP__') return; // Skip soft skills
      if (!categoryMap.has(cat)) categoryMap.set(cat, new Set());
      categoryMap.get(cat)!.add(skill.name);
    });

    const order = [
      'Programming Languages',
      'Web Frameworks',
      'Frontend Technologies',
      'Databases',
      'Cloud & DevOps',
      'APIs & Architecture',
      'Testing & QA',
      'AI/ML Technologies',
      'Data & Analytics',
      'Version Control & PM',
      'Design Tools',
      'Office & Productivity',
      'Technical Skills',
    ];
    const result: Array<{ category: string; skills: string[] }> = [];
    order.forEach((cat) => {
      const skills = categoryMap.get(cat);
      if (skills && skills.size > 0) result.push({ category: cat, skills: Array.from(skills) });
    });
    // Add any remaining categories not in the order
    categoryMap.forEach((skills, cat) => {
      if (!order.includes(cat) && skills.size > 0 && cat !== '__SKIP__') {
        result.push({ category: cat, skills: Array.from(skills) });
      }
    });
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

  // PDF Generation
  const generatePdf = (fileName: string, tailored: TailoredContent | null) => {
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const personal = profile.personal;
      const experience = profile.experience || [];
      const education = profile.education || [];
      const certifications = profile.certifications || [];

      const summaryText =
        tailored?.optimizedSummary ||
        activeRole?.tailoredSummary ||
        profile.careerContext?.summary ||
        'Professional summary not available.';
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      // ATS-safe margins: 0.75" = 19.05mm
      const margin = 19.05;
      const contentWidth = pageWidth - margin * 2;
      let y = 22;

      const checkPage = (need: number) => {
        if (y + need > pageHeight - 19) {
          pdf.addPage();
          y = 22;
        }
      };

      // Name — ATS-safe: 18pt bold
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text(personal?.fullName?.toUpperCase() || 'NAME', pageWidth / 2, y, { align: 'center' });
      y += 7;

      // Contact line: Location | Email | Phone | LinkedIn | GitHub | Portfolio
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');

      // Build location string
      const loc = personal?.location;
      let locationStr = '';
      if (loc) {
        const parts = [loc.city, loc.state, loc.zipCode].filter(Boolean);
        locationStr = parts.join(', ');
      }

      const contact = [
        locationStr,
        personal?.email,
        personal?.phone,
        personal?.linkedInUrl,
        personal?.githubUrl,
        personal?.portfolioUrl,
      ].filter(Boolean);
      pdf.text(contact.join(' | '), pageWidth / 2, y, { align: 'center' });
      y += 8;

      // Summary — ATS-safe: 12pt bold header, 10pt body
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SUMMARY', margin, y);
      y += 1;
      pdf.line(margin, y, pageWidth - margin, y);
      y += 4;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const summaryLines = pdf.splitTextToSize(summaryText, contentWidth);
      pdf.text(summaryLines, margin, y);
      y += summaryLines.length * 4 + 6;

      // Skills — ATS-safe: 12pt bold header
      const skillCategories = buildSkillCategories(profile.skills, activeRole);
      if (skillCategories.length > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('TECHNICAL SKILLS', margin, y);
        y += 1;
        pdf.line(margin, y, pageWidth - margin, y);
        y += 4;
        pdf.setFontSize(10);

        skillCategories.forEach((cat) => {
          if (!cat.category || !cat.skills?.length) return;
          checkPage(8);
          pdf.setFont('helvetica', 'bold');
          pdf.text((cat.category || 'Skills') + ':', margin, y);
          pdf.setFont('helvetica', 'normal');
          const skillText = cat.skills.join(', ');
          const lines = pdf.splitTextToSize(skillText || '', contentWidth - 45);
          if (lines && lines.length > 0) {
            pdf.text(lines, margin + 45, y);
            y += lines.length * 3.5 + 2;
          }
        });
        y += 4;
      }

      // Experience — ATS-safe: 12pt bold header
      checkPage(20);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('WORK EXPERIENCE', margin, y);
      y += 1;
      pdf.line(margin, y, pageWidth - margin, y);
      y += 4;
      pdf.setFontSize(10);

      experience.forEach((exp, expIdx) => {
        checkPage(25);
        pdf.setFont('helvetica', 'bold');
        pdf.text(exp.company || 'Company', margin, y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(exp.location || '', pageWidth - margin, y, { align: 'right' });
        y += 4;
        pdf.setFont('helvetica', 'bolditalic');
        pdf.text(exp.title || 'Position', margin, y);
        pdf.setFont('helvetica', 'normal');
        const dateStr = `${exp.startDate || ''} – ${exp.isCurrent ? 'Present' : exp.endDate || ''}`;
        pdf.text(dateStr, pageWidth - margin, y, { align: 'right' });
        y += 4;

        const allBullets = [
          ...(exp.achievements || [])
            .map((a) => (typeof a === 'string' ? a : a?.statement))
            .filter(Boolean),
          ...(exp.responsibilities || []).filter(Boolean),
        ];
        // Apply page-count-aware bullet limiting
        const maxBullets = getMaxBulletsForRole(expIdx, experience.length);
        const bullets = allBullets.slice(0, maxBullets);
        bullets.forEach((b) => {
          if (!b) return;
          checkPage(6);
          const lines = pdf.splitTextToSize(`• ${b}`, contentWidth - 5);
          lines.forEach((line: string, i: number) => {
            if (line) pdf.text(line, margin + (i === 0 ? 0 : 3), y);
            y += 3.5;
          });
        });
        y += 4;
      });

      // Education
      checkPage(15);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('EDUCATION', margin, y);
      y += 1;
      pdf.line(margin, y, pageWidth - margin, y);
      y += 4;
      pdf.setFontSize(10);

      education.forEach((edu) => {
        checkPage(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text(edu.institution || 'Institution', margin, y);
        y += 4;
        pdf.setFont('helvetica', 'normal');
        const eduLine = `${edu.degree || ''}${edu.field ? ' in ' + edu.field : ''}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}`;
        pdf.text(eduLine || 'Degree', margin, y);
        y += 5;
      });

      // Certifications
      if (certifications.length > 0) {
        checkPage(15);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('CERTIFICATIONS', margin, y);
        y += 1;
        pdf.line(margin, y, pageWidth - margin, y);
        y += 4;
        pdf.setFontSize(10);

        certifications.forEach((cert) => {
          checkPage(5);
          pdf.setFont('helvetica', 'bold');
          pdf.text(cert.name || 'Certification', margin, y);
          pdf.setFont('helvetica', 'normal');
          if (cert.dateObtained)
            pdf.text(cert.dateObtained, pageWidth - margin, y, { align: 'right' });
          y += 4;
        });
      }

      // Projects
      const projects = profile.projects || [];
      if (projects.length > 0) {
        checkPage(15);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('PROJECTS', margin, y);
        y += 1;
        pdf.line(margin, y, pageWidth - margin, y);
        y += 4;
        pdf.setFontSize(10);

        projects.forEach((proj) => {
          checkPage(15);
          pdf.setFont('helvetica', 'bold');
          const projTitle = proj.url
            ? `${proj.name || 'Project'} | ${proj.url}`
            : proj.name || 'Project';
          pdf.text(projTitle, margin, y);
          pdf.setFont('helvetica', 'normal');
          if (proj.dateRange) pdf.text(proj.dateRange, pageWidth - margin, y, { align: 'right' });
          y += 4;

          // Build bullets from highlights, impact, and description
          const bullets: string[] = [];
          if (proj.highlights?.length) bullets.push(...proj.highlights);
          if (proj.impact?.trim()) bullets.push(proj.impact);
          if (bullets.length < 2 && proj.description) {
            const sentences = proj.description
              .split(/(?<=[.!?])\s+/)
              .filter((s) => s.trim().length > 10);
            bullets.push(...sentences.slice(0, 2));
          }
          if (proj.technologies?.length && bullets.length < 4) {
            bullets.push(`Technologies: ${proj.technologies.join(', ')}`);
          }

          bullets.slice(0, 4).forEach((b) => {
            if (!b) return;
            checkPage(6);
            const lines = pdf.splitTextToSize(`• ${b}`, contentWidth - 5);
            lines.forEach((line: string, i: number) => {
              if (line) pdf.text(line, margin + (i === 0 ? 0 : 3), y);
              y += 3.5;
            });
          });
          y += 3;
        });
      }

      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('[ResumeGenerator] PDF generation failed:', error);
      alert('Failed to generate PDF. Please try again.');
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
${edu.degree}${edu.field ? ' in ' + edu.field : ''}
${edu.institution}
${edu.startDate} - ${edu.endDate}${edu.gpa ? ' | GPA: ' + edu.gpa : ''}
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
      work: experience.map((exp) => ({
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
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveRole(null)}>
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
              <div className="resume-preview-section">
                <h4>Resume Preview</h4>
                <div className="preview-box">
                  <div className="preview-header">
                    <strong>{profile.personal?.fullName}</strong>
                    <span>{profile.personal?.email}</span>
                  </div>
                  <div className="preview-summary">
                    {activeRole.tailoredSummary?.slice(0, 200)}...
                  </div>
                  <div className="preview-skills">
                    {activeRole.highlightedSkills?.slice(0, 6).map((s) => (
                      <span key={s} className="skill-tag">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
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
                  <span
                    className={`score-value ${currentScore >= 70 ? 'good' : currentScore >= 50 ? 'medium' : 'low'}`}
                  >
                    {currentScore}%
                  </span>
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
                <h4>✅ Matched Keywords ({analysis.matchedKeywords.length})</h4>
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
              </div>

              {analysis.missingKeywords.length > 0 && (
                <div className="keywords-section">
                  <div className="keywords-header">
                    <h4>⚠️ Missing Keywords ({analysis.missingKeywords.length})</h4>
                    <button
                      className="btn btn-enhance"
                      onClick={enhanceWithAI}
                      disabled={isEnhancing}
                    >
                      {isEnhancing ? (
                        <>
                          <span className="spinner-small"></span>Enhancing...
                        </>
                      ) : (
                        'Enhance with AI'
                      )}
                    </button>
                  </div>
                  <p className="keywords-hint">JD frequency (higher = more important)</p>
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
                  {enhanceSuccess && <div className="enhance-success">{enhanceSuccess}</div>}
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
          {mode === 'with-jd' && !analysis && !isAnalyzing && (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={analyzeJobDescription}
                disabled={!jobDescription.trim()}
              >
                Analyze JD
              </button>
            </>
          )}

          {((mode === 'without-jd' && activeRole) || (mode === 'with-jd' && analysis)) &&
            !isGenerating && (
              <>
                <button className="btn btn-ghost" onClick={onClose}>
                  Cancel
                </button>
                <div
                  className="page-count-control"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}
                >
                  <span>Pages:</span>
                  <select
                    value={targetPages}
                    onChange={(e) => setTargetPages(Number(e.target.value))}
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #d1d5db',
                      fontSize: '13px',
                    }}
                  >
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                  </select>
                  {targetPages !== recommendedPages && (
                    <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                      (Recommended: {recommendedPages} for {yearsOfExp}yr exp)
                    </span>
                  )}
                </div>
                <div className="download-buttons">
                  <button className="btn btn-primary" onClick={() => generateResume('docx')}>
                    DOCX
                  </button>
                  <button className="btn btn-primary" onClick={() => generateResume('pdf')}>
                    PDF
                  </button>
                </div>
                {showSaveVersion && lastGeneratedFormat && (
                  <div
                    style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}
                  >
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
                      Save as Version
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>
                      Done
                    </button>
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
