/**
 * Universal Form Detector
 * Detects application forms on any job site (like Simplify)
 */

export interface DetectedField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  type: FieldType;
  label: string;
  name: string;
  id: string;
  placeholder: string;
  isRequired: boolean;
  currentValue: string;
  suggestedValue?: string;
  confidence: number; // 0-100, how confident we are about the field type
}

export type FieldType =
  // Personal Info
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'streetAddress'
  | 'city'
  | 'state'
  | 'cityState' // Combined city/state field
  | 'zip'
  | 'zipCode'
  | 'postalCode'
  | 'country'
  // Links
  | 'linkedin'
  | 'github'
  | 'portfolio'
  | 'website'
  // Documents
  | 'resume'
  | 'coverLetter'
  // Employment
  | 'currentCompany'
  | 'currentTitle'
  | 'yearsExperience'
  | 'yearsExperienceSpecific' // "years with Windows", "years with Java"
  | 'startDate'
  | 'employmentDates'
  | 'responsibilities'
  // Compensation
  | 'salary'
  | 'salaryExpectation'
  | 'desiredPay'
  // Work Authorization
  | 'workAuthorization'
  | 'sponsorship'
  | 'citizenship'
  | 'securityClearance'
  | 'veteranStatus'
  // Preferences
  | 'willingToRelocate'
  | 'remotePreference'
  | 'canCommute'
  | 'preferredRegions'
  | 'desiredRoles'
  | 'availableDate'
  // Education
  | 'education'
  | 'highestEducation'
  | 'degree'
  | 'university'
  // Skills
  | 'skillsLanguages'
  | 'skillsCloud'
  | 'skillsFrameworks'
  | 'skillsDatabases'
  | 'skillsGeneral'
  // Demographics (EEO)
  | 'gender'
  | 'ethnicity'
  | 'race'
  | 'disability'
  // Other
  | 'hearAboutUs'
  | 'referral'
  | 'interviewAvailability'
  | 'leadershipStyle'
  | 'additionalInfo'
  | 'customQuestion'
  | 'unknown';

export interface DetectedForm {
  formElement: HTMLFormElement | null;
  fields: DetectedField[];
  submitButton: HTMLElement | null;
  platform: string;
  confidence: number;
}

// Field detection patterns
const FIELD_PATTERNS: Record<FieldType, { patterns: RegExp[]; priority: number }> = {
  email: {
    patterns: [/email/i, /e-mail/i, /mail/i],
    priority: 100,
  },
  phone: {
    patterns: [/phone/i, /tel/i, /mobile/i, /cell/i, /contact.*number/i],
    priority: 95,
  },
  firstName: {
    patterns: [/first.?name/i, /fname/i, /given.?name/i, /forename/i],
    priority: 90,
  },
  lastName: {
    patterns: [/last.?name/i, /lname/i, /surname/i, /family.?name/i],
    priority: 90,
  },
  fullName: {
    patterns: [/^name$/i, /full.?name/i, /your.?name/i, /applicant.?name/i],
    priority: 85,
  },
  linkedin: {
    patterns: [/linkedin/i, /linked.?in/i],
    priority: 95,
  },
  github: {
    patterns: [/github/i, /git.?hub/i],
    priority: 95,
  },
  portfolio: {
    patterns: [/portfolio/i, /personal.?site/i, /website/i, /url/i, /blog/i],
    priority: 80,
  },
  website: {
    patterns: [/website/i, /web.?site/i, /homepage/i],
    priority: 75,
  },
  address: {
    patterns: [/address/i, /address.?line/i],
    priority: 80,
  },
  streetAddress: {
    patterns: [/street.?address/i, /street/i, /address.?1/i, /address.?line.?1/i],
    priority: 85,
  },
  cityState: {
    patterns: [/city.*state/i, /city.*\/.*state/i, /location/i, /current.*city/i],
    priority: 90, // Higher than separate city/state
  },
  city: {
    patterns: [/^city$/i, /town/i],
    priority: 85,
  },
  state: {
    patterns: [/^state$/i, /province/i, /^region$/i],
    priority: 85,
  },
  zip: {
    patterns: [/^zip$/i, /zip.?code/i],
    priority: 85,
  },
  zipCode: {
    patterns: [/zip.?code/i, /zipcode/i],
    priority: 86,
  },
  postalCode: {
    patterns: [/postal/i, /postcode/i, /post.?code/i],
    priority: 84,
  },
  country: {
    patterns: [/country/i, /nation/i],
    priority: 85,
  },
  resume: {
    patterns: [/resume/i, /cv/i, /curriculum/i],
    priority: 100,
  },
  coverLetter: {
    patterns: [/cover.?letter/i, /covering.?letter/i, /letter/i],
    priority: 90,
  },
  currentCompany: {
    patterns: [
      /current.*company/i,
      /most.*recent.*company/i,
      /employer/i,
      /company.?name/i,
      /organization/i,
      /present.*company/i,
    ],
    priority: 80,
  },
  currentTitle: {
    patterns: [
      /current.*title/i,
      /most.*recent.*title/i,
      /job.?title/i,
      /position/i,
      /desired.*title/i,
      /desired.*role/i,
      /present.*title/i,
    ],
    priority: 80,
  },
  yearsExperience: {
    patterns: [/years?.?(?:of)?.?experience/i, /experience.?years/i, /yoe/i],
    priority: 85,
  },
  startDate: {
    patterns: [/start.?date/i, /available.*date/i, /earliest/i, /when.?can/i, /availability/i],
    priority: 80,
  },
  employmentDates: {
    patterns: [/dates.*employment/i, /employment.*dates/i, /dates.*recent/i, /work.*dates/i],
    priority: 85,
  },
  salary: {
    patterns: [/salary/i, /compensation/i, /pay/i, /wage/i, /base.*salary/i],
    priority: 85,
  },
  salaryExpectation: {
    patterns: [
      /salary.?expect/i,
      /expected.?salary/i,
      /desired.?salary/i,
      /target.*rate/i,
      /consulting.*rate/i,
    ],
    priority: 90,
  },
  desiredPay: {
    patterns: [/desired.*pay/i, /expected.*pay/i, /pay.*expectation/i, /rate/i],
    priority: 85,
  },
  workAuthorization: {
    patterns: [/work.?auth/i, /authorized/i, /legal.?right/i, /eligible/i, /permit/i],
    priority: 95,
  },
  sponsorship: {
    patterns: [/sponsor/i, /h1b/i, /immigration/i],
    priority: 95,
  },
  citizenship: {
    patterns: [/citizen/i, /us.?citizen/i, /citizenship/i, /national/i],
    priority: 95,
  },
  securityClearance: {
    patterns: [/security.?clearance/i, /clearance/i, /secret/i, /top.?secret/i, /ts.?sci/i],
    priority: 90,
  },
  veteranStatus: {
    patterns: [/veteran/i, /military/i, /armed.?forces/i, /service.?member/i],
    priority: 85,
  },
  willingToRelocate: {
    patterns: [/relocat/i, /move/i, /willing.?to.?move/i],
    priority: 85,
  },
  remotePreference: {
    patterns: [/remote/i, /work.?from.?home/i, /wfh/i, /hybrid/i, /on.?site/i],
    priority: 80,
  },
  canCommute: {
    patterns: [/commute/i, /travel.?to/i, /able.?to.?commute/i, /reliably.?commute/i],
    priority: 80,
  },
  preferredRegions: {
    patterns: [
      /preferred.*region/i,
      /location.*prefer/i,
      /work.*location/i,
      /target.*location/i,
      /preferred.*location/i,
    ],
    priority: 85,
  },
  desiredRoles: {
    patterns: [
      /desired.*title/i,
      /desired.*role/i,
      /target.*role/i,
      /position.*interest/i,
      /role.*interest/i,
      /job.*title.*interest/i,
    ],
    priority: 85,
  },
  availableDate: {
    patterns: [
      /available.*date/i,
      /start.*date/i,
      /when.*start/i,
      /earliest.*date/i,
      /availab.*start/i,
    ],
    priority: 85,
  },
  // Education
  education: {
    patterns: [/education/i, /school/i, /academic/i],
    priority: 75,
  },
  highestEducation: {
    patterns: [
      /highest.*education/i,
      /education.*level/i,
      /highest.*degree/i,
      /education.*obtained/i,
    ],
    priority: 85,
  },
  degree: {
    patterns: [/degree/i, /qualification/i, /bachelor/i, /master/i, /phd/i, /doctorate/i],
    priority: 80,
  },
  university: {
    patterns: [/university/i, /college/i, /institution/i, /school.?name/i],
    priority: 75,
  },
  // Demographics (EEO)
  gender: {
    patterns: [/^gender/i, /sex$/i, /male.*female/i],
    priority: 70,
  },
  ethnicity: {
    patterns: [/ethnicity/i, /ethnic/i],
    priority: 70,
  },
  race: {
    patterns: [/^race/i, /racial/i],
    priority: 70,
  },
  disability: {
    patterns: [/disability/i, /disabled/i, /handicap/i],
    priority: 70,
  },
  hearAboutUs: {
    patterns: [/hear.?about/i, /how.?did.?you/i, /source/i],
    priority: 70,
  },
  referral: {
    patterns: [/referr/i, /who.?referred/i, /referred.?by/i],
    priority: 75,
  },
  responsibilities: {
    patterns: [
      /responsibilit/i,
      /duties/i,
      /summary.*responsibilities/i,
      /job.*description/i,
      /what.*you.*do/i,
    ],
    priority: 75,
  },
  yearsExperienceSpecific: {
    patterns: [
      /years.*experience.*with/i,
      /how.?many.?years.*experience/i,
      /years.*working.*with/i,
    ],
    priority: 85,
  },
  skillsLanguages: {
    patterns: [
      /technical.*skills.*language/i,
      /programming.*language/i,
      /coding.*language/i,
      /skills.*language/i,
    ],
    priority: 85,
  },
  skillsCloud: {
    patterns: [/cloud.*devops/i, /devops/i, /cloud.*skills/i, /infrastructure/i, /aws.*azure/i],
    priority: 85,
  },
  skillsFrameworks: {
    patterns: [/framework/i, /libraries/i, /skills.*framework/i, /skills.*tools/i],
    priority: 80,
  },
  skillsDatabases: {
    patterns: [/database/i, /sql/i, /data.*storage/i, /skills.*database/i],
    priority: 85,
  },
  skillsGeneral: {
    patterns: [/technical.*skills/i, /technologies/i, /tech.*stack/i],
    priority: 70,
  },
  interviewAvailability: {
    patterns: [
      /interview.*availab/i,
      /availab.*interview/i,
      /when.*interview/i,
      /schedule.*interview/i,
    ],
    priority: 75,
  },
  leadershipStyle: {
    patterns: [/hands.?on.*leadership/i, /leadership.*style/i, /management.*style/i, /lead.*vs/i],
    priority: 75,
  },
  additionalInfo: {
    patterns: [
      /anything.*else/i,
      /additional.*info/i,
      /other.*info/i,
      /comments/i,
      /notes/i,
      /tell.*us.*more/i,
    ],
    priority: 60,
  },
  customQuestion: {
    patterns: [],
    priority: 0,
  },
  unknown: {
    patterns: [],
    priority: 0,
  },
};

/**
 * Wait for SPA-rendered forms to load, then detect fields.
 * Workday, Greenhouse, and modern ATS use React/Angular that render after page load.
 */
export async function waitForFormFields(timeoutMs: number = 5000): Promise<DetectedForm> {
  // First try immediately
  const form = detectFormFields();
  if (form.fields.length >= 3 && form.confidence >= 50) {
    return form;
  }

  // Wait for dynamic content to render (SPA-aware)
  return new Promise<DetectedForm>((resolve) => {
    let resolved = false;
    let retryCount = 0;
    const maxRetries = Math.floor(timeoutMs / 500);
    let interval: ReturnType<typeof setInterval> | null = null;

    const settle = (result: DetectedForm) => {
      if (resolved) return;
      resolved = true;
      observer.disconnect();
      if (interval) clearInterval(interval);
      resolve(result);
    };

    const tryDetect = () => {
      if (resolved) return;
      retryCount++;

      const detected = detectFormFields();
      if (detected.fields.length >= 3 && detected.confidence >= 50) {
        settle(detected);
        return;
      }

      if (retryCount >= maxRetries) {
        settle(detected);
      }
    };

    // Watch for DOM mutations (new form elements being added)
    const observer = new MutationObserver(() => {
      tryDetect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Also retry on intervals for frameworks that batch updates
    interval = setInterval(() => {
      tryDetect();
    }, 500);

    // Timeout safety
    setTimeout(() => {
      settle(detectFormFields());
    }, timeoutMs);
  });
}

/**
 * Detect all form fields on the current page
 */
export function detectFormFields(): DetectedForm {
  const fields: DetectedField[] = [];

  // Find all input elements
  const inputs = document.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');

  for (const input of inputs) {
    // Skip invisible elements
    if (!isVisible(input)) continue;

    // Skip checkbox/radio inputs that are part of selection groups
    // These have numeric values and are options, not fillable fields
    const inputType = (input as HTMLInputElement).type;
    if ((inputType === 'checkbox' || inputType === 'radio') && input.value) {
      // Skip if value is purely numeric (selection option ID)
      if (/^\d+$/.test(input.value)) continue;
      // Skip if it's part of a checkbox array (name ends with [])
      if (input.name?.endsWith('[]')) continue;
    }

    const field = classifyField(input);
    if (field) {
      fields.push(field);
    }
  }

  // Find the form element
  const formElement = findFormElement(fields);

  // Find submit button
  const submitButton = findSubmitButton(formElement);

  // Detect platform
  const platform = detectPlatform();

  // Calculate overall confidence
  const confidence = calculateConfidence(fields);

  return {
    formElement,
    fields,
    submitButton,
    platform,
    confidence,
  };
}

/**
 * Classify a single field
 */
function classifyField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): DetectedField | null {
  const name = element.name?.toLowerCase() || '';
  const id = element.id?.toLowerCase() || '';
  const placeholder = ('placeholder' in element ? element.placeholder : '')?.toLowerCase() || '';
  const label = findLabel(element)?.toLowerCase() || '';
  const type = (element as HTMLInputElement).type?.toLowerCase() || '';
  const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
  const dataTestId = element.getAttribute('data-testid')?.toLowerCase() || '';

  // Combine all text for matching
  const allText = [name, id, placeholder, label, ariaLabel, dataTestId].join(' ');

  // Special handling for input types
  if (type === 'email') {
    return createField(element, 'email', label || 'Email', 100);
  }

  if (type === 'tel') {
    return createField(element, 'phone', label || 'Phone', 100);
  }

  if (type === 'file') {
    if (/resume|cv/i.test(allText)) {
      return createField(element, 'resume', label || 'Resume', 95);
    }
    if (/cover/i.test(allText)) {
      return createField(element, 'coverLetter', label || 'Cover Letter', 90);
    }
  }

  // Check against patterns
  let bestMatch: { type: FieldType; confidence: number } = { type: 'unknown', confidence: 0 };

  for (const [fieldType, config] of Object.entries(FIELD_PATTERNS)) {
    if (fieldType === 'unknown' || fieldType === 'customQuestion') continue;

    for (const pattern of config.patterns) {
      if (pattern.test(allText)) {
        const confidence = config.priority;
        if (confidence > bestMatch.confidence) {
          bestMatch = { type: fieldType as FieldType, confidence };
        }
        break;
      }
    }
  }

  // If we found a match with reasonable confidence
  if (bestMatch.confidence >= 60) {
    return createField(element, bestMatch.type, label || name || id, bestMatch.confidence);
  }

  // Check if it's a textarea (likely a question/essay field)
  if (element.tagName === 'TEXTAREA') {
    return createField(element, 'customQuestion', label || 'Question', 50);
  }

  // If it has a label, treat as custom question
  if (label && label.length > 5) {
    return createField(element, 'customQuestion', label, 40);
  }

  // Unknown field
  if (name || id || label) {
    return createField(element, 'unknown', label || name || id, 20);
  }

  return null;
}

/**
 * Create a DetectedField object
 */
function createField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  type: FieldType,
  label: string,
  confidence: number
): DetectedField {
  return {
    element,
    type,
    label: label ? label.charAt(0).toUpperCase() + label.slice(1) : '',
    name: element.name || '',
    id: element.id || '',
    placeholder: ('placeholder' in element ? element.placeholder : '') || '',
    isRequired: element.required || element.getAttribute('aria-required') === 'true',
    currentValue: element.value || '',
    confidence,
  };
}

/**
 * Find label for an input element
 */
function findLabel(element: HTMLElement): string {
  // Check for associated label
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label?.textContent) {
      return label.textContent.trim();
    }
  }

  // Check for parent label
  const parentLabel = element.closest('label');
  if (parentLabel?.textContent) {
    return parentLabel.textContent.replace(element.textContent || '', '').trim();
  }

  // Check for preceding sibling label
  const prevSibling = element.previousElementSibling;
  if (prevSibling?.tagName === 'LABEL') {
    return prevSibling.textContent?.trim() || '';
  }

  // Check for aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Check for aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return labelEl.textContent.trim();
  }

  // Check for nearby text
  const parent = element.parentElement;
  if (parent) {
    const text = parent.textContent?.trim() || '';
    if (text.length < 100) {
      return text.replace(element.textContent || '', '').trim();
    }
  }

  return '';
}

/**
 * Check if element is visible
 */
function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/**
 * Find the form element containing the fields
 */
function findFormElement(fields: DetectedField[]): HTMLFormElement | null {
  if (fields.length === 0) return null;

  // Find common form ancestor
  const forms = new Map<HTMLFormElement, number>();

  for (const field of fields) {
    const form = field.element.closest('form');
    if (form) {
      forms.set(form, (forms.get(form) || 0) + 1);
    }
  }

  // Return form with most fields
  let bestForm: HTMLFormElement | null = null;
  let maxFields = 0;

  for (const [form, count] of forms) {
    if (count > maxFields) {
      maxFields = count;
      bestForm = form;
    }
  }

  return bestForm;
}

/**
 * Find submit button
 */
function findSubmitButton(form: HTMLFormElement | null): HTMLElement | null {
  const container = form || document.body;

  // Look for submit buttons
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    '[data-testid*="submit"]',
    '[data-testid*="apply"]',
    '.submit-button',
    '.apply-button',
    '#submit',
    '#apply',
  ];

  for (const selector of submitSelectors) {
    try {
      const button = container.querySelector(selector);
      if (button && isVisible(button as HTMLElement)) {
        return button as HTMLElement;
      }
    } catch {
      // Expected: :contains() pseudo-selector is not valid CSS, skip
    }
  }

  // Fallback: find buttons with submit-like text
  const buttons = container.querySelectorAll('button, input[type="button"]');
  for (const button of buttons) {
    const text = button.textContent?.toLowerCase() || '';
    if (/(submit|apply|send|continue|next)/i.test(text)) {
      if (isVisible(button as HTMLElement)) {
        return button as HTMLElement;
      }
    }
  }

  return null;
}

/**
 * Detect the job platform
 */
function detectPlatform(): string {
  const hostname = window.location.hostname.toLowerCase();

  if (hostname.includes('linkedin')) return 'LinkedIn';
  if (hostname.includes('indeed')) return 'Indeed';
  if (hostname.includes('greenhouse')) return 'Greenhouse';
  if (hostname.includes('lever')) return 'Lever';
  if (hostname.includes('workday')) return 'Workday';
  if (hostname.includes('dice')) return 'Dice';
  if (hostname.includes('monster')) return 'Monster';
  if (hostname.includes('ziprecruiter')) return 'ZipRecruiter';
  if (hostname.includes('glassdoor')) return 'Glassdoor';
  if (hostname.includes('angel.co') || hostname.includes('wellfound')) return 'Wellfound';
  if (hostname.includes('builtin')) return 'BuiltIn';

  return 'Unknown';
}

/**
 * Calculate overall form detection confidence
 */
function calculateConfidence(fields: DetectedField[]): number {
  if (fields.length === 0) return 0;

  // Must have at least name and email for a valid application form
  const hasEmail = fields.some((f) => f.type === 'email');
  const hasName = fields.some((f) => ['firstName', 'lastName', 'fullName'].includes(f.type));

  if (!hasEmail || !hasName) return 30;

  // Calculate average field confidence
  const avgConfidence = fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length;

  // Bonus for having more recognized fields
  const recognizedFields = fields.filter(
    (f) => f.type !== 'unknown' && f.type !== 'customQuestion'
  );
  const recognitionBonus = Math.min(20, recognizedFields.length * 3);

  return Math.min(100, avgConfidence + recognitionBonus);
}

/**
 * Get field types that are commonly required
 */
export function getRequiredFieldTypes(): FieldType[] {
  return ['email', 'firstName', 'lastName', 'phone', 'resume'];
}
