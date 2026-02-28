export { calculateATSScore, analyzeKeywords, getKeywordsToAdd } from './matcher';
export type { ATSScore, KeywordAnalysis } from './matcher';

// Hybrid Scorer (Quick + Deep)
export {
  calculateQuickATSScore,
  calculateDeepATSScore,
  getScoreColor,
  getQuickRecommendations,
} from './hybrid-scorer';
export type { QuickATSScore, DeepATSScore, KeywordWithWeight } from './hybrid-scorer';

// Layered Scorer (4-Layer Smart Filtering)
export {
  calculateLayeredATSScore,
  detectBackground,
  detectRole,
  detectSkillAreas,
  getSkillAreasForRole,
  getAreasToEmphasize,
} from './layered-scorer';
export type { SkillAreaWeight, LayeredScoreInput } from './layered-scorer';

// ATS Format Validator
export { validateATSFormat, extractResumeContent } from './format-validator';
export type { ATSFormatScore, FormatIssue, ResumeContent } from './format-validator';

// Keywords Library
export {
  getAllPatterns,
  getAllKeywords,
  getKeywordsForSkillArea,
  getPatternsForSkillArea,
  getKeywordStats,
} from './keywords';
