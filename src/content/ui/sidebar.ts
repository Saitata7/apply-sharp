/**
 * Simplify-style Sidebar UI
 * Draggable vertical panel on right edge
 */

import type { ExtractedJob, JobPlatform } from '@shared/types/job.types';
import type { ATSScore } from '@core/ats/matcher';
import {
  scanRequirements,
  parseSponsorshipStatus,
  type RequirementGap,
  type UserRequirementProfile,
} from '@core/ats/requirement-scanner';
import type { SponsorshipStatus } from '@shared/types/job.types';
import { escapeHtml } from '@shared/utils/dom-utils';
import { extractDeadlineFromJD } from '@core/jobs/deadline-extractor';

let overlayElement: HTMLElement | null = null;
let isMinimized = false;
let currentJob: ExtractedJob | null = null;
let currentScore: ATSScore | null = null;
let isDragging = false;
let dragStartY = 0;
let panelStartTop = 0;

// Export state for debugging and extension communication
export function getSidebarState() {
  return { isExpanded: !isMinimized, currentJob, currentScore, isVisible: !!overlayElement };
}

export function showSidebar(job: ExtractedJob, platform: JobPlatform): void {
  currentJob = job;
  hideSidebar();

  overlayElement = createOverlayElement(job, platform);
  document.body.appendChild(overlayElement);

  // Load saved position or use default
  const savedTop = sessionStorage.getItem('jp-panel-top');
  if (savedTop) {
    overlayElement.style.top = savedTop;
  }

  // Animate in from right
  requestAnimationFrame(() => {
    if (overlayElement) {
      overlayElement.style.transform = 'translateX(0)';
    }
  });

  // Auto-extract deadline from JD
  if (job.description) {
    const extracted = extractDeadlineFromJD(job.description);
    if (extracted) {
      currentJob.applicationDeadline = extracted;
    }
  }
  renderDeadline(overlayElement, currentJob.applicationDeadline ?? null);
  attachDeadlineListeners(overlayElement);

  // Scan for requirement gaps (async, updates UI when done)
  scanAndShowRequirementGaps().catch((err) => {
    console.debug('[Sidebar] Requirement gap scan failed:', err);
  });
}

export function hideSidebar(): void {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

export function updateATSScore(
  score: ATSScore & {
    highPriority?: { matched: string[]; missing: string[] };
    lowPriority?: { matched: string[]; missing: string[] };
    keywordSource?: 'ai' | 'library';
    suggestions?: string[];
    backgroundMismatch?: boolean;
    backgroundMismatchMessage?: string;
    detectedJobBackground?: string | null;
    layeredAnalysis?: {
      background?: { detected: string | null; confidence: number };
      role?: { detectedRole: string | null; matchScore: number };
    };
  }
): void {
  currentScore = score;

  if (!overlayElement) return;

  const scoreEl = overlayElement.querySelector('#jp-ats-score');
  const scoreCircle = overlayElement.querySelector('#jp-score-circle');
  const matchedEl = overlayElement.querySelector('#jp-matched-keywords');
  const missingEl = overlayElement.querySelector('#jp-missing-keywords');
  const analyzeBtn = overlayElement.querySelector('#jp-analyze-btn') as HTMLButtonElement;

  // If background mismatch, show "--" instead of score
  const hasBackgroundMismatch = score.backgroundMismatch === true;

  if (scoreEl) {
    scoreEl.textContent = hasBackgroundMismatch ? '--' : `${score.overallScore}%`;
  }

  if (scoreCircle) {
    scoreCircle.className = 'jp-score-circle';
    if (hasBackgroundMismatch) {
      scoreCircle.classList.add('jp-score-mismatch');
    } else if (score.overallScore >= 80) {
      scoreCircle.classList.add('jp-score-high');
    } else if (score.overallScore >= 60) {
      scoreCircle.classList.add('jp-score-medium');
    } else {
      scoreCircle.classList.add('jp-score-low');
    }
  }

  // Check if we have AI-extracted high/low priority keywords
  const hasAIKeywords = score.highPriority || score.lowPriority;

  if (matchedEl) {
    if (hasAIKeywords) {
      // Show High Priority matched first, then Low Priority
      let html = '';
      if (score.highPriority?.matched?.length) {
        html += `<span class="jp-priority-label">High:</span> `;
        html += score.highPriority.matched
          .slice(0, 5)
          .map((k) => `<span class="jp-tag jp-tag-match jp-tag-high">${escapeHtml(k)}</span>`)
          .join('');
      }
      if (score.lowPriority?.matched?.length) {
        if (html) html += ' ';
        html += `<span class="jp-priority-label">Low:</span> `;
        html += score.lowPriority.matched
          .slice(0, 3)
          .map((k) => `<span class="jp-tag jp-tag-match jp-tag-low">${escapeHtml(k)}</span>`)
          .join('');
      }
      matchedEl.innerHTML = html || '<span class="jp-tag jp-tag-placeholder">None found</span>';
    } else {
      const keywords = score.matchedKeywords || [];
      matchedEl.innerHTML =
        keywords.length > 0
          ? keywords
              .slice(0, 6)
              .map((k) => `<span class="jp-tag jp-tag-match">${escapeHtml(k)}</span>`)
              .join('')
          : '<span class="jp-tag jp-tag-placeholder">None found</span>';
    }
  }

  if (missingEl) {
    if (hasAIKeywords) {
      // Show High Priority missing first (these are critical!), then Low Priority
      let html = '';
      if (score.highPriority?.missing?.length) {
        html += `<span class="jp-priority-label" style="color:#ef4444;">Must Add:</span> `;
        html += score.highPriority.missing
          .slice(0, 4)
          .map((k) => `<span class="jp-tag jp-tag-missing jp-tag-high">${escapeHtml(k)}</span>`)
          .join('');
      }
      if (score.lowPriority?.missing?.length) {
        if (html) html += ' ';
        html += `<span class="jp-priority-label" style="color:#f59e0b;">Nice:</span> `;
        html += score.lowPriority.missing
          .slice(0, 3)
          .map((k) => `<span class="jp-tag jp-tag-missing jp-tag-low">${escapeHtml(k)}</span>`)
          .join('');
      }
      missingEl.innerHTML = html || '<span class="jp-tag jp-tag-placeholder">All matched!</span>';
    } else {
      const keywords = score.missingKeywords || [];
      missingEl.innerHTML =
        keywords.length > 0
          ? keywords
              .slice(0, 6)
              .map((k) => `<span class="jp-tag jp-tag-missing">${escapeHtml(k)}</span>`)
              .join('')
          : '<span class="jp-tag jp-tag-placeholder">All matched!</span>';
    }
  }

  // Reset analyze button - show AI indicator if AI was used
  if (analyzeBtn) {
    analyzeBtn.textContent = score.keywordSource === 'ai' ? 'AI Analyzed ✓' : 'Re-analyze (AI)';
    analyzeBtn.disabled = false;
  }

  // Show background mismatch warning prominently (always visible)
  const mismatchSection = overlayElement.querySelector('#jp-mismatch-section') as HTMLElement;
  const mismatchContent = overlayElement.querySelector('#jp-mismatch-content');

  if (mismatchSection && mismatchContent) {
    if (score.backgroundMismatch && score.backgroundMismatchMessage) {
      mismatchSection.style.display = 'block';
      mismatchContent.innerHTML = `
        <div class="jp-mismatch-icon">⚠️</div>
        <div class="jp-mismatch-text">
          <strong>Background Mismatch</strong>
          <span>${escapeHtml(score.backgroundMismatchMessage)}</span>
        </div>
      `;
    } else {
      mismatchSection.style.display = 'none';
    }
  }

  // Update insights section (role detection, suggestions) - collapsible
  const insightsSection = overlayElement.querySelector('#jp-insights-section') as HTMLElement;
  const insightsList = overlayElement.querySelector('#jp-insights-list') as HTMLElement;
  const insightsCount = overlayElement.querySelector('#jp-insights-count');

  if (insightsSection && insightsList) {
    const insights: string[] = [];

    // Show detected role
    if (score.layeredAnalysis?.role?.detectedRole) {
      insights.push(`📋 Role: ${score.layeredAnalysis.role.detectedRole}`);
    }

    // Show detected background
    if (score.layeredAnalysis?.background?.detected) {
      insights.push(
        `🎓 Background: ${formatBackground(score.layeredAnalysis.background.detected)}`
      );
    }

    // Show top suggestions (filter out the background mismatch one)
    if (score.suggestions && score.suggestions.length > 0) {
      const otherSuggestions = score.suggestions
        .filter((s) => !s.includes('Background Mismatch'))
        .slice(0, 3);
      insights.push(...otherSuggestions);
    }

    if (insights.length > 0) {
      insightsSection.style.display = 'block';
      if (insightsCount) {
        insightsCount.textContent = `(${insights.length})`;
      }
      insightsList.innerHTML = insights
        .map((insight) => {
          return `<div class="jp-insight-item jp-insight-info">${escapeHtml(insight)}</div>`;
        })
        .join('');
    } else {
      insightsSection.style.display = 'none';
    }
  }
}

function formatBackground(background: string): string {
  const names: Record<string, string> = {
    'computer-science': 'Software/Tech',
    'data-analytics': 'Data Analytics',
    'mba-business': 'Business/MBA',
    engineering: 'Engineering',
    design: 'Design/Creative',
    marketing: 'Marketing',
    healthcare: 'Healthcare',
    finance: 'Finance',
    legal: 'Legal',
    education: 'Education',
  };
  return names[background] || background;
}

/**
 * Update the requirement gaps section based on JD analysis
 */
export function updateRequirementGaps(gaps: RequirementGap[]): void {
  if (!overlayElement) return;

  const gapsSection = overlayElement.querySelector('#jp-gaps-section') as HTMLElement;
  const gapsList = overlayElement.querySelector('#jp-gaps-list');

  if (!gapsSection || !gapsList) return;

  if (gaps.length === 0) {
    // No gaps - hide section or show "all good"
    gapsSection.style.display = 'none';
    return;
  }

  // Show the section
  gapsSection.style.display = 'block';

  // Generate HTML for gaps
  const gapsHTML = gaps
    .map((gap) => {
      const icon = gap.userStatus === 'risk' ? '🚨' : '⚠️';
      const statusClass = gap.userStatus === 'risk' ? 'jp-gap-risk' : 'jp-gap-unknown';
      const userText = gap.userValue
        ? ` - You: ${escapeHtml(gap.userValue)}`
        : ' - Not set in profile';

      return `
      <div class="jp-gap-item ${statusClass}">
        <span class="jp-gap-icon">${icon}</span>
        <span class="jp-gap-text">
          <span class="jp-gap-req">${escapeHtml(gap.jdRequirement)}</span>
          <span class="jp-gap-user">${userText}</span>
        </span>
      </div>
    `;
    })
    .join('');

  gapsList.innerHTML = gapsHTML;
}

function updateSponsorshipBadge(status: SponsorshipStatus): void {
  if (!overlayElement) return;
  const badge = overlayElement.querySelector('#jp-sponsorship-badge') as HTMLElement;
  if (!badge) return;

  if (status === 'not_available') {
    badge.className = 'jp-badge jp-badge-no-sponsor';
    badge.textContent = 'No Visa Sponsorship';
    badge.style.display = '';
  } else if (status === 'available') {
    badge.className = 'jp-badge jp-badge-sponsor';
    badge.textContent = 'Sponsors Visa';
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function formatDeadlineDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function renderDeadline(overlay: HTMLElement, deadline: Date | null): void {
  const row = overlay.querySelector('#jp-deadline-row') as HTMLElement;
  const label = overlay.querySelector('#jp-deadline-label') as HTMLElement;
  if (!row || !label) return;
  if (!deadline) {
    row.style.display = 'none';
    return;
  }
  row.style.display = 'flex';
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  const urgencyClass =
    daysLeft <= 3 ? 'jp-deadline-urgent' : daysLeft <= 7 ? 'jp-deadline-soon' : 'jp-deadline-ok';
  const countdownText =
    daysLeft < 0
      ? '(passed)'
      : daysLeft === 0
        ? '(today!)'
        : daysLeft === 1
          ? '(tomorrow)'
          : `(${daysLeft}d left)`;
  label.textContent = `Due ${formatDeadlineDate(deadline)} ${countdownText}`;
  row.className = `jp-deadline-row ${urgencyClass}`;
}

function attachDeadlineListeners(overlay: HTMLElement): void {
  const editBtn = overlay.querySelector('#jp-deadline-edit-btn');
  const saveBtn = overlay.querySelector('#jp-deadline-save-btn');
  const cancelBtn = overlay.querySelector('#jp-deadline-cancel-btn');
  const inputRow = overlay.querySelector('#jp-deadline-input-row') as HTMLElement;
  const deadlineRow = overlay.querySelector('#jp-deadline-row') as HTMLElement;
  const input = overlay.querySelector('#jp-deadline-input') as HTMLInputElement;

  editBtn?.addEventListener('click', () => {
    if (inputRow) inputRow.style.display = 'flex';
    if (currentJob?.applicationDeadline) {
      const d = new Date(currentJob.applicationDeadline);
      input.value = d.toISOString().split('T')[0];
    }
  });

  cancelBtn?.addEventListener('click', () => {
    if (inputRow) inputRow.style.display = 'none';
  });

  saveBtn?.addEventListener('click', () => {
    const trimmedValue = input.value?.trim();
    if (!trimmedValue || !currentJob) return;
    const parsed = new Date(trimmedValue);
    if (isNaN(parsed.getTime())) return;
    currentJob.applicationDeadline = parsed;
    renderDeadline(overlay, currentJob.applicationDeadline);
    if (inputRow) inputRow.style.display = 'none';
    // Show the deadline row if it was hidden (no auto-detected deadline)
    if (deadlineRow) deadlineRow.style.display = 'flex';
  });

  // Also add a "Set deadline" link when no deadline is shown
  if (!currentJob?.applicationDeadline) {
    if (deadlineRow) {
      deadlineRow.style.display = 'flex';
      deadlineRow.className = 'jp-deadline-row jp-deadline-empty';
      const label = overlay.querySelector('#jp-deadline-label') as HTMLElement;
      if (label) label.textContent = 'No deadline detected';
    }
  }
}

/**
 * Scan the current job for requirement gaps
 * Call this after showing the sidebar and getting the user profile
 */
export async function scanAndShowRequirementGaps(): Promise<void> {
  if (!currentJob || !currentJob.description) return;

  try {
    // Get user profile data for comparison
    const profileResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MASTER_PROFILE' });

    if (!profileResponse?.success || !profileResponse.data) {
      console.log('[ApplySharp] No profile for requirement gap analysis');
      return;
    }

    const profile = profileResponse.data;
    const autofillData = profile.autofillData || {};

    // Build user requirement profile for comparison
    const userProfile: UserRequirementProfile = {
      workAuthorization: autofillData.workAuthorization,
      requiresSponsorship: autofillData.requiresSponsorship,
      securityClearance: autofillData.securityClearance,
      canPassBackgroundCheck: autofillData.canPassBackgroundCheck,
      canPassDrugTest: autofillData.canPassDrugTest,
      languages: autofillData.languages,
      city: autofillData.city || profile.personal?.location?.city,
      state: autofillData.state || profile.personal?.location?.state,
      willingToRelocate: autofillData.willingToRelocate,
      remotePreference: autofillData.remotePreference,
    };

    // Scan the JD for requirements
    const gaps = scanRequirements(currentJob.description, userProfile);

    // Update the UI
    updateRequirementGaps(gaps);

    // Detect and show sponsorship status
    const sponsorStatus = parseSponsorshipStatus(currentJob.description);
    updateSponsorshipBadge(sponsorStatus);

    console.log('[ApplySharp] Requirement gaps found:', gaps.length);
  } catch (error) {
    console.error('[ApplySharp] Failed to scan requirement gaps:', error);
  }
}

function createOverlayElement(job: ExtractedJob, platform: JobPlatform): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = 'applysharp-overlay';
  overlay.style.transform = 'translateX(100%)';

  overlay.innerHTML = `
    <style>${getOverlayStyles()}</style>

    <!-- Minimized State - Vertical Tab -->
    <div class="jp-minimized" id="jp-minimized" style="display: none;">
      <div class="jp-mini-drag" id="jp-mini-drag">
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor" opacity="0.5">
          <circle cx="2" cy="2" r="1.5"/><circle cx="6" cy="2" r="1.5"/>
          <circle cx="2" cy="7" r="1.5"/><circle cx="6" cy="7" r="1.5"/>
          <circle cx="2" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/>
        </svg>
      </div>
      <div class="jp-mini-score" id="jp-mini-score">--</div>
      <div class="jp-mini-label">ATS</div>
    </div>

    <!-- Expanded State -->
    <div class="jp-expanded" id="jp-expanded">
      <!-- Drag Handle -->
      <div class="jp-drag-handle" id="jp-drag-handle">
        <svg width="20" height="6" viewBox="0 0 20 6" fill="currentColor" opacity="0.4">
          <circle cx="2" cy="2" r="1.5"/><circle cx="7" cy="2" r="1.5"/><circle cx="12" cy="2" r="1.5"/><circle cx="17" cy="2" r="1.5"/>
        </svg>
      </div>

      <!-- Header -->
      <div class="jp-header">
        <span class="jp-title">ApplySharp</span>
        <div class="jp-header-actions">
          <button class="jp-icon-btn" id="jp-minimize-btn" title="Minimize">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9,6 15,12 9,18"/>
            </svg>
          </button>
          <button class="jp-icon-btn" id="jp-close-btn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="jp-body">
        <!-- Job Info -->
        <div class="jp-job-info">
          <div class="jp-job-title">${escapeHtml(job.title)}</div>
          <div class="jp-job-company">${escapeHtml(job.company)}</div>
          <div class="jp-job-meta">
            <span class="jp-badge jp-badge-platform">${capitalize(platform)}</span>
            ${job.location ? `<span class="jp-badge">${escapeHtml(job.location)}</span>` : ''}
            <span id="jp-sponsorship-badge" style="display:none;"></span>
          </div>
          <div class="jp-deadline-row" id="jp-deadline-row" style="display:none;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span id="jp-deadline-label"></span>
            <button class="jp-deadline-edit-btn" id="jp-deadline-edit-btn" title="Edit deadline">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
          </div>
          <div class="jp-deadline-input-row" id="jp-deadline-input-row" style="display:none;">
            <input type="date" id="jp-deadline-input" class="jp-deadline-input" />
            <button class="jp-btn-xs" id="jp-deadline-save-btn">Set</button>
            <button class="jp-btn-xs jp-btn-ghost" id="jp-deadline-cancel-btn">Cancel</button>
          </div>
        </div>

        <!-- ATS Score -->
        <div class="jp-score-section">
          <div class="jp-score-row">
            <div class="jp-score-circle" id="jp-score-circle">
              <span id="jp-ats-score">--</span>
            </div>
            <div class="jp-score-details">
              <div class="jp-score-title">ATS Match Score</div>
              <button class="jp-analyze-link" id="jp-analyze-btn">Analyze Resume Match</button>
            </div>
          </div>
        </div>

        <!-- Keywords -->
        <div class="jp-keywords-section">
          <div class="jp-keyword-group">
            <div class="jp-keyword-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              Matched
            </div>
            <div class="jp-tags" id="jp-matched-keywords">
              <span class="jp-tag jp-tag-placeholder">Click analyze</span>
            </div>
          </div>
          <div class="jp-keyword-group">
            <div class="jp-keyword-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
              Missing
            </div>
            <div class="jp-tags" id="jp-missing-keywords">
              <span class="jp-tag jp-tag-placeholder">Click analyze</span>
            </div>
          </div>
        </div>

        <!-- Background Mismatch Warning (always visible if mismatch) -->
        <div class="jp-mismatch-section" id="jp-mismatch-section" style="display: none;">
          <div class="jp-mismatch-content" id="jp-mismatch-content">
            <!-- Mismatch warning will be inserted here -->
          </div>
        </div>

        <!-- Insights Section (Role, Background, Suggestions) - Collapsible -->
        <div class="jp-insights-section" id="jp-insights-section" style="display: none;">
          <div class="jp-insights-header" id="jp-insights-toggle">
            <svg class="jp-insights-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9,6 15,12 9,18"/>
            </svg>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>Insights</span>
            <span class="jp-insights-count" id="jp-insights-count"></span>
          </div>
          <div class="jp-insights-list" id="jp-insights-list" style="display: none;">
            <!-- Insights will be inserted here -->
          </div>
        </div>

        <!-- Requirement Gaps Section -->
        <div class="jp-gaps-section" id="jp-gaps-section" style="display: none;">
          <div class="jp-gaps-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Requirement Gaps</span>
          </div>
          <div class="jp-gaps-list" id="jp-gaps-list">
            <!-- Gaps will be inserted here -->
          </div>
        </div>

        <!-- Profile Section -->
        <div class="jp-profile-section">
          <div class="jp-section-label">Active Profile</div>
          <div class="jp-profile-row">
            <select class="jp-profile-select" id="jp-profile-select">
              <option value="">Loading...</option>
            </select>
            <button class="jp-profile-edit-btn" id="jp-edit-profile-btn" title="Edit Profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Profile Score Comparison (1b.4) -->
        <div class="jp-comparison-section" id="jp-comparison-section" style="display: none;">
          <div class="jp-section-label">Profile Match Scores</div>
          <div class="jp-comparison-list" id="jp-comparison-list">
            <!-- Scores loaded dynamically -->
          </div>
        </div>

        <!-- Actions -->
        <div class="jp-actions">
          <button class="jp-btn jp-btn-primary" id="jp-autofill-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/>
            </svg>
            Auto-Fill Application
          </button>
          <div class="jp-btn-row">
            <button class="jp-btn jp-btn-secondary" id="jp-cover-letter-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              Cover Letter
            </button>
            <div class="jp-save-group">
              <button class="jp-btn jp-btn-outline" id="jp-save-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <span id="jp-save-label">Save Job</span>
              </button>
              <select class="jp-status-select" id="jp-status-select" title="Job status">
                <option value="saved">Saved</option>
                <option value="interested">Interested</option>
                <option value="applied">Applied</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="jp-footer">
        <button class="jp-footer-link" id="jp-settings-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24"/>
          </svg>
          Settings
        </button>
        <span class="jp-footer-divider">|</span>
        <button class="jp-footer-link" id="jp-history-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          History
        </button>
      </div>
    </div>
  `;

  // Attach event listeners
  attachEventListeners(overlay, job, platform);

  return overlay;
}

function attachEventListeners(
  overlay: HTMLElement,
  job: ExtractedJob,
  platform: JobPlatform
): void {
  // Minimize/Expand
  overlay
    .querySelector('#jp-minimize-btn')
    ?.addEventListener('click', () => toggleMinimize(overlay, true));
  overlay.querySelector('#jp-minimized')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest('#jp-mini-drag')) {
      toggleMinimize(overlay, false);
    }
  });

  // Close
  overlay.querySelector('#jp-close-btn')?.addEventListener('click', () => hideSidebar());

  // Drag functionality
  setupDrag(overlay, '#jp-drag-handle');
  setupDrag(overlay, '#jp-mini-drag');

  // Load and handle profiles
  loadProfilesIntoSelect(overlay);

  overlay.querySelector('#jp-profile-select')?.addEventListener('change', async (e) => {
    const select = e.target as HTMLSelectElement;
    const profileId = select.value;
    if (profileId) {
      await chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_MASTER_PROFILE',
        payload: profileId,
      });
      // Re-analyze with new profile
      const btn = overlay.querySelector('#jp-analyze-btn') as HTMLButtonElement;
      btn?.click();
    }
  });

  // Edit Profile
  overlay.querySelector('#jp-edit-profile-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', payload: { tab: 'profiles' } });
  });

  // Analyze
  overlay.querySelector('#jp-analyze-btn')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#jp-analyze-btn') as HTMLButtonElement;
    const scoreEl = overlay.querySelector('#jp-ats-score');

    console.log('[ApplySharp] Re-analyze clicked, job:', job?.title, 'platform:', platform);
    console.log('[ApplySharp] Job description length:', job?.description?.length || 0);

    btn.textContent = 'Analyzing...';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_JOB',
        payload: { job, platform, useAI: true }, // Use AI for manual re-analyze
      });

      console.log('[ApplySharp] Analyze response:', response);

      if (response?.success && response.data) {
        console.log('[ApplySharp] Score:', response.data.overallScore);
        console.log(
          '[ApplySharp] Matched:',
          response.data.matchedKeywords?.length || 0,
          'keywords'
        );
        console.log(
          '[ApplySharp] Missing:',
          response.data.missingKeywords?.length || 0,
          'keywords'
        );
        updateATSScore(response.data);
      } else {
        // Show error in UI
        const errorMsg = response?.error || 'Analysis failed';
        console.error('[ApplySharp] Analysis error:', errorMsg);
        if (scoreEl) {
          scoreEl.textContent = '--';
        }
        // Show error in keywords section
        const matchedEl = overlay.querySelector('#jp-matched-keywords');
        if (matchedEl) {
          matchedEl.innerHTML = `<span class="jp-tag jp-tag-placeholder" style="color: #ef4444;">${escapeHtml(errorMsg)}</span>`;
        }
      }
    } catch (error) {
      console.error('[ApplySharp] Analysis exception:', error);
      if (scoreEl) {
        scoreEl.textContent = '--';
      }
      // Show error
      const matchedEl = overlay.querySelector('#jp-matched-keywords');
      if (matchedEl) {
        matchedEl.innerHTML = `<span class="jp-tag jp-tag-placeholder" style="color: #ef4444;">Error - check console</span>`;
      }
    } finally {
      btn.textContent = 'Re-analyze';
      btn.disabled = false;
    }
  });

  // Save Job with status
  overlay.querySelector('#jp-save-btn')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#jp-save-btn') as HTMLButtonElement;
    const statusSelect = overlay.querySelector('#jp-status-select') as HTMLSelectElement;
    const labelEl = overlay.querySelector('#jp-save-label');
    btn.disabled = true;

    try {
      const status = statusSelect?.value || 'saved';
      const sponsorshipStatus = parseSponsorshipStatus(job.description || '');
      await chrome.runtime.sendMessage({
        type: 'SAVE_JOB',
        payload: { ...job, url: window.location.href, platform, status, sponsorshipStatus },
      });

      if (labelEl) labelEl.textContent = 'Saved!';
      btn.classList.add('jp-btn-success');
    } catch (error) {
      console.error('Save failed:', error);
      btn.disabled = false;
    }
  });

  // Check if job is already saved
  checkIfJobSaved(overlay);

  // Load profile comparison scores (1b.4)
  loadProfileComparison(overlay, job);

  // Auto-Fill
  overlay.querySelector('#jp-autofill-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_AUTOFILL' });
  });

  // Cover Letter
  overlay.querySelector('#jp-cover-letter-btn')?.addEventListener('click', () => {
    chrome.runtime
      .sendMessage({
        type: 'GENERATE_COVER_LETTER',
        payload: {
          jobDescription: job.description || '',
          companyName: job.company || '',
          jobTitle: job.title || '',
        },
      })
      .catch((err) => console.warn('[ApplySharp] Cover letter request failed:', err?.message));
  });

  // Settings
  overlay.querySelector('#jp-settings-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });

  // History
  overlay.querySelector('#jp-history-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', payload: { tab: 'history' } });
  });

  // Insights toggle (collapsible)
  overlay.querySelector('#jp-insights-toggle')?.addEventListener('click', () => {
    const section = overlay.querySelector('#jp-insights-section');
    const list = overlay.querySelector('#jp-insights-list') as HTMLElement;
    if (section && list) {
      const isExpanded = section.classList.contains('jp-expanded');
      if (isExpanded) {
        section.classList.remove('jp-expanded');
        list.style.display = 'none';
      } else {
        section.classList.add('jp-expanded');
        list.style.display = 'flex';
      }
    }
  });
}

async function loadProfilesIntoSelect(overlay: HTMLElement): Promise<void> {
  const select = overlay.querySelector('#jp-profile-select') as HTMLSelectElement;
  if (!select) return;

  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      throw new Error('Extension context invalidated');
    }

    const [profilesRes, activeRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_MASTER_PROFILES' }),
      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MASTER_PROFILE' }),
    ]);

    if (profilesRes?.success && profilesRes.data) {
      const profiles = profilesRes.data as Array<{ id: string; personal?: { fullName?: string } }>;
      const activeId = activeRes?.data?.id;

      select.innerHTML =
        profiles.length > 0
          ? profiles
              .map((p) => {
                const profileName = p.personal?.fullName || 'Unnamed Profile';
                return `<option value="${escapeHtml(p.id)}" ${p.id === activeId ? 'selected' : ''}>${escapeHtml(profileName)}</option>`;
              })
              .join('')
          : '<option value="">No profiles - Create one</option>';

      if (profiles.length === 0) {
        select.addEventListener(
          'click',
          () => {
            chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS', payload: { tab: 'profiles' } });
          },
          { once: true }
        );
      }
    } else {
      select.innerHTML = '<option value="">No profiles - Create one</option>';
    }
  } catch (error) {
    const errorMessage = (error as Error)?.message || '';

    // Don't log scary errors for expected extension reload scenarios
    if (errorMessage.includes('Extension context invalidated') || !chrome.runtime?.id) {
      console.log('[ApplySharp] Extension was updated - refresh page to reconnect');
    } else {
      console.error('[ApplySharp] Failed to load profiles:', error);
    }

    // Check if extension was reloaded/updated
    if (errorMessage.includes('Extension context invalidated') || !chrome.runtime?.id) {
      select.innerHTML = '<option value="">Refresh page to reconnect</option>';
      // Add visual indicator that extension needs refresh
      const profileSection = overlay.querySelector('.jp-profile-section');
      if (profileSection) {
        const refreshHint = document.createElement('div');
        refreshHint.className = 'jp-refresh-hint';
        refreshHint.innerHTML = '⟳ Extension updated - refresh page';
        refreshHint.style.cssText =
          'font-size: 9px; color: #f59e0b; margin-top: 4px; cursor: pointer;';
        refreshHint.addEventListener('click', () => window.location.reload());
        profileSection.appendChild(refreshHint);
      }
    } else {
      select.innerHTML = '<option value="">Error loading profiles</option>';
    }
  }
}

function setupDrag(overlay: HTMLElement, handleSelector: string): void {
  const handle = overlay.querySelector(handleSelector) as HTMLElement;
  if (!handle) return;

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true;
    dragStartY = e.clientY;
    panelStartTop = overlay.offsetTop;
    overlay.style.transition = 'none';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging || !overlayElement) return;

    const deltaY = e.clientY - dragStartY;
    let newTop = panelStartTop + deltaY;

    // Constrain to viewport
    const panelHeight = overlayElement.offsetHeight;
    const minTop = 10;
    const maxTop = window.innerHeight - panelHeight - 10;
    newTop = Math.max(minTop, Math.min(maxTop, newTop));

    overlayElement.style.top = `${newTop}px`;
    overlayElement.style.transform = 'translateX(0)';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging && overlayElement) {
      isDragging = false;
      overlayElement.style.transition = 'transform 0.25s ease';
      document.body.style.userSelect = '';
      // Save position
      sessionStorage.setItem('jp-panel-top', overlayElement.style.top);
    }
  });
}

function toggleMinimize(overlay: HTMLElement, minimize: boolean): void {
  isMinimized = minimize;
  const minimized = overlay.querySelector('#jp-minimized') as HTMLElement;
  const expanded = overlay.querySelector('#jp-expanded') as HTMLElement;

  if (minimize) {
    expanded.style.display = 'none';
    minimized.style.display = 'flex';

    // Update mini score
    const miniScore = minimized.querySelector('#jp-mini-score');
    if (miniScore && currentScore) {
      miniScore.textContent = `${currentScore.overallScore}%`;
    }
  } else {
    minimized.style.display = 'none';
    expanded.style.display = 'flex';
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if the current job URL is already saved (1b.3)
 */
async function checkIfJobSaved(overlay: HTMLElement): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_JOB',
      payload: window.location.href,
    });

    if (response?.success && response.data) {
      const btn = overlay.querySelector('#jp-save-btn') as HTMLButtonElement;
      const labelEl = overlay.querySelector('#jp-save-label');
      if (btn && labelEl) {
        labelEl.textContent = 'Saved';
        btn.classList.add('jp-btn-success');
      }
    }
  } catch {
    // Job not saved or extension context invalidated - ok
  }
}

/**
 * Load ATS scores for all generated profiles and show comparison (1b.4)
 */
async function loadProfileComparison(overlay: HTMLElement, job: ExtractedJob): Promise<void> {
  if (!job.description) return;

  const section = overlay.querySelector('#jp-comparison-section') as HTMLElement;
  const list = overlay.querySelector('#jp-comparison-list') as HTMLElement;
  if (!section || !list) return;

  try {
    const profileRes = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_MASTER_PROFILE' });
    if (!profileRes?.success || !profileRes.data) return;

    const profile = profileRes.data;
    const roles = profile.generatedProfiles || [];

    // Need at least 2 profiles for comparison to be useful
    if (roles.length < 2) return;

    // Score each profile against the job description
    const scores: Array<{ name: string; id: string; score: number; isActive: boolean }> = [];

    for (const role of roles) {
      try {
        const scoreRes = await chrome.runtime.sendMessage({
          type: 'SCORE_JOB',
          payload: {
            jobDescription: job.description,
            roleProfile: role,
          },
        });

        if (scoreRes?.success && scoreRes.data) {
          scores.push({
            name: role.targetRole || 'Unnamed Role',
            id: role.id,
            score: scoreRes.data.overallScore || 0,
            isActive: role.id === profile.activeRoleProfileId,
          });
        }
      } catch {
        // Skip failed scores
      }
    }

    if (scores.length < 2) return;

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Render comparison
    section.style.display = 'block';
    list.innerHTML = scores
      .map((s, i) => {
        const scoreColor = s.score >= 80 ? '#22c55e' : s.score >= 60 ? '#f59e0b' : '#ef4444';
        const isBest = i === 0;
        return `
        <div class="jp-comparison-item ${s.isActive ? 'jp-comparison-active' : ''} ${isBest ? 'jp-comparison-best' : ''}"
             data-role-id="${escapeHtml(s.id)}">
          <span class="jp-comparison-name">${escapeHtml(s.name)}</span>
          <span class="jp-comparison-score" style="color: ${scoreColor}">${s.score}%</span>
          ${isBest ? '<span class="jp-comparison-badge">Best</span>' : ''}
        </div>
      `;
      })
      .join('');

    // Click to switch profile
    list.querySelectorAll('.jp-comparison-item').forEach((item) => {
      item.addEventListener('click', async () => {
        const roleId = (item as HTMLElement).dataset.roleId;
        if (!roleId || !profile.id) return;

        await chrome.runtime.sendMessage({
          type: 'SET_ACTIVE_ROLE_PROFILE',
          payload: { masterProfileId: profile.id, roleProfileId: roleId },
        });

        // Update active indicator
        list
          .querySelectorAll('.jp-comparison-item')
          .forEach((el) => el.classList.remove('jp-comparison-active'));
        item.classList.add('jp-comparison-active');

        // Re-analyze with new role
        const analyzeBtn = overlay.querySelector('#jp-analyze-btn') as HTMLButtonElement;
        analyzeBtn?.click();
      });
    });
  } catch {
    // Profile comparison failed - hide section
  }
}

function getOverlayStyles(): string {
  return `
    #applysharp-overlay {
      position: fixed;
      top: 100px;
      right: 0;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      transition: transform 0.25s ease;
    }

    /* Minimized State - Vertical Tab */
    .jp-minimized {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px 6px;
      background: #2563eb;
      border-radius: 8px 0 0 8px;
      box-shadow: -2px 0 10px rgba(0,0,0,0.1);
      color: white;
      cursor: pointer;
      gap: 8px;
    }

    .jp-mini-drag {
      cursor: ns-resize;
      padding: 4px 2px;
      opacity: 0.6;
    }

    .jp-mini-drag:hover {
      opacity: 1;
    }

    .jp-mini-score {
      font-size: 14px;
      font-weight: 700;
    }

    .jp-mini-label {
      font-size: 9px;
      font-weight: 600;
      opacity: 0.8;
      letter-spacing: 0.5px;
    }

    /* Expanded State */
    .jp-expanded {
      display: flex;
      flex-direction: column;
      width: 260px;
      background: white;
      border-radius: 10px 0 0 10px;
      box-shadow: -2px 0 15px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .jp-drag-handle {
      display: flex;
      justify-content: center;
      padding: 6px;
      cursor: ns-resize;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
    }

    .jp-drag-handle:hover {
      background: #f1f5f9;
    }

    .jp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: white;
      border-bottom: 1px solid #f1f5f9;
    }

    .jp-title {
      font-weight: 600;
      font-size: 12px;
      color: #1e293b;
    }

    .jp-header-actions {
      display: flex;
      gap: 2px;
    }

    .jp-icon-btn {
      background: none;
      border: none;
      padding: 4px;
      color: #94a3b8;
      cursor: pointer;
      border-radius: 4px;
    }

    .jp-icon-btn:hover {
      color: #64748b;
      background: #f1f5f9;
    }

    .jp-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      max-height: 400px;
    }

    /* Job Info */
    .jp-job-info {
      margin-bottom: 10px;
    }

    .jp-job-title {
      font-size: 12px;
      font-weight: 600;
      color: #1e293b;
      line-height: 1.3;
    }

    .jp-job-company {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }

    .jp-job-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 4px;
    }

    .jp-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      background: #f1f5f9;
      color: #475569;
    }

    .jp-badge-platform {
      background: #eff6ff;
      color: #2563eb;
    }

    .jp-badge-no-sponsor {
      background: #fee2e2;
      color: #991b1b;
    }

    .jp-badge-sponsor {
      background: #dcfce7;
      color: #166534;
    }

    /* Deadline */
    .jp-deadline-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      font-size: 12px;
      color: #6b7280;
    }
    .jp-deadline-urgent {
      color: #dc2626;
      font-weight: 600;
    }
    .jp-deadline-soon {
      color: #d97706;
      font-weight: 500;
    }
    .jp-deadline-ok {
      color: #059669;
    }
    .jp-deadline-empty {
      color: #9ca3af;
      font-style: italic;
    }
    .jp-deadline-edit-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      color: #9ca3af;
      display: flex;
      align-items: center;
    }
    .jp-deadline-edit-btn:hover {
      color: #4b5563;
    }
    .jp-deadline-input-row {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }
    .jp-deadline-input {
      font-size: 11px;
      padding: 2px 6px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      background: #fff;
      color: #374151;
    }
    .jp-btn-xs {
      font-size: 11px;
      padding: 2px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      background: #f3f4f6;
      cursor: pointer;
      color: #374151;
    }
    .jp-btn-xs:hover {
      background: #e5e7eb;
    }
    .jp-btn-ghost {
      background: transparent;
      border-color: transparent;
    }
    .jp-btn-ghost:hover {
      background: #f3f4f6;
    }

    /* Score Section */
    .jp-score-section {
      background: #f8fafc;
      margin: 0 -10px;
      padding: 10px;
      margin-bottom: 10px;
    }

    .jp-score-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .jp-score-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      background: #e2e8f0;
      color: #64748b;
    }

    .jp-score-circle.jp-score-high { background: #22c55e; color: white; }
    .jp-score-circle.jp-score-medium { background: #f59e0b; color: white; }
    .jp-score-circle.jp-score-low { background: #ef4444; color: white; }
    .jp-score-circle.jp-score-mismatch { background: #94a3b8; color: white; }

    .jp-score-title {
      font-weight: 500;
      color: #475569;
      font-size: 11px;
    }

    .jp-analyze-link {
      background: none;
      border: none;
      padding: 0;
      color: #2563eb;
      font-size: 10px;
      cursor: pointer;
    }

    .jp-analyze-link:hover { text-decoration: underline; }

    /* Keywords */
    .jp-keywords-section {
      margin-bottom: 10px;
    }

    .jp-keyword-group {
      margin-bottom: 6px;
    }

    .jp-keyword-label {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .jp-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }

    .jp-tag {
      font-size: 9px;
      padding: 2px 5px;
      border-radius: 3px;
      background: #f1f5f9;
      color: #475569;
    }

    .jp-tag-match { background: #dcfce7; color: #166534; }
    .jp-tag-missing { background: #fee2e2; color: #991b1b; }
    .jp-tag-placeholder { font-style: italic; color: #94a3b8; background: none; }
    .jp-tag-high { font-weight: 600; }
    .jp-tag-low { opacity: 0.85; }
    .jp-priority-label { font-size: 8px; font-weight: 600; color: #64748b; margin-right: 2px; }

    /* Background Mismatch Section - Always visible */
    .jp-mismatch-section {
      background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
      margin: 0 -10px 10px -10px;
      padding: 8px 10px;
      border-top: 2px solid #ef4444;
      border-bottom: 1px solid #fecaca;
    }

    .jp-mismatch-content {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .jp-mismatch-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .jp-mismatch-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 10px;
      color: #991b1b;
    }

    .jp-mismatch-text strong {
      font-size: 11px;
      color: #7f1d1d;
    }

    /* Insights Section - Collapsible */
    .jp-insights-section {
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
      margin: 0 -10px 10px -10px;
      padding: 8px 10px;
      border-top: 1px solid #c7d2fe;
      border-bottom: 1px solid #c7d2fe;
    }

    .jp-insights-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      color: #4338ca;
      cursor: pointer;
      user-select: none;
    }

    .jp-insights-header:hover {
      color: #3730a3;
    }

    .jp-insights-arrow {
      transition: transform 0.2s ease;
    }

    .jp-insights-section.jp-expanded .jp-insights-arrow {
      transform: rotate(90deg);
    }

    .jp-insights-count {
      font-weight: 400;
      color: #6366f1;
      font-size: 9px;
    }

    .jp-insights-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 6px;
    }

    .jp-insight-item {
      font-size: 10px;
      line-height: 1.3;
      padding: 4px 6px;
      background: rgba(255,255,255,0.7);
      border-radius: 4px;
      color: #3730a3;
    }

    .jp-insight-info {
      border-left: 2px solid #6366f1;
    }

    /* Requirement Gaps Section */
    .jp-gaps-section {
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
      margin: 0 -10px 10px -10px;
      padding: 8px 10px;
      border-top: 1px solid #fcd34d;
      border-bottom: 1px solid #fcd34d;
    }

    .jp-gaps-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 600;
      color: #92400e;
      margin-bottom: 6px;
    }

    .jp-gaps-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .jp-gap-item {
      display: flex;
      align-items: flex-start;
      gap: 5px;
      font-size: 10px;
      line-height: 1.3;
      padding: 4px 6px;
      background: rgba(255,255,255,0.6);
      border-radius: 4px;
    }

    .jp-gap-icon {
      flex-shrink: 0;
      font-size: 11px;
    }

    .jp-gap-text {
      color: #78350f;
    }

    .jp-gap-text .jp-gap-req {
      font-weight: 500;
    }

    .jp-gap-text .jp-gap-user {
      color: #b45309;
      font-size: 9px;
    }

    .jp-gap-risk .jp-gap-text { color: #991b1b; }
    .jp-gap-unknown .jp-gap-text { color: #78350f; }

    .jp-gaps-empty {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #15803d;
      padding: 4px;
    }

    /* Profile Section */
    .jp-profile-section {
      margin-bottom: 10px;
    }

    .jp-section-label {
      font-size: 9px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .jp-profile-row {
      display: flex;
      gap: 5px;
    }

    .jp-profile-select {
      flex: 1;
      padding: 5px 8px;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      font-size: 11px;
      color: #1e293b;
    }

    .jp-profile-select:focus {
      outline: none;
      border-color: #2563eb;
    }

    .jp-profile-edit-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      border: 1px solid #e2e8f0;
      border-radius: 5px;
      background: white;
      color: #64748b;
      cursor: pointer;
    }

    .jp-profile-edit-btn:hover {
      border-color: #2563eb;
      color: #2563eb;
    }

    /* Actions */
    .jp-actions {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .jp-btn-row {
      display: flex;
      gap: 5px;
    }

    .jp-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 8px;
      border: none;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      flex: 1;
    }

    .jp-btn svg { width: 11px; height: 11px; }

    .jp-btn-primary { background: #2563eb; color: white; }
    .jp-btn-primary:hover { background: #1d4ed8; }

    .jp-btn-secondary { background: #f1f5f9; color: #475569; }
    .jp-btn-secondary:hover { background: #e2e8f0; }

    .jp-btn-outline { background: white; border: 1px solid #e2e8f0; color: #475569; }
    .jp-btn-outline:hover { border-color: #2563eb; color: #2563eb; }

    .jp-btn-success { background: #22c55e !important; color: white !important; }

    /* Footer */
    .jp-footer {
      display: flex;
      justify-content: center;
      gap: 6px;
      padding: 6px 10px;
      border-top: 1px solid #f1f5f9;
      background: #fafafa;
    }

    .jp-footer-link {
      display: flex;
      align-items: center;
      gap: 3px;
      background: none;
      border: none;
      padding: 3px 5px;
      color: #64748b;
      font-size: 9px;
      cursor: pointer;
      border-radius: 3px;
    }

    .jp-footer-link:hover { color: #2563eb; background: #eff6ff; }
    .jp-footer-link svg { width: 9px; height: 9px; }
    .jp-footer-divider { color: #e2e8f0; }

    /* Save Group with Status Selector */
    .jp-save-group {
      display: flex;
      flex: 1;
      gap: 0;
    }

    .jp-save-group .jp-btn {
      border-radius: 5px 0 0 5px;
      flex: 1;
    }

    .jp-status-select {
      width: 26px;
      min-width: 26px;
      padding: 0 2px;
      border: 1px solid #e2e8f0;
      border-left: none;
      border-radius: 0 5px 5px 0;
      background: white;
      font-size: 9px;
      color: #64748b;
      cursor: pointer;
      appearance: none;
      text-align: center;
    }

    .jp-status-select:focus {
      outline: none;
      border-color: #2563eb;
    }

    /* Profile Score Comparison (1b.4) */
    .jp-comparison-section {
      margin-bottom: 10px;
    }

    .jp-comparison-list {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .jp-comparison-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 5px;
      background: #f8fafc;
      cursor: pointer;
      transition: background 0.15s;
    }

    .jp-comparison-item:hover {
      background: #eff6ff;
    }

    .jp-comparison-active {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
    }

    .jp-comparison-best {
      background: #f0fdf4;
    }

    .jp-comparison-best.jp-comparison-active {
      background: #dcfce7;
      border-color: #86efac;
    }

    .jp-comparison-name {
      flex: 1;
      font-size: 10px;
      color: #475569;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .jp-comparison-score {
      font-size: 11px;
      font-weight: 700;
    }

    .jp-comparison-badge {
      font-size: 8px;
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 3px;
      background: #22c55e;
      color: white;
      text-transform: uppercase;
    }

    /* Scrollbar */
    .jp-body::-webkit-scrollbar { width: 3px; }
    .jp-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 2px; }
  `;
}
