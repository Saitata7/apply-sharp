/**
 * Autofill Sidebar - JobRight-style sidebar for form filling
 * Shows completion progress, required/optional fields, and AI generation
 */

import type { DetectedForm, DetectedField } from './form-detector';
import type { FillPreview, PreviewField, JobContext } from './filler';
import {
  fillForm,
  generateFillPreview,
  requestAIAnswer,
  undoFill,
  type PreviousValue,
} from './filler';
import type { ResumeProfile } from '@shared/types/profile.types';
import { escapeHtml } from '@shared/utils/dom-utils';

let sidebarElement: HTMLElement | null = null;
let currentForm: DetectedForm | null = null;
let currentProfile: ResumeProfile | null = null;
let currentPreview: FillPreview | null = null;
let currentJobContext: JobContext | null = null;

/**
 * Show the autofill sidebar
 */
export async function showAutofillSidebar(
  form: DetectedForm,
  profile: ResumeProfile,
  jobContext?: JobContext
): Promise<void> {
  hideAutofillSidebar();

  currentForm = form;
  currentProfile = profile;
  currentJobContext = jobContext || {};

  // Generate preview
  currentPreview = await generateFillPreview(form, profile, jobContext);

  // Create sidebar
  sidebarElement = document.createElement('div');
  sidebarElement.id = 'jp-autofill-sidebar';
  sidebarElement.innerHTML = generateSidebarHTML(
    currentPreview,
    form.fields,
    currentJobContext || undefined
  );

  document.body.appendChild(sidebarElement);

  // Animate in
  requestAnimationFrame(() => {
    sidebarElement?.classList.add('jp-sidebar-visible');
  });

  // Attach event listeners
  attachSidebarListeners();
}

/**
 * Hide the autofill sidebar
 */
export function hideAutofillSidebar(): void {
  if (sidebarElement) {
    sidebarElement.classList.remove('jp-sidebar-visible');
    setTimeout(() => {
      sidebarElement?.remove();
      sidebarElement = null;
    }, 300);
  }
  currentForm = null;
  currentProfile = null;
  currentPreview = null;
  currentJobContext = null;
}

/**
 * Generate the sidebar HTML
 */
function generateSidebarHTML(
  preview: FillPreview,
  formFields: DetectedField[],
  jobContext?: JobContext
): string {
  const requiredFields = preview.fields.filter((_f, i) => formFields[i]?.isRequired);
  const optionalFields = preview.fields.filter((_f, i) => !formFields[i]?.isRequired);

  const requiredFilled = requiredFields.filter((f) => f.suggestedValue || f.currentValue).length;
  const totalRequired = requiredFields.length;
  const completionPercent =
    totalRequired > 0 ? Math.round((requiredFilled / totalRequired) * 100) : 100;

  const hasJobContext = jobContext?.companyName || jobContext?.jobTitle;

  return `
    <style>
      #jp-autofill-sidebar {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100vh;
        background: white;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
        z-index: 2147483646;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transform: translateX(100%);
        transition: transform 0.3s ease;
      }

      #jp-autofill-sidebar.jp-sidebar-visible {
        transform: translateX(0);
      }

      .jp-sidebar-header {
        padding: 16px 20px;
        border-bottom: 1px solid #e2e8f0;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
      }

      .jp-sidebar-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .jp-sidebar-title h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jp-sidebar-close {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }

      .jp-sidebar-close:hover {
        background: rgba(255,255,255,0.3);
      }

      .jp-completion-stats {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .jp-completion-ring {
        width: 50px;
        height: 50px;
        position: relative;
      }

      .jp-completion-ring svg {
        transform: rotate(-90deg);
      }

      .jp-completion-ring circle {
        fill: none;
        stroke-width: 5;
      }

      .jp-completion-ring .bg {
        stroke: rgba(255,255,255,0.2);
      }

      .jp-completion-ring .progress {
        stroke: white;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.5s ease;
      }

      .jp-completion-percent {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 14px;
        font-weight: 700;
      }

      .jp-completion-text {
        flex: 1;
      }

      .jp-completion-text .main {
        font-size: 14px;
        font-weight: 600;
      }

      .jp-completion-text .sub {
        font-size: 12px;
        opacity: 0.8;
      }

      .jp-sidebar-body {
        flex: 1;
        overflow-y: auto;
        padding: 0;
      }

      .jp-field-section {
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
      }

      .jp-section-header {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .jp-section-header .count {
        background: #e2e8f0;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
      }

      .jp-field-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        margin-bottom: 6px;
        border-radius: 8px;
        background: #f8fafc;
        transition: all 0.15s;
      }

      .jp-field-item:hover {
        background: #f1f5f9;
      }

      .jp-field-item.jp-filled {
        background: #ecfdf5;
        border-left: 3px solid #22c55e;
      }

      .jp-field-item.jp-has-current {
        background: #f0f9ff;
        border-left: 3px solid #3b82f6;
      }

      .jp-field-item.jp-missing {
        background: #fef2f2;
        border-left: 3px solid #ef4444;
      }

      .jp-field-status {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .jp-status-filled {
        background: #22c55e;
        color: white;
      }

      .jp-status-current {
        background: #3b82f6;
        color: white;
      }

      .jp-status-missing {
        background: #fecaca;
        color: #ef4444;
      }

      .jp-field-content {
        flex: 1;
        min-width: 0;
      }

      .jp-field-name {
        font-size: 13px;
        font-weight: 500;
        color: #1e293b;
        margin-bottom: 2px;
      }

      .jp-field-value {
        font-size: 12px;
        color: #64748b;
        word-break: break-word;
      }

      .jp-field-value.jp-will-fill {
        color: #059669;
      }

      .jp-source-tag {
        display: inline-flex;
        align-items: center;
        font-size: 9px;
        font-weight: 600;
        padding: 2px 5px;
        border-radius: 3px;
        margin-left: 4px;
        text-transform: uppercase;
      }

      .jp-tag-profile { background: #dbeafe; color: #1e40af; }
      .jp-tag-bank { background: #fef3c7; color: #92400e; }
      .jp-tag-ai { background: #f3e8ff; color: #7c3aed; }

      .jp-ai-btn {
        background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        transition: all 0.15s;
      }

      .jp-ai-btn:hover {
        box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
      }

      .jp-ai-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .jp-ai-btn .spinner {
        width: 10px;
        height: 10px;
        border: 2px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .jp-sidebar-footer {
        padding: 16px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
      }

      .jp-fill-btn {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.15s;
      }

      .jp-fill-btn:hover {
        box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);
        transform: translateY(-1px);
      }

      .jp-fill-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .jp-fill-count {
        background: rgba(255,255,255,0.25);
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 12px;
      }

      .jp-powered-by {
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        margin-top: 10px;
      }

      .jp-field-toggle {
        appearance: none;
        width: 16px;
        height: 16px;
        border: 2px solid #cbd5e1;
        border-radius: 4px;
        cursor: pointer;
        flex-shrink: 0;
        margin-top: 3px;
        position: relative;
      }

      .jp-field-toggle:checked {
        background: #22c55e;
        border-color: #22c55e;
      }

      .jp-field-toggle:checked::after {
        content: '\\2713';
        color: white;
        font-size: 11px;
        position: absolute;
        top: -1px;
        left: 1px;
      }

      /* Job Context Section */
      .jp-job-context {
        padding: 10px 16px;
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        border-bottom: 1px solid #bae6fd;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .jp-job-info {
        flex: 1;
        min-width: 0;
      }

      .jp-job-title {
        font-size: 13px;
        font-weight: 600;
        color: #0369a1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .jp-job-company {
        font-size: 11px;
        color: #0284c7;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .jp-job-missing {
        font-size: 12px;
        color: #64748b;
        font-style: italic;
      }

      .jp-edit-btn {
        background: white;
        border: 1px solid #0ea5e9;
        color: #0284c7;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.15s;
      }

      .jp-edit-btn:hover {
        background: #0ea5e9;
        color: white;
      }

      /* Edit Modal */
      .jp-edit-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .jp-edit-content {
        background: white;
        border-radius: 12px;
        width: 350px;
        max-width: 90%;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        animation: slideUp 0.2s ease;
      }

      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .jp-edit-header {
        padding: 16px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .jp-edit-header h4 {
        margin: 0;
        font-size: 16px;
        color: #1e293b;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jp-edit-close {
        background: none;
        border: none;
        font-size: 20px;
        color: #64748b;
        cursor: pointer;
        line-height: 1;
      }

      .jp-edit-body {
        padding: 16px;
      }

      .jp-edit-field {
        margin-bottom: 14px;
      }

      .jp-edit-field:last-child {
        margin-bottom: 0;
      }

      .jp-edit-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 6px;
        text-transform: uppercase;
      }

      .jp-edit-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        color: #1e293b;
        transition: all 0.15s;
      }

      .jp-edit-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .jp-edit-input::placeholder {
        color: #94a3b8;
      }

      .jp-edit-textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        color: #1e293b;
        resize: vertical;
        min-height: 120px;
        transition: all 0.15s;
      }

      .jp-edit-textarea:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .jp-edit-textarea::placeholder {
        color: #94a3b8;
      }

      .jp-edit-footer {
        padding: 12px 16px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .jp-edit-cancel {
        padding: 8px 16px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 13px;
        color: #64748b;
        cursor: pointer;
      }

      .jp-edit-save {
        padding: 8px 16px;
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        color: white;
        cursor: pointer;
      }

      .jp-edit-save:hover {
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
      }

      .jp-edit-hint {
        font-size: 11px;
        color: #64748b;
        margin-top: 12px;
        padding: 8px;
        background: #f8fafc;
        border-radius: 6px;
      }
    </style>

    <div class="jp-sidebar-header">
      <div class="jp-sidebar-title">
        <h3>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          ApplySharp Auto-Fill
        </h3>
        <button class="jp-sidebar-close" id="jp-sidebar-close">×</button>
      </div>
      <div class="jp-completion-stats">
        <div class="jp-completion-ring">
          <svg width="50" height="50" viewBox="0 0 50 50">
            <circle class="bg" cx="25" cy="25" r="20"/>
            <circle class="progress" cx="25" cy="25" r="20"
              stroke-dasharray="${Math.PI * 40}"
              stroke-dashoffset="${Math.PI * 40 * (1 - completionPercent / 100)}"/>
          </svg>
          <span class="jp-completion-percent">${completionPercent}%</span>
        </div>
        <div class="jp-completion-text">
          <div class="main">${requiredFilled} of ${totalRequired} required fields</div>
          <div class="sub">${preview.fields.filter((f) => f.willFill).length} fields ready to fill</div>
        </div>
      </div>
    </div>

    <div class="jp-job-context">
      <div class="jp-job-info">
        ${
          hasJobContext
            ? `
          <div class="jp-job-title">${escapeHtml(jobContext?.jobTitle || 'Unknown Position')}</div>
          <div class="jp-job-company">${escapeHtml(jobContext?.companyName || 'Unknown Company')}</div>
        `
            : `
          <div class="jp-job-missing">No job context detected</div>
        `
        }
      </div>
      <button class="jp-edit-btn" id="jp-edit-context" title="Edit job context">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>

    <div class="jp-sidebar-body">
      ${
        requiredFields.length > 0
          ? `
        <div class="jp-field-section">
          <div class="jp-section-header">
            Required
            <span class="count">${requiredFields.length}</span>
          </div>
          ${requiredFields.map((field, idx) => generateFieldItemHTML(field, idx, true)).join('')}
        </div>
      `
          : ''
      }

      ${
        optionalFields.length > 0
          ? `
        <div class="jp-field-section">
          <div class="jp-section-header">
            Optional
            <span class="count">${optionalFields.length}</span>
          </div>
          ${optionalFields.map((field, idx) => generateFieldItemHTML(field, requiredFields.length + idx, false)).join('')}
        </div>
      `
          : ''
      }
    </div>

    <div class="jp-sidebar-footer">
      <button class="jp-fill-btn" id="jp-fill-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Auto-Fill Fields
        <span class="jp-fill-count">${preview.fields.filter((f) => f.willFill).length}</span>
      </button>
      <div class="jp-powered-by">Powered by ApplySharp • Local & Private</div>
    </div>
  `;
}

/**
 * Generate HTML for a single field item
 */
function generateFieldItemHTML(field: PreviewField, index: number, _isRequired: boolean): string {
  const hasCurrent = !!field.currentValue;
  const willFill = field.willFill && !!field.suggestedValue;
  const isMissing = !hasCurrent && !field.suggestedValue;
  const isCustomQuestion = ['customQuestion', 'additionalInfo', 'unknown'].includes(
    field.fieldType
  );

  const statusClass = willFill
    ? 'jp-filled'
    : hasCurrent
      ? 'jp-has-current'
      : isMissing
        ? 'jp-missing'
        : '';
  const statusIconClass = willFill
    ? 'jp-status-filled'
    : hasCurrent
      ? 'jp-status-current'
      : 'jp-status-missing';

  const getStatusIcon = () => {
    if (willFill) return '✓';
    if (hasCurrent) return '●';
    return '!';
  };

  const getSourceTag = () => {
    if (!field.suggestedValue) return '';
    const basicFields = [
      'firstName',
      'lastName',
      'fullName',
      'email',
      'phone',
      'linkedin',
      'github',
      'city',
      'state',
      'currentCompany',
      'currentTitle',
    ];
    if (basicFields.includes(field.fieldType)) {
      return '<span class="jp-source-tag jp-tag-profile">Profile</span>';
    }
    return '<span class="jp-source-tag jp-tag-bank">Bank</span>';
  };

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len) + '...' : str;

  return `
    <div class="jp-field-item ${statusClass}" data-field-index="${index}">
      ${
        willFill
          ? `<input type="checkbox" class="jp-field-toggle" data-field-index="${index}" checked>`
          : `
      <div class="jp-field-status ${statusIconClass}">
        <span style="font-size:10px">${getStatusIcon()}</span>
      </div>`
      }
      <div class="jp-field-content">
        <div class="jp-field-name">
          ${escapeHtml(field.label)}
          ${getSourceTag()}
        </div>
        ${
          hasCurrent
            ? `
          <div class="jp-field-value">Current: ${escapeHtml(truncate(field.currentValue, 50))}</div>
        `
            : willFill
              ? `
          <div class="jp-field-value jp-will-fill">Will fill: ${escapeHtml(truncate(field.suggestedValue, 50))}</div>
        `
              : `
          <div class="jp-field-value">No matching data</div>
          ${
            isCustomQuestion
              ? `
            <button class="jp-ai-btn" data-field-index="${index}" data-label="${escapeHtml(field.label)}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Generate with AI
            </button>
          `
              : ''
          }
        `
        }
      </div>
    </div>
  `;
}

/**
 * Attach event listeners to sidebar
 */
function attachSidebarListeners(): void {
  if (!sidebarElement) return;

  // Close button
  sidebarElement.querySelector('#jp-sidebar-close')?.addEventListener('click', hideAutofillSidebar);

  // Edit job context button
  sidebarElement.querySelector('#jp-edit-context')?.addEventListener('click', showEditModal);

  // Fill button
  sidebarElement.querySelector('#jp-fill-btn')?.addEventListener('click', async () => {
    if (!currentForm || !currentProfile) return;

    const btn = sidebarElement?.querySelector('#jp-fill-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Filling...';
    }

    try {
      // Filter form to only include fields the user approved (checked toggles)
      const excludedIndices = new Set<number>();
      sidebarElement?.querySelectorAll('.jp-field-toggle').forEach((toggle) => {
        const cb = toggle as HTMLInputElement;
        if (!cb.checked) {
          excludedIndices.add(parseInt(cb.dataset.fieldIndex || '0'));
        }
      });

      const filteredForm: DetectedForm =
        excludedIndices.size > 0
          ? {
              ...currentForm,
              fields: currentForm.fields.filter((_f, i) => !excludedIndices.has(i)),
            }
          : currentForm;

      const result = await fillForm(filteredForm, currentProfile, {
        jobContext: currentJobContext || undefined,
      });

      if (result.success) {
        showToast('success', `Filled ${result.filledFields.length} fields successfully!`);
        // Highlight filled fields
        result.filledFields.forEach((field) => {
          const el = field.element as HTMLElement;
          el.style.boxShadow = '0 0 0 2px #22c55e';
          setTimeout(() => {
            el.style.boxShadow = '';
          }, 3000);
        });
      } else {
        showToast('warning', `Filled ${result.filledFields.length} fields. Some errors occurred.`);
      }

      // Show undo button instead of closing immediately
      showUndoState(result.filledFields.length, result.previousValues);
    } catch (error) {
      console.error('[Autofill] Fill error:', error);
      showToast('error', 'Failed to fill fields');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Auto-Fill Fields
          <span class="jp-fill-count">${currentPreview?.fields.filter((f) => f.willFill).length || 0}</span>
        `;
      }
    }
  });

  // Field toggle checkboxes — update willFill state and fill count
  sidebarElement.querySelectorAll('.jp-field-toggle').forEach((toggle) => {
    toggle.addEventListener('change', (e) => {
      const checkbox = e.target as HTMLInputElement;
      const idx = parseInt(checkbox.dataset.fieldIndex || '0');
      if (currentPreview && currentPreview.fields[idx]) {
        currentPreview.fields[idx].willFill = checkbox.checked;
        updateSidebarStats();
      }
    });
  });

  // AI Generate buttons
  sidebarElement.querySelectorAll('.jp-ai-btn').forEach((btn) => {
    btn.addEventListener('click', handleAIGenerate);
  });
}

/**
 * Handle AI generate button click
 */
async function handleAIGenerate(e: Event): Promise<void> {
  const button = e.currentTarget as HTMLButtonElement;
  const fieldIndex = parseInt(button.dataset.fieldIndex || '0');
  const label = button.dataset.label || '';

  // Show loading
  button.disabled = true;
  button.innerHTML = '<div class="spinner"></div> Generating...';

  try {
    const answer = await requestAIAnswer(label, currentJobContext || undefined);

    if (answer && currentPreview) {
      // Update preview data
      currentPreview.fields[fieldIndex].suggestedValue = answer;
      currentPreview.fields[fieldIndex].willFill = true;

      // Guard: sidebar may have been closed during the async AI call
      if (!sidebarElement || !sidebarElement.isConnected) {
        showToast('success', 'Answer generated & saved!');
        return;
      }

      // Update UI
      const fieldItem = sidebarElement?.querySelector(`[data-field-index="${fieldIndex}"]`);
      if (fieldItem) {
        fieldItem.classList.remove('jp-missing');
        fieldItem.classList.add('jp-filled');

        // Update status icon
        const statusEl = fieldItem.querySelector('.jp-field-status');
        if (statusEl) {
          statusEl.classList.remove('jp-status-missing');
          statusEl.classList.add('jp-status-filled');
          statusEl.innerHTML = '<span style="font-size:10px">✓</span>';
        }

        // Update content
        const contentEl = fieldItem.querySelector('.jp-field-content');
        if (contentEl) {
          const nameEl = contentEl.querySelector('.jp-field-name');
          const nameHTML = nameEl?.innerHTML || '';
          contentEl.innerHTML = `
            <div class="jp-field-name">${nameHTML} <span class="jp-source-tag jp-tag-ai">AI</span></div>
            <div class="jp-field-value jp-will-fill">Will fill: ${escapeHtml(answer.substring(0, 50))}${answer.length > 50 ? '...' : ''}</div>
          `;
        }
      }

      // Update stats
      updateSidebarStats();

      showToast('success', 'Answer generated & saved!');
    } else {
      throw new Error('No answer generated');
    }
  } catch (error) {
    console.error('[Autofill] AI generation failed:', error);
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      Try Again
    `;
    }
    showToast('error', 'Failed to generate. Check AI settings.');
  }
}

/**
 * Update sidebar stats after changes
 */
function updateSidebarStats(): void {
  if (!sidebarElement || !currentPreview || !currentForm) return;

  const requiredFields = currentPreview.fields.filter(
    (_f, i) => currentForm!.fields[i]?.isRequired
  );
  const requiredFilled = requiredFields.filter((f) => f.suggestedValue || f.currentValue).length;
  const totalRequired = requiredFields.length;
  const completionPercent =
    totalRequired > 0 ? Math.round((requiredFilled / totalRequired) * 100) : 100;
  const toFill = currentPreview.fields.filter((f) => f.willFill).length;

  // Update progress ring
  const progressCircle = sidebarElement.querySelector(
    '.jp-completion-ring .progress'
  ) as SVGCircleElement;
  if (progressCircle) {
    progressCircle.style.strokeDashoffset = String(Math.PI * 40 * (1 - completionPercent / 100));
  }

  // Update percent text
  const percentEl = sidebarElement.querySelector('.jp-completion-percent');
  if (percentEl) percentEl.textContent = `${completionPercent}%`;

  // Update text stats
  const mainText = sidebarElement.querySelector('.jp-completion-text .main');
  if (mainText) mainText.textContent = `${requiredFilled} of ${totalRequired} required fields`;

  const subText = sidebarElement.querySelector('.jp-completion-text .sub');
  if (subText) subText.textContent = `${toFill} fields ready to fill`;

  // Update fill button
  const fillCount = sidebarElement.querySelector('.jp-fill-count');
  if (fillCount) fillCount.textContent = String(toFill);
}

/**
 * Show edit modal for job context
 */
function showEditModal(): void {
  // Remove existing modal if any
  document.querySelector('.jp-edit-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'jp-edit-modal';
  modal.innerHTML = `
    <div class="jp-edit-content">
      <div class="jp-edit-header">
        <h4>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 7h-4V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/>
          </svg>
          Edit Job Context
        </h4>
        <button class="jp-edit-close" id="jp-edit-modal-close">&times;</button>
      </div>
      <div class="jp-edit-body">
        <div class="jp-edit-field">
          <label class="jp-edit-label">Job Title</label>
          <input type="text" class="jp-edit-input" id="jp-edit-job-title"
            value="${escapeHtml(currentJobContext?.jobTitle || '')}"
            placeholder="e.g., Senior Software Engineer">
        </div>
        <div class="jp-edit-field">
          <label class="jp-edit-label">Company Name</label>
          <input type="text" class="jp-edit-input" id="jp-edit-company-name"
            value="${escapeHtml(currentJobContext?.companyName || '')}"
            placeholder="e.g., Google">
        </div>
        <div class="jp-edit-field">
          <label class="jp-edit-label">Job Description (JD)</label>
          <textarea class="jp-edit-textarea" id="jp-edit-jd"
            placeholder="Paste the full job description here..."
            rows="8">${escapeHtml(currentJobContext?.jobDescription || '')}</textarea>
          <div class="jp-edit-hint">
            The job description helps generate better AI answers and match your profile to requirements.
          </div>
        </div>
      </div>
      <div class="jp-edit-footer">
        <button class="jp-edit-cancel" id="jp-edit-cancel">Cancel</button>
        <button class="jp-edit-save" id="jp-edit-save">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  // Close button
  modal.querySelector('#jp-edit-modal-close')?.addEventListener('click', () => modal.remove());
  modal.querySelector('#jp-edit-cancel')?.addEventListener('click', () => modal.remove());

  // Save button
  modal.querySelector('#jp-edit-save')?.addEventListener('click', () => {
    const jobTitle = (modal.querySelector('#jp-edit-job-title') as HTMLInputElement)?.value.trim();
    const companyName = (
      modal.querySelector('#jp-edit-company-name') as HTMLInputElement
    )?.value.trim();
    const jobDescription = (
      modal.querySelector('#jp-edit-jd') as HTMLTextAreaElement
    )?.value.trim();

    // Update current job context
    currentJobContext = {
      ...currentJobContext,
      jobTitle: jobTitle || undefined,
      companyName: companyName || undefined,
      jobDescription: jobDescription || undefined,
    };

    // Update the sidebar display
    const jobInfo = sidebarElement?.querySelector('.jp-job-info');
    if (jobInfo) {
      if (jobTitle || companyName) {
        jobInfo.innerHTML = `
          <div class="jp-job-title">${escapeHtml(jobTitle || 'Unknown Position')}</div>
          <div class="jp-job-company">${escapeHtml(companyName || 'Unknown Company')}</div>
        `;
      } else {
        jobInfo.innerHTML = `<div class="jp-job-missing">No job context detected</div>`;
      }
    }

    modal.remove();
    showToast('success', 'Job context updated!');
  });

  // Focus first input
  setTimeout(() => {
    (modal.querySelector('#jp-edit-job-title') as HTMLInputElement)?.focus();
  }, 100);
}

/**
 * Show undo state in the footer after a successful fill
 */
function showUndoState(filledCount: number, previousValues: PreviousValue[]): void {
  if (!sidebarElement) return;

  const footer = sidebarElement.querySelector('.jp-sidebar-footer');
  if (!footer) return;

  footer.innerHTML = `
    <div style="text-align:center;color:#166534;font-size:14px;font-weight:600;margin-bottom:10px">
      Filled ${filledCount} fields
    </div>
    <div style="display:flex;gap:8px">
      <button id="jp-undo-btn" style="flex:1;padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10h10a5 5 0 0 1 0 10H9"/><polyline points="7 14 3 10 7 6"/></svg>
        Undo
      </button>
      <button id="jp-done-btn" style="flex:1;padding:12px;background:linear-gradient(135deg,#22c55e 0%,#16a34a 100%);border:none;border-radius:10px;color:white;font-size:14px;font-weight:600;cursor:pointer">
        Done
      </button>
    </div>
    <div class="jp-powered-by">Powered by ApplySharp • Local & Private</div>
  `;

  footer.querySelector('#jp-undo-btn')?.addEventListener('click', async () => {
    const btn = footer.querySelector('#jp-undo-btn') as HTMLButtonElement;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Undoing...';
    }

    const restored = await undoFill(previousValues);
    showToast('success', `Restored ${restored} fields to previous values`);
    hideAutofillSidebar();
  });

  footer.querySelector('#jp-done-btn')?.addEventListener('click', hideAutofillSidebar);
}

/**
 * Show toast notification
 */
function showToast(type: 'success' | 'error' | 'warning', message: string): void {
  const existing = document.querySelector('.jp-toast');
  if (existing) existing.remove();

  const colors = {
    success: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  };
  const color = colors[type];

  const toast = document.createElement('div');
  toast.className = 'jp-toast';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 400px;
    z-index: 2147483647;
    padding: 12px 16px;
    background: ${color.bg};
    border: 1px solid ${color.border};
    border-radius: 8px;
    color: ${color.text};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.3s ease;
  `;
  toast.textContent = message;

  // Inject keyframe styles once globally
  if (!document.getElementById('jp-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'jp-toast-styles';
    style.textContent = `@keyframes slideIn { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Check if sidebar is visible
 */
export function isSidebarVisible(): boolean {
  return !!sidebarElement;
}
