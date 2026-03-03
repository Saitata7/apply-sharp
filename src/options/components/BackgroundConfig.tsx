/**
 * Background & Skill Areas Configuration Component
 *
 * Allows users to:
 * 1. Select their professional background (CS, Data, MBA, etc.)
 * 2. Select their target role within that background
 * 3. View and adjust skill area strengths
 */

import { useState, useEffect, useMemo } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';
import type {
  BackgroundType,
  UserBackgroundConfig,
  UserSkillArea,
} from '@shared/types/background.types';
import {
  BACKGROUND_CONFIGS,
  getBackgroundConfig,
  getRoleConfig,
} from '@shared/types/background.types';

interface BackgroundConfigProps {
  profile: MasterProfile;
  onSave: (config: Partial<MasterProfile>) => Promise<boolean>;
}

export default function BackgroundConfig({ profile, onSave }: BackgroundConfigProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Current configuration from profile
  const currentConfig = profile.backgroundConfig;

  // Edit state
  const [selectedBackground, setSelectedBackground] = useState<BackgroundType>(
    currentConfig?.background || 'computer-science'
  );
  const [selectedRole, setSelectedRole] = useState<string>(currentConfig?.primaryRole || '');
  const [skillAreas, setSkillAreas] = useState<UserSkillArea[]>(currentConfig?.skillAreas || []);

  // Get available roles for selected background
  const availableRoles = useMemo(() => {
    const bgConfig = getBackgroundConfig(selectedBackground);
    return bgConfig?.roles || [];
  }, [selectedBackground]);

  // Update role when background changes
  useEffect(() => {
    if (availableRoles.length > 0 && !availableRoles.find((r) => r.id === selectedRole)) {
      setSelectedRole(availableRoles[0].id);
    }
  }, [selectedBackground, availableRoles, selectedRole]);

  // Generate default skill areas from role
  useEffect(() => {
    if (selectedRole && isEditing) {
      const roleConfig = getRoleConfig(selectedBackground, selectedRole);
      if (roleConfig) {
        const defaultAreas: UserSkillArea[] = roleConfig.skillAreas
          .filter((sa) => sa.defaultWeight > 0)
          .map((sa) => ({
            id: sa.id,
            name: sa.name,
            strength: sa.defaultWeight,
            keywords: [],
          }));
        setSkillAreas(defaultAreas);
      }
    }
  }, [selectedRole, selectedBackground, isEditing]);

  // Calculate skill areas from profile if not configured
  const calculatedSkillAreas = useMemo(() => {
    if (currentConfig?.skillAreas && currentConfig.skillAreas.length > 0) {
      return currentConfig.skillAreas;
    }

    // Calculate from profile skills
    const skills = profile.skills?.technical || [];
    const areas: Record<string, { count: number; name: string }> = {
      frontend: { count: 0, name: 'Frontend Development' },
      backend: { count: 0, name: 'Backend Development' },
      database: { count: 0, name: 'Database & Data' },
      devops: { count: 0, name: 'DevOps & Cloud' },
      testing: { count: 0, name: 'Testing & QA' },
      mobile: { count: 0, name: 'Mobile Development' },
      'ml-ai': { count: 0, name: 'Machine Learning & AI' },
    };

    // Map skills to areas based on category
    skills.forEach((skill) => {
      const category = skill.category?.toLowerCase() || '';
      if (category.includes('frontend') || category.includes('ui')) {
        areas.frontend.count++;
      } else if (category.includes('backend') || category.includes('server')) {
        areas.backend.count++;
      } else if (category.includes('database') || category.includes('data')) {
        areas.database.count++;
      } else if (
        category.includes('devops') ||
        category.includes('cloud') ||
        category.includes('infra')
      ) {
        areas.devops.count++;
      } else if (category.includes('test') || category.includes('qa')) {
        areas.testing.count++;
      } else if (
        category.includes('mobile') ||
        category.includes('ios') ||
        category.includes('android')
      ) {
        areas.mobile.count++;
      } else if (
        category.includes('ml') ||
        category.includes('ai') ||
        category.includes('machine')
      ) {
        areas['ml-ai'].count++;
      }
    });

    const total = Object.values(areas).reduce((sum, a) => sum + a.count, 0) || 1;

    return Object.entries(areas)
      .filter(([_, data]) => data.count > 0)
      .map(([id, data]) => ({
        id,
        name: data.name,
        strength: Math.round((data.count / total) * 100),
        keywords: [],
      }))
      .sort((a, b) => b.strength - a.strength);
  }, [profile.skills?.technical, currentConfig?.skillAreas]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newConfig: UserBackgroundConfig = {
        background: selectedBackground,
        primaryRole: selectedRole,
        skillAreas,
        isAutoDetected: false,
        lastCalculated: new Date(),
      };

      const success = await onSave({ backgroundConfig: newConfig });
      if (success) {
        setIsEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStrengthChange = (areaId: string, newStrength: number) => {
    setSkillAreas((prev) =>
      prev.map((area) => (area.id === areaId ? { ...area, strength: newStrength } : area))
    );
  };

  // Get background display name
  const getBackgroundName = (bgId: BackgroundType) => {
    return BACKGROUND_CONFIGS.find((b) => b.id === bgId)?.name || bgId;
  };

  // Get role display name
  const getRoleName = (roleId: string) => {
    const roleConfig = getRoleConfig(selectedBackground, roleId);
    return roleConfig?.name || roleId;
  };

  return (
    <div className="background-config">
      <div className="config-header">
        <div className="config-title">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <h3>Background & Skill Areas</h3>
        </div>
        {!isEditing && (
          <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(true)}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
            Configure
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="config-edit">
          {/* Background Selection */}
          <div className="form-group">
            <label>Professional Background</label>
            <select
              value={selectedBackground}
              onChange={(e) => setSelectedBackground(e.target.value as BackgroundType)}
            >
              {BACKGROUND_CONFIGS.map((bg) => (
                <option key={bg.id} value={bg.id}>
                  {bg.name}
                </option>
              ))}
            </select>
            <p className="form-hint">This helps match you with relevant job categories</p>
          </div>

          {/* Role Selection */}
          <div className="form-group">
            <label>Target Role</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              disabled={availableRoles.length === 0}
            >
              {availableRoles.length > 0 ? (
                availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))
              ) : (
                <option value="">No roles defined for this background</option>
              )}
            </select>
            <p className="form-hint">Your primary job target for ATS optimization</p>
          </div>

          {/* Skill Areas */}
          <div className="form-group">
            <label>Skill Area Strengths</label>
            <p className="form-hint">Adjust sliders to reflect your expertise in each area</p>
            <div className="skill-areas-edit">
              {skillAreas.map((area) => (
                <div key={area.id} className="skill-area-row">
                  <div className="skill-area-label">
                    <span className="skill-area-name">{area.name}</span>
                    <span className="skill-area-value">{area.strength}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={area.strength}
                    onChange={(e) => handleStrengthChange(area.id, parseInt(e.target.value))}
                    className="skill-slider"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="config-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <div className="spinner-sm"></div>
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="config-view">
          {/* Current Background & Role */}
          <div className="config-summary">
            <div className="config-item">
              <span className="config-label">Background</span>
              <span className="config-value">
                {currentConfig ? getBackgroundName(currentConfig.background) : 'Not configured'}
              </span>
            </div>
            <div className="config-item">
              <span className="config-label">Target Role</span>
              <span className="config-value">
                {currentConfig?.primaryRole
                  ? getRoleName(currentConfig.primaryRole)
                  : profile.careerContext?.primaryDomain || 'Not configured'}
              </span>
            </div>
          </div>

          {/* Skill Areas Visual */}
          <div className="skill-areas-view">
            <h4>Skill Areas</h4>
            {calculatedSkillAreas.length > 0 ? (
              <div className="skill-bars">
                {calculatedSkillAreas.map((area) => (
                  <div key={area.id} className="skill-bar-row">
                    <div className="skill-bar-header">
                      <span className="skill-bar-name">{area.name}</span>
                      <span className="skill-bar-percent">{area.strength}%</span>
                    </div>
                    <div className="skill-bar-container">
                      <div
                        className="skill-bar-fill"
                        style={{
                          width: `${area.strength}%`,
                          backgroundColor: getStrengthColor(area.strength),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-skills-message">
                Click &ldquo;Configure&rdquo; to set up your skill areas
              </p>
            )}
          </div>

          {/* Auto-detection notice */}
          {!currentConfig && (
            <div className="auto-detect-notice">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                Skill areas are auto-calculated from your profile. Configure manually for better
                accuracy.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStrengthColor(strength: number): string {
  if (strength >= 80) return '#22c55e'; // green
  if (strength >= 60) return '#38bdf8'; // blue
  if (strength >= 40) return '#eab308'; // yellow
  if (strength >= 20) return '#f97316'; // orange
  return '#94a3b8'; // gray
}
