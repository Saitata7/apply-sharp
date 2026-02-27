import type { ExtractedJob, JobPlatform } from '@shared/types/job.types';
import { escapeHtml } from '@shared/utils/dom-utils';

let overlayElement: HTMLElement | null = null;
let isMinimized = false;

export function showOverlay(job: ExtractedJob, platform: JobPlatform): void {
  // Remove existing overlay if present
  hideOverlay();

  overlayElement = createOverlayElement(job, platform);
  document.body.appendChild(overlayElement);

  // Animate in
  requestAnimationFrame(() => {
    if (overlayElement) {
      overlayElement.style.transform = 'translateY(0)';
      overlayElement.style.opacity = '1';
    }
  });
}

export function hideOverlay(): void {
  if (overlayElement) {
    overlayElement.remove();
    overlayElement = null;
  }
}

function createOverlayElement(job: ExtractedJob, platform: JobPlatform): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'applysharp-overlay';
  overlay.style.transform = 'translateY(20px)';
  overlay.style.opacity = '0';

  overlay.innerHTML = `
    <div class="applysharp-header">
      <div class="applysharp-header-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM10 4h4v3h-4V4z"/>
        </svg>
        ApplySharp
      </div>
      <div class="applysharp-header-actions">
        <button class="applysharp-btn applysharp-btn-icon" id="jp-minimize" title="Minimize">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 15l-6-6-6 6"/>
          </svg>
        </button>
        <button class="applysharp-btn applysharp-btn-icon" id="jp-close" title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="applysharp-content" id="jp-content">
      <div class="applysharp-job-title">${escapeHtml(job.title)}</div>
      <div class="applysharp-company">${escapeHtml(job.company)}${job.location ? ` • ${escapeHtml(job.location)}` : ''}</div>

      <div class="applysharp-score">
        <div class="applysharp-score-circle applysharp-score-medium" id="jp-score-circle">
          --
        </div>
        <div class="applysharp-score-info">
          <div class="applysharp-score-label">Job Fit Score</div>
          <div class="applysharp-score-profile" id="jp-profile-name">Select a profile to score</div>
        </div>
      </div>

      <div class="applysharp-tags" id="jp-tags">
        <span class="applysharp-tag">${capitalize(platform)}</span>
        ${job.employmentType ? `<span class="applysharp-tag">${escapeHtml(formatEmploymentType(job.employmentType))}</span>` : ''}
      </div>
    </div>

    <div class="applysharp-actions">
      <button class="applysharp-btn applysharp-btn-primary" id="jp-save">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17,21 17,13 7,13 7,21"/>
          <polyline points="7,3 7,8 15,8"/>
        </svg>
        Save Job
      </button>
      <button class="applysharp-btn applysharp-btn-secondary" id="jp-options">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v10M4.22 4.22l4.24 4.24m7.07 7.07l4.24 4.24M1 12h6m6 0h10M4.22 19.78l4.24-4.24m7.07-7.07l4.24-4.24"/>
        </svg>
        Options
      </button>
    </div>
  `;

  // Attach event listeners
  overlay.querySelector('#jp-close')?.addEventListener('click', hideOverlay);
  overlay.querySelector('#jp-minimize')?.addEventListener('click', () => toggleMinimize(overlay, job));

  overlay.querySelector('#jp-save')?.addEventListener('click', async () => {
    const btn = overlay.querySelector('#jp-save') as HTMLButtonElement;
    btn.disabled = true;
    btn.innerHTML = `
      <div class="applysharp-spinner" style="width: 16px; height: 16px; margin-right: 6px;"></div>
      Saving...
    `;

    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_JOB',
        payload: {
          ...job,
          url: window.location.href,
          platform,
        },
      });

      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <polyline points="20,6 9,17 4,12"/>
        </svg>
        Saved!
      `;
      btn.classList.remove('applysharp-btn-primary');
      btn.classList.add('applysharp-btn-success');
    } catch (error) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17,21 17,13 7,13 7,21"/>
          <polyline points="7,3 7,8 15,8"/>
        </svg>
        Save Job
      `;
      console.error('[ApplySharp] Failed to save job:', error);
    }
  });

  overlay.querySelector('#jp-options')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });

  return overlay;
}

function toggleMinimize(overlay: HTMLElement, job: ExtractedJob): void {
  isMinimized = !isMinimized;
  const content = overlay.querySelector('#jp-content') as HTMLElement;
  const actions = overlay.querySelector('.applysharp-actions') as HTMLElement;
  const minimizeBtn = overlay.querySelector('#jp-minimize') as HTMLElement;

  if (isMinimized) {
    content.style.display = 'none';
    actions.style.display = 'none';
    overlay.classList.add('minimized');
    minimizeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    `;

    // Add minimized content
    const minimized = document.createElement('div');
    minimized.className = 'applysharp-minimized';
    minimized.id = 'jp-minimized';
    minimized.innerHTML = `
      <span style="font-weight: 500;">${escapeHtml(job.title.slice(0, 30))}${job.title.length > 30 ? '...' : ''}</span>
    `;
    minimized.addEventListener('click', () => toggleMinimize(overlay, job));
    overlay.appendChild(minimized);
  } else {
    content.style.display = 'block';
    actions.style.display = 'flex';
    overlay.classList.remove('minimized');
    minimizeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 15l-6-6-6 6"/>
      </svg>
    `;

    // Remove minimized content
    overlay.querySelector('#jp-minimized')?.remove();
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatEmploymentType(type: string): string {
  return type.split('-').map(capitalize).join(' ');
}

export function updateScore(score: number, profileName: string): void {
  if (!overlayElement) return;

  const scoreCircle = overlayElement.querySelector('#jp-score-circle');
  const profileNameEl = overlayElement.querySelector('#jp-profile-name');

  if (scoreCircle) {
    scoreCircle.textContent = String(score);
    scoreCircle.className = 'applysharp-score-circle';

    if (score >= 70) {
      scoreCircle.classList.add('applysharp-score-high');
    } else if (score >= 40) {
      scoreCircle.classList.add('applysharp-score-medium');
    } else {
      scoreCircle.classList.add('applysharp-score-low');
    }
  }

  if (profileNameEl) {
    profileNameEl.textContent = `Using: ${profileName}`;
  }
}

export function updateTags(matchedSkills: string[], missingSkills: string[]): void {
  if (!overlayElement) return;

  const tagsContainer = overlayElement.querySelector('#jp-tags');
  if (!tagsContainer) return;

  // Keep existing platform/type tags
  const existingTags = tagsContainer.innerHTML;

  // Add skill tags
  const skillTags = [
    ...matchedSkills.slice(0, 3).map((skill) => `<span class="applysharp-tag applysharp-tag-match">${escapeHtml(skill)}</span>`),
    ...missingSkills.slice(0, 2).map((skill) => `<span class="applysharp-tag applysharp-tag-missing">${escapeHtml(skill)}</span>`),
  ].join('');

  tagsContainer.innerHTML = existingTags + skillTags;
}
