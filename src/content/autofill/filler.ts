/**
 * Universal Form Filler
 * Fills application forms using profile data
 * Integrates with Answer Bank for custom questions
 */

import type { DetectedForm, FieldType } from './form-detector';
import type { ResumeProfile } from '@shared/types/profile.types';

// Job context for answer bank queries
export interface JobContext {
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
}

export interface FillResult {
  success: boolean;
  filledFields: FilledField[];
  skippedFields: SkippedField[];
  errors: string[];
}

export interface FilledField {
  fieldType: FieldType;
  label: string;
  value: string;
  element: HTMLElement;
}

export interface SkippedField {
  fieldType: FieldType;
  label: string;
  reason: string;
}

export interface FillPreview {
  fields: PreviewField[];
  canAutoFill: boolean;
  warnings: string[];
}

export interface PreviewField {
  fieldType: FieldType;
  label: string;
  currentValue: string;
  suggestedValue: string;
  willFill: boolean;
  element: HTMLElement;
}

/**
 * Generate preview of what will be filled
 * Now async to support Answer Bank queries for custom questions
 */
export async function generateFillPreview(
  form: DetectedForm,
  profile: ResumeProfile,
  jobContext?: JobContext
): Promise<FillPreview> {
  const fields: PreviewField[] = [];
  const warnings: string[] = [];

  for (const field of form.fields) {
    let suggestedValue = getValueForField(field.type, profile);

    // For custom questions, try the answer bank
    if (!suggestedValue && (field.type === 'customQuestion' || field.type === 'additionalInfo')) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_ANSWER_SUGGESTION',
          payload: {
            questionText: field.label,
            companyName: jobContext?.companyName,
            jobTitle: jobContext?.jobTitle,
          },
        });
        if (response?.success && response.data?.answer) {
          suggestedValue = response.data.answer;
        }
      } catch (e) {
        // Answer bank not available, continue without
        console.log('[Filler] Answer bank query failed:', e);
      }
    }

    fields.push({
      fieldType: field.type,
      label: field.label,
      currentValue: field.currentValue,
      suggestedValue: suggestedValue || '',
      willFill: !!suggestedValue && !field.currentValue,
      element: field.element,
    });

    // Add warnings for required fields without values
    if (field.isRequired && !suggestedValue && !field.currentValue) {
      warnings.push(`Required field "${field.label}" has no value in your profile`);
    }
  }

  // Check for critical missing fields
  const hasEmail = fields.some(f => f.fieldType === 'email' && (f.suggestedValue || f.currentValue));
  const hasName = fields.some(f =>
    ['firstName', 'lastName', 'fullName'].includes(f.fieldType) &&
    (f.suggestedValue || f.currentValue)
  );

  if (!hasEmail) {
    warnings.push('Email address is missing from your profile');
  }
  if (!hasName) {
    warnings.push('Name is missing from your profile');
  }

  return {
    fields,
    canAutoFill: hasEmail && hasName,
    warnings,
  };
}

/**
 * Fill form fields with profile data
 * Integrates with Answer Bank for custom questions
 */
export async function fillForm(
  form: DetectedForm,
  profile: ResumeProfile,
  options: { onlyEmpty?: boolean; requireApproval?: boolean; jobContext?: JobContext } = {}
): Promise<FillResult> {
  const filledFields: FilledField[] = [];
  const skippedFields: SkippedField[] = [];
  const errors: string[] = [];

  const { onlyEmpty = true, jobContext } = options;

  for (const field of form.fields) {
    try {
      // Skip if field already has value and onlyEmpty is true
      if (onlyEmpty && field.currentValue) {
        skippedFields.push({
          fieldType: field.type,
          label: field.label,
          reason: 'Field already has a value',
        });
        continue;
      }

      let value = getValueForField(field.type, profile);

      // For custom questions, try the answer bank
      if (!value && (field.type === 'customQuestion' || field.type === 'additionalInfo')) {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'GET_ANSWER_SUGGESTION',
            payload: {
              questionText: field.label,
              companyName: jobContext?.companyName,
              jobTitle: jobContext?.jobTitle,
            },
          });
          if (response?.success && response.data?.answer) {
            value = response.data.answer;
          }
        } catch (e) {
          console.log('[Filler] Answer bank query failed:', e);
        }
      }

      if (!value) {
        skippedFields.push({
          fieldType: field.type,
          label: field.label,
          reason: 'No matching value in profile',
        });
        continue;
      }

      // Fill the field
      const success = await fillField(field.element, value);

      if (success) {
        filledFields.push({
          fieldType: field.type,
          label: field.label,
          value,
          element: field.element,
        });
      } else {
        skippedFields.push({
          fieldType: field.type,
          label: field.label,
          reason: 'Failed to set value',
        });
      }
    } catch (error) {
      errors.push(`Error filling ${field.label}: ${(error as Error).message}`);
    }
  }

  // Also try to fill checkbox/radio groups (work auth, demographics, etc.)
  try {
    const checkboxFilled = await fillCheckboxGroups(profile);
    filledFields.push(...checkboxFilled);
  } catch (e) {
    console.log('[Filler] Checkbox group fill failed:', e);
  }

  return {
    success: errors.length === 0 && filledFields.length > 0,
    filledFields,
    skippedFields,
    errors,
  };
}

/**
 * Get value from profile for a field type
 */
function getValueForField(fieldType: FieldType, profile: ResumeProfile): string | null {
  const { personal, experience, education, skills, autofillData } = profile;

  switch (fieldType) {
    // === PERSONAL INFO ===
    case 'email':
      return personal.email || null;

    case 'phone':
      return personal.phone || null;

    case 'firstName':
      return personal.fullName?.split(' ')[0] || null;

    case 'lastName':
      return personal.fullName?.split(' ').slice(1).join(' ') || null;

    case 'fullName':
      return personal.fullName || null;

    // === LINKS ===
    case 'linkedin':
      return personal.linkedInUrl || null;

    case 'github':
      return personal.githubUrl || null;

    case 'portfolio':
    case 'website':
      return personal.portfolioUrl || null;

    // === ADDRESS ===
    case 'address':
    case 'streetAddress':
      // First check autofillData for explicit street address
      if (autofillData?.streetAddress) return autofillData.streetAddress;
      // Fallback to location (might not be a street address)
      return personal.location || null;

    case 'city':
      // Check autofillData first
      if (autofillData?.city) return autofillData.city;
      // Try to extract from location string
      return personal.location?.split(',')[0]?.trim() || null;

    case 'state':
      // Check autofillData first
      if (autofillData?.state) return autofillData.state;
      // Try to extract from location string (second part after comma)
      const statePart = personal.location?.split(',')[1]?.trim();
      // Remove zip if present (e.g., "NJ 07302" -> "NJ")
      return statePart?.replace(/\s*\d{5}(-\d{4})?$/, '').trim() || null;

    case 'cityState':
      // Combined city/state field - return full location
      if (autofillData?.city && autofillData?.state) {
        return `${autofillData.city}, ${autofillData.state}`;
      }
      return personal.location || null;

    case 'zip':
    case 'zipCode':
    case 'postalCode':
      // Check autofillData first
      if (autofillData?.zipCode) return autofillData.zipCode;
      // Extract from location if present
      const zipMatch = personal.location?.match(/\b\d{5}(-\d{4})?\b/);
      return zipMatch ? zipMatch[0] : null;

    case 'country':
      return autofillData?.country || 'United States';

    // === EMPLOYMENT ===
    case 'currentCompany':
      return experience?.[0]?.company || null;

    case 'currentTitle':
      return experience?.[0]?.title || null;

    case 'yearsExperience':
    case 'yearsExperienceSpecific':
      if (!experience || experience.length === 0) return null;
      const firstYear = Math.min(...experience.map(e => parseInt(e.startDate?.slice(0, 4) || '2020')));
      const years = new Date().getFullYear() - firstYear;
      return String(years);

    case 'employmentDates':
      if (!experience?.[0]) return null;
      const start = formatDate(experience[0].startDate);
      const end = experience[0].isCurrent ? 'Present' : formatDate(experience[0].endDate);
      return `${start} - ${end}`;

    case 'responsibilities':
      if (!experience?.[0]) return null;
      // Combine description and achievements
      const desc = experience[0].description || '';
      const achievements = experience[0].achievements?.slice(0, 3).join('. ') || '';
      return desc || achievements || null;

    // === COMPENSATION ===
    case 'salaryExpectation':
    case 'salary':
    case 'desiredPay':
      if (profile.salaryRange) {
        return `$${profile.salaryRange.min.toLocaleString()} - $${profile.salaryRange.max.toLocaleString()}`;
      }
      return null;

    // === WORK AUTHORIZATION ===
    case 'workAuthorization':
      const authMap: Record<string, string> = {
        'citizen': 'US Citizen',
        'permanent_resident': 'Permanent Resident',
        'visa': 'Work Visa',
        'other': 'Other',
      };
      return authMap[autofillData?.workAuthorization] || null;

    case 'sponsorship':
      return autofillData?.requiresSponsorship ? 'Yes' : 'No';

    case 'citizenship':
      return autofillData?.workAuthorization === 'citizen' ? 'Yes' : 'No';

    case 'securityClearance':
      // Default to No unless specified in custom answers
      return autofillData?.customAnswers?.securityClearance || 'No';

    case 'veteranStatus':
      return autofillData?.demographics?.veteranStatus || 'I am not a veteran';

    // === PREFERENCES ===
    case 'willingToRelocate':
      return autofillData?.willingToRelocate ? 'Yes' : 'No';

    case 'remotePreference':
      const remoteMap: Record<string, string> = {
        'remote': 'Remote',
        'hybrid': 'Hybrid',
        'onsite': 'On-site',
        'flexible': 'Flexible',
      };
      return remoteMap[autofillData?.remotePreference] || 'Flexible';

    case 'canCommute':
      return 'Yes'; // Default to yes

    case 'startDate':
    case 'availableDate':
      return autofillData?.availableStartDate || 'Immediately';

    case 'preferredRegions':
      // Return relocation preferences or current location
      if (autofillData?.relocationPreferences?.length) {
        return autofillData.relocationPreferences.join(', ');
      }
      return personal.location || null;

    case 'desiredRoles':
      // Return target roles from profile
      if (profile.targetRoles?.length) {
        return profile.targetRoles.join(', ');
      }
      // Fallback to current title
      return experience?.[0]?.title || null;

    // === EDUCATION ===
    case 'education':
    case 'highestEducation':
      if (!education || education.length === 0) return null;
      return `${education[0].degree} in ${education[0].field}`;

    case 'degree':
      return education?.[0]?.degree || null;

    case 'university':
      return education?.[0]?.institution || null;

    // === SKILLS ===
    case 'skillsLanguages':
      // Programming languages - check both technical and tools
      const allSkills = [...(skills?.technical || []), ...(skills?.tools || [])];
      const languages = allSkills.filter(s => isLanguage(s.toLowerCase()));
      return languages.length > 0 ? [...new Set(languages)].join(', ') : null;

    case 'skillsCloud':
      const allSkillsCloud = [...(skills?.technical || []), ...(skills?.tools || [])];
      const cloudSkills = allSkillsCloud.filter(s => isCloudOrDevops(s.toLowerCase()));
      return cloudSkills.length > 0 ? [...new Set(cloudSkills)].join(', ') : null;

    case 'skillsFrameworks':
      // Frameworks and tools
      const allSkillsFramework = [...(skills?.technical || []), ...(skills?.tools || [])];
      const frameworks = allSkillsFramework.filter(s => isFramework(s.toLowerCase()));
      return frameworks.length > 0 ? [...new Set(frameworks)].join(', ') : null;

    case 'skillsDatabases':
      const allSkillsDb = [...(skills?.technical || []), ...(skills?.tools || [])];
      const databases = allSkillsDb.filter(s => isDatabase(s.toLowerCase()));
      return databases.length > 0 ? [...new Set(databases)].join(', ') : null;

    case 'skillsGeneral':
      // All technical skills
      return skills?.technical?.slice(0, 10).join(', ') || null;

    // === DEMOGRAPHICS (EEO) ===
    case 'gender':
      return autofillData?.demographics?.gender || null;

    case 'ethnicity':
    case 'race':
      return autofillData?.demographics?.ethnicity || null;

    case 'disability':
      return autofillData?.demographics?.disabilityStatus || 'I do not wish to answer';

    // === OTHER ===
    case 'hearAboutUs':
      return 'Online Job Board';

    case 'referral':
      return null; // User should fill this

    case 'interviewAvailability':
      return 'Available for interviews anytime during business hours';

    case 'leadershipStyle':
      return null; // Requires custom answer

    case 'additionalInfo':
      // Could generate from profile summary
      return null;

    default:
      // Check custom answers for any saved responses
      if (autofillData?.customAnswers) {
        for (const [pattern, answer] of Object.entries(autofillData.customAnswers)) {
          if (new RegExp(pattern, 'i').test(fieldType)) {
            return answer;
          }
        }
      }
      return null;
  }
}

// === HELPER FUNCTIONS FOR SKILL CATEGORIZATION ===

function isLanguage(skill: string): boolean {
  const languages = [
    'java', 'python', 'javascript', 'typescript', 'c#', 'c++', 'c',
    'go', 'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala',
    'perl', 'r', 'matlab', 'sql', 'html', 'css', 'bash', 'shell',
    'powershell', 'groovy', 'lua', 'dart', 'elixir', 'clojure', 'haskell'
  ];
  return languages.some(lang => skill.includes(lang));
}

function isCloudOrDevops(skill: string): boolean {
  const cloudDevops = [
    'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
    'terraform', 'ansible', 'jenkins', 'ci/cd', 'gitlab', 'github actions',
    'circleci', 'cloudformation', 'helm', 'prometheus', 'grafana', 'datadog',
    'splunk', 'elk', 'linux', 'nginx', 'apache', 'serverless', 'lambda'
  ];
  return cloudDevops.some(term => skill.includes(term));
}

function isFramework(skill: string): boolean {
  const frameworks = [
    'react', 'angular', 'vue', 'node', 'express', 'spring', 'django',
    'flask', 'fastapi', 'rails', 'laravel', '.net', 'asp.net', 'nextjs',
    'nuxt', 'svelte', 'jquery', 'bootstrap', 'tailwind', 'redux', 'graphql',
    'rest', 'nestjs', 'fastify', 'hibernate', 'mybatis'
  ];
  return frameworks.some(fw => skill.includes(fw));
}

function isDatabase(skill: string): boolean {
  const databases = [
    'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'elasticsearch',
    'oracle', 'sql server', 'mssql', 'sqlite', 'dynamodb', 'cassandra',
    'couchdb', 'neo4j', 'mariadb', 'firebase', 'supabase', 'cockroachdb'
  ];
  return databases.some(db => skill.includes(db));
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    // Expected: some date strings may not be parseable
    return dateStr;
  }
}

/**
 * Fill a single field
 */
async function fillField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): Promise<boolean> {
  try {
    // Focus the element
    element.focus();

    // Small delay for React/Vue to register focus
    await sleep(50);

    if (element instanceof HTMLSelectElement) {
      // Handle select elements
      return fillSelectField(element, value);
    }

    if (element instanceof HTMLInputElement && element.type === 'file') {
      // Can't programmatically fill file inputs
      return false;
    }

    if (element instanceof HTMLInputElement &&
        (element.type === 'checkbox' || element.type === 'radio')) {
      return fillCheckboxOrRadio(element, value);
    }

    // Handle date inputs specially
    if (element instanceof HTMLInputElement && element.type === 'date') {
      return fillDateField(element, value);
    }

    // For text inputs and textareas
    // Clear existing value
    element.value = '';

    // Simulate typing for better compatibility
    for (const char of value) {
      element.value += char;

      // Dispatch input event for each character (React-like frameworks)
      element.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char,
      }));

      // Small delay between characters for more natural input
      await sleep(5);
    }

    // Final events
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  } catch (error) {
    console.error('Failed to fill field:', error);
    return false;
  }
}

/**
 * Fill select element
 */
function fillSelectField(select: HTMLSelectElement, value: string): boolean {
  const lowerValue = value.toLowerCase();

  // Try to find matching option
  for (const option of select.options) {
    const optionText = option.text.toLowerCase();
    const optionValue = option.value.toLowerCase();

    if (optionText === lowerValue ||
        optionValue === lowerValue ||
        optionText.includes(lowerValue) ||
        lowerValue.includes(optionText)) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }

  // Try fuzzy matching for yes/no fields
  if (['yes', 'true', '1'].includes(lowerValue)) {
    for (const option of select.options) {
      if (['yes', 'true', '1', 'y'].includes(option.value.toLowerCase())) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  if (['no', 'false', '0'].includes(lowerValue)) {
    for (const option of select.options) {
      if (['no', 'false', '0', 'n'].includes(option.value.toLowerCase())) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  return false;
}

/**
 * Fill checkbox or radio
 */
function fillCheckboxOrRadio(element: HTMLInputElement, value: string): boolean {
  const shouldCheck = ['yes', 'true', '1', 'y'].includes(value.toLowerCase());

  if (element.type === 'checkbox') {
    element.checked = shouldCheck;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (element.type === 'radio') {
    // Find the radio with matching value
    const radioGroup = document.querySelectorAll(`input[name="${element.name}"]`);
    for (const radio of radioGroup) {
      const r = radio as HTMLInputElement;
      if (r.value.toLowerCase() === value.toLowerCase() ||
          (shouldCheck && ['yes', 'true', '1'].includes(r.value.toLowerCase()))) {
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  return false;
}

/**
 * Fill date input field
 * Handles conversion from various formats to yyyy-MM-dd
 */
function fillDateField(element: HTMLInputElement, value: string): boolean {
  try {
    // Handle special text values like "Immediately", "ASAP", etc.
    const immediateTerms = ['immediately', 'asap', 'now', 'available now', 'immediate'];
    if (immediateTerms.includes(value.toLowerCase())) {
      // Set to today's date for immediate availability
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // yyyy-MM-dd
      element.value = dateStr;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Check if already in yyyy-MM-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // Handle date ranges like "Jan 2025 - Present" or "2024-01-01 - 2025-01-01"
    const rangeMatch = value.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (rangeMatch) {
      // Check field label/name to determine if this is start or end date
      const fieldName = (element.name + ' ' + element.id + ' ' + (element.labels?.[0]?.textContent || '')).toLowerCase();
      const isEndDate = /end|to|through|until/i.test(fieldName);

      let datePart = rangeMatch[1].trim(); // Default to start date
      if (isEndDate) {
        datePart = rangeMatch[2].trim();
        // Handle "Present" or "Current" for end dates
        if (/present|current|ongoing|now/i.test(datePart)) {
          const today = new Date();
          const dateStr = today.toISOString().split('T')[0];
          element.value = dateStr;
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }

      // Parse the date part
      const parsedDate = parseFlexibleDate(datePart);
      if (parsedDate) {
        element.value = parsedDate;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // If this is clearly a date range but we can't determine which part to use, skip
      console.log(`[ApplySharp] Skipping date range "${value}" - field doesn't specify start/end`);
      return false;
    }

    // Try to parse single date from various formats
    const parsedDate = parseFlexibleDate(value);
    if (parsedDate) {
      element.value = parsedDate;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // If we can't parse it, skip filling this field
    console.log(`[ApplySharp] Could not parse date value: "${value}" - skipping`);
    return false;
  } catch (error) {
    console.error('[ApplySharp] Error filling date field:', error);
    return false;
  }
}

/**
 * Parse flexible date formats into yyyy-MM-dd
 */
function parseFlexibleDate(dateStr: string): string | null {
  // Handle "Jan 2025", "January 2025", "01/2025", etc.
  const monthYearMatch = dateStr.match(/^(\w+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.findIndex(m => monthYearMatch[1].toLowerCase().startsWith(m));
    if (monthIndex >= 0) {
      const year = parseInt(monthYearMatch[2]);
      // Use first day of month
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
    }
  }

  // Handle "01/2025" or "1/2025"
  const slashMonthYear = dateStr.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMonthYear) {
    const month = parseInt(slashMonthYear[1]);
    const year = parseInt(slashMonthYear[2]);
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
  }

  // Try standard date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Fill checkbox/radio groups based on profile data
 * Handles work authorization, demographics, etc.
 */
async function fillCheckboxGroups(profile: ResumeProfile): Promise<FilledField[]> {
  const filled: FilledField[] = [];
  const { autofillData, experience } = profile;

  // Define checkbox group matchers
  const groupMatchers: Array<{
    patterns: RegExp[];
    getValue: () => string | undefined;
    label: string;
  }> = [
    // Work Authorization
    {
      patterns: [/authorized.*work/i, /work.*authorization/i, /legal.*right/i, /eligible.*work/i],
      getValue: () => {
        const authMap: Record<string, string[]> = {
          'citizen': ['citizen', 'us citizen', 'u.s. citizen', 'american citizen'],
          'permanent_resident': ['permanent resident', 'green card', 'lawful permanent'],
          'visa': ['visa', 'work visa', 'h-1b', 'h1b'],
          'other': ['other'],
        };
        const auth = autofillData?.workAuthorization;
        return auth ? authMap[auth]?.[0] : undefined;
      },
      label: 'Work Authorization',
    },
    // Visa Type
    {
      patterns: [/visa.*type/i, /if.*visa/i, /select.*visa/i, /h-?1b/i, /l-?1/i],
      getValue: () => autofillData?.visaType,
      label: 'Visa Type',
    },
    // Willing to Relocate
    {
      patterns: [/relocat/i, /willing.*move/i, /open.*relocation/i],
      getValue: () => autofillData?.willingToRelocate ? 'yes' : 'no',
      label: 'Relocation',
    },
    // Work Preference (Remote/Hybrid/Onsite)
    {
      patterns: [/hybrid.*on.?site/i, /work.*preference/i, /remote.*hybrid/i, /willing.*work.*hybrid/i],
      getValue: () => {
        const pref = autofillData?.workPreference || autofillData?.remotePreference;
        const map: Record<string, string> = {
          'remote': 'remote',
          'hybrid': 'hybrid',
          'onsite': 'on-site',
          'flexible': 'hybrid',
          'road_warrior': 'road warrior',
        };
        return pref ? map[pref] : undefined;
      },
      label: 'Work Preference',
    },
    // Gender
    {
      patterns: [/^gender/i, /your.*gender/i, /sex$/i],
      getValue: () => autofillData?.demographics?.gender,
      label: 'Gender',
    },
    // Sexual Orientation
    {
      patterns: [/sexual.*orientation/i, /lgbtq/i],
      getValue: () => autofillData?.demographics?.sexualOrientation || 'Prefer not to say',
      label: 'Sexual Orientation',
    },
    // Ethnicity
    {
      patterns: [/ethnicity/i, /hispanic.*latino/i],
      getValue: () => autofillData?.demographics?.ethnicity,
      label: 'Ethnicity',
    },
    // Race
    {
      patterns: [/^race/i, /racial.*identity/i],
      getValue: () => autofillData?.demographics?.race,
      label: 'Race',
    },
    // Veteran Status
    {
      patterns: [/veteran/i, /military.*service/i, /armed.*forces/i],
      getValue: () => autofillData?.demographics?.veteranStatus || 'I am not a veteran',
      label: 'Veteran Status',
    },
    // Disability
    {
      patterns: [/disability/i, /disabled/i, /accommodation/i],
      getValue: () => autofillData?.demographics?.disabilityStatus || 'I do not wish to answer',
      label: 'Disability',
    },
    // US Citizenship / Security Clearance
    {
      patterns: [/us citizen/i, /u\.s\. citizen/i, /american citizen/i, /proof.*citizenship/i, /security clearance/i],
      getValue: () => {
        if (autofillData?.workAuthorization === 'citizen') return 'yes';
        return 'no';
      },
      label: 'US Citizenship',
    },
    // Active Security Clearance
    {
      patterns: [/active.*security.*clearance/i, /do you have.*clearance/i, /current.*clearance/i],
      getValue: () => autofillData?.customAnswers?.hasSecurityClearance || 'no',
      label: 'Security Clearance',
    },
    // Years of Experience (specific role/technology)
    {
      patterns: [/how many years.*experience/i, /years.*experience.*do you have/i, /years of experience.*working/i],
      getValue: () => {
        if (!experience || experience.length === 0) return '0-2 years';
        const firstYear = Math.min(...experience.map(e => parseInt(e.startDate?.slice(0, 4) || '2020')));
        const years = new Date().getFullYear() - firstYear;
        if (years >= 6) return '6+ years';
        if (years >= 3) return '3-5 years';
        return '0-2 years';
      },
      label: 'Years of Experience',
    },
    // Commute / Travel
    {
      patterns: [/commute/i, /travel.*to.*site/i, /report.*to.*office/i, /able.*to.*come.*in/i, /reliably.*commute/i, /commute.*to.*client/i],
      getValue: () => autofillData?.willingToRelocate !== false ? 'yes' : 'no',
      label: 'Commute',
    },
    // Referral source
    {
      patterns: [/how did you hear/i, /where did you hear/i, /referred.*by/i, /source/i],
      getValue: () => 'Online Job Board',
      label: 'Referral',
    },
  ];

  // Find all checkbox and radio groups on the page
  const allInputs = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]');

  // Group by name, or by parent container for nameless inputs
  const groups = new Map<string, HTMLInputElement[]>();
  let anonymousGroupId = 0;

  for (const input of allInputs) {
    let groupKey = input.name;

    // If no name, group by parent container
    if (!groupKey) {
      const container = input.closest('fieldset, [role="group"], .checkbox-group, .radio-group, .form-group, .field-group');
      if (container) {
        // Generate a unique ID for this container
        if (!(container as HTMLElement).dataset.jpGroupId) {
          (container as HTMLElement).dataset.jpGroupId = `anonymous-${anonymousGroupId++}`;
        }
        groupKey = `container:${(container as HTMLElement).dataset.jpGroupId}`;
      }
    }

    if (groupKey) {
      const existing = groups.get(groupKey) || [];
      existing.push(input);
      groups.set(groupKey, existing);
    }
  }

  // For each group, try to match and fill
  for (const [_name, inputs] of groups) {
    if (inputs.length < 2) continue; // Single checkbox, not a group
    if (inputs.some(i => i.checked)) continue; // Already has selection

    // Find the group's label/context - search more broadly
    const firstInput = inputs[0];
    const groupContext = findGroupContext(firstInput);

    // Also get context from all option labels to detect the type of question
    const allLabels = inputs.map(i => findCheckboxLabel(i)).join(' ');
    const combinedContext = `${groupContext} ${allLabels}`.toLowerCase();

    // Try to match with our patterns
    for (const matcher of groupMatchers) {
      const matches = matcher.patterns.some(p => p.test(combinedContext));
      if (!matches) continue;

      const targetValue = matcher.getValue();
      if (!targetValue) continue;

      // Find the input that best matches the target value
      const targetLower = targetValue.toLowerCase();
      const targetWords = targetLower.split(/[\s\-\/]+/).filter(w => w.length > 2);

      let bestMatch: { input: HTMLInputElement; score: number } | null = null;

      for (const input of inputs) {
        const optionLabel = findCheckboxLabel(input)?.toLowerCase() || '';
        const optionValue = input.value?.toLowerCase() || '';
        const optionText = `${optionLabel} ${optionValue}`;

        let score = 0;

        // Exact match
        if (optionLabel.includes(targetLower) || targetLower.includes(optionLabel)) {
          score = 100;
        }
        // Value match
        else if (optionValue === targetLower) {
          score = 90;
        }
        // Word overlap
        else {
          for (const word of targetWords) {
            if (optionText.includes(word)) score += 20;
          }
        }

        // Yes/No matching
        if (matchesYesNo(targetLower, optionLabel)) {
          score = 80;
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { input, score };
        }
      }

      if (bestMatch && bestMatch.score >= 20) {
        bestMatch.input.checked = true;
        bestMatch.input.dispatchEvent(new Event('change', { bubbles: true }));
        bestMatch.input.dispatchEvent(new Event('click', { bubbles: true }));

        filled.push({
          fieldType: 'customQuestion',
          label: matcher.label,
          value: targetValue,
          element: bestMatch.input,
        });
      }
      break; // Found a matcher, move to next group
    }
  }

  return filled;
}

/**
 * Find the context/label for a checkbox group
 */
function findGroupContext(input: HTMLInputElement): string {
  const contextParts: string[] = [];

  // Check for fieldset legend
  const fieldset = input.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) contextParts.push(legend.textContent || '');
  }

  // Walk up the DOM looking for context text
  let current: HTMLElement | null = input.parentElement;
  let depth = 0;
  const maxDepth = 6;

  while (current && depth < maxDepth) {
    // Look for direct text content or labels
    for (const child of Array.from(current.children)) {
      // Skip if it's a checkbox/radio container
      if (child.querySelector('input[type="checkbox"], input[type="radio"]')) continue;

      // Check for labels, headings, spans, paragraphs
      if (child.matches('label, .label, h1, h2, h3, h4, h5, h6, p, span, strong, b')) {
        const text = child.textContent?.trim() || '';
        if (text.length > 5 && text.length < 300 && !contextParts.includes(text)) {
          contextParts.push(text);
        }
      }
    }

    // Also check for aria-label or data attributes
    const ariaLabel = current.getAttribute('aria-label') || current.getAttribute('aria-labelledby');
    if (ariaLabel) contextParts.push(ariaLabel);

    const dataLabel = current.getAttribute('data-label') || current.getAttribute('data-question');
    if (dataLabel) contextParts.push(dataLabel);

    current = current.parentElement;
    depth++;
  }

  // Check for preceding sibling that might be a label
  const prevSibling = input.previousElementSibling;
  if (prevSibling && !prevSibling.querySelector('input')) {
    const text = prevSibling.textContent?.trim() || '';
    if (text.length > 5 && text.length < 200) {
      contextParts.push(text);
    }
  }

  // Use input's name as additional context
  if (input.name) {
    contextParts.push(input.name.replace(/[\[\]_-]/g, ' '));
  }

  return contextParts.join(' ');
}

/**
 * Find label text for a specific checkbox
 */
function findCheckboxLabel(input: HTMLInputElement): string {
  // Check for associated label
  if (input.labels && input.labels.length > 0) {
    return input.labels[0].textContent?.trim() || '';
  }

  // Check for label by ID
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  // Check for parent label
  const parentLabel = input.closest('label');
  if (parentLabel) {
    return parentLabel.textContent?.trim() || '';
  }

  // Check next sibling text
  const nextSibling = input.nextSibling;
  if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
    return nextSibling.textContent?.trim() || '';
  }

  return input.value || '';
}

/**
 * Match yes/no style values
 */
function matchesYesNo(target: string, option: string): boolean {
  const yesTerms = ['yes', 'true', 'agree', 'affirmative'];
  const noTerms = ['no', 'false', 'disagree', 'negative'];

  const targetIsYes = yesTerms.some(t => target.includes(t));
  const targetIsNo = noTerms.some(t => target.includes(t));
  const optionIsYes = yesTerms.some(t => option.includes(t));
  const optionIsNo = noTerms.some(t => option.includes(t));

  return (targetIsYes && optionIsYes) || (targetIsNo && optionIsNo);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Highlight filled fields for user feedback
 */
export function highlightFilledFields(fields: FilledField[]): void {
  for (const field of fields) {
    const element = field.element as HTMLElement;
    const originalBorder = element.style.border;
    const originalBoxShadow = element.style.boxShadow;

    element.style.border = '2px solid #22c55e';
    element.style.boxShadow = '0 0 0 3px rgba(34, 197, 94, 0.2)';

    // Remove highlight after 3 seconds
    setTimeout(() => {
      element.style.border = originalBorder;
      element.style.boxShadow = originalBoxShadow;
    }, 3000);
  }
}

// ============================================================
// ANSWER BANK LEARNING FUNCTIONS
// ============================================================

/**
 * Learn from user's manual fills
 * Call this after user manually fills a field that was skipped
 */
export async function learnFromManualFill(
  questionLabel: string,
  answer: string
): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_ANSWER',
      payload: {
        questionText: questionLabel,
        answer,
      },
    });
    return response?.success || false;
  } catch (e) {
    console.error('[Filler] Failed to save manual fill:', e);
    return false;
  }
}

/**
 * Request AI to generate an answer for a custom question
 */
export async function requestAIAnswer(
  questionLabel: string,
  jobContext?: JobContext
): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GENERATE_AI_ANSWER',
      payload: {
        questionText: questionLabel,
        companyName: jobContext?.companyName,
        jobTitle: jobContext?.jobTitle,
        jobDescription: jobContext?.jobDescription,
      },
    });
    if (response?.success && response.data?.answer) {
      return response.data.answer;
    }
    return null;
  } catch (e) {
    console.error('[Filler] Failed to generate AI answer:', e);
    return null;
  }
}

/**
 * Watch for manual fills and learn from them
 * Attach this to skipped fields after autofill
 */
export function watchForManualFills(skippedFields: SkippedField[]): void {
  for (const field of skippedFields) {
    const element = (field as unknown as { element?: HTMLElement }).element;
    if (!element) continue;

    // Watch for user input
    const handleInput = debounce(async (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      const value = target.value?.trim();

      // Only learn if user entered substantial content
      if (value && value.length > 10) {
        console.log('[Filler] Learning from manual fill:', field.label);
        await learnFromManualFill(field.label, value);

        // Remove listener after learning
        element.removeEventListener('blur', handleInput);
      }
    }, 1000);

    element.addEventListener('blur', handleInput);
  }
}

/**
 * Simple debounce helper
 */
function debounce(
  func: (e: Event) => void,
  wait: number
): (e: Event) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (e: Event) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(e), wait);
  };
}
