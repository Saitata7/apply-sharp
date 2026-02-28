import { useState, useEffect } from 'react';
import type { MasterProfile } from '@shared/types/master-profile.types';

interface AutofillSettingsProps {
  profile: MasterProfile;
  onSave: (updates: Partial<MasterProfile>) => Promise<boolean>;
}

export default function AutofillSettings({ profile, onSave }: AutofillSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    // Address
    streetAddress: profile.autofillData?.streetAddress || '',
    city: profile.autofillData?.city || profile.personal?.location?.city || '',
    state: profile.autofillData?.state || profile.personal?.location?.state || '',
    zipCode: profile.autofillData?.zipCode || profile.personal?.location?.zipCode || '',
    country:
      profile.autofillData?.country || profile.personal?.location?.country || 'United States',

    // Work Authorization
    workAuthorization: profile.autofillData?.workAuthorization || 'citizen',
    visaType: profile.autofillData?.visaType || '',
    requiresSponsorship: profile.autofillData?.requiresSponsorship || false,

    // Security & Background
    securityClearance: profile.autofillData?.securityClearance || 'none',
    canPassBackgroundCheck: profile.autofillData?.canPassBackgroundCheck ?? true,
    canPassDrugTest: profile.autofillData?.canPassDrugTest ?? true,

    // Languages
    languages: profile.autofillData?.languages?.join(', ') || 'English',

    // Availability
    availableStartDate: profile.autofillData?.availableStartDate || 'Immediately',
    noticePeriod: profile.autofillData?.noticePeriod || '',

    // Work Preferences
    willingToRelocate: profile.autofillData?.willingToRelocate || false,
    workPreference: profile.autofillData?.remotePreference || 'flexible',
    preferredLocations: profile.autofillData?.relocationPreferences?.join(', ') || '',

    // Demographics
    gender: profile.autofillData?.demographics?.gender || '',
    pronouns: profile.autofillData?.demographics?.pronouns || '',
    ethnicity: profile.autofillData?.demographics?.ethnicity || '',
    race: profile.autofillData?.demographics?.race || '',
    veteranStatus: profile.autofillData?.demographics?.veteranStatus || '',
    disabilityStatus: profile.autofillData?.demographics?.disabilityStatus || '',

    // Salary
    salaryMin: profile.autofillData?.salaryExpectations?.min?.toString() || '',
    salaryMax: profile.autofillData?.salaryExpectations?.max?.toString() || '',
    salaryCurrency: profile.autofillData?.salaryExpectations?.currency || 'USD',
  });

  // Update form when profile changes
  useEffect(() => {
    setFormData({
      streetAddress: profile.autofillData?.streetAddress || '',
      city: profile.autofillData?.city || profile.personal?.location?.city || '',
      state: profile.autofillData?.state || profile.personal?.location?.state || '',
      zipCode: profile.autofillData?.zipCode || profile.personal?.location?.zipCode || '',
      country:
        profile.autofillData?.country || profile.personal?.location?.country || 'United States',
      workAuthorization: profile.autofillData?.workAuthorization || 'citizen',
      visaType: profile.autofillData?.visaType || '',
      requiresSponsorship: profile.autofillData?.requiresSponsorship || false,
      securityClearance: profile.autofillData?.securityClearance || 'none',
      canPassBackgroundCheck: profile.autofillData?.canPassBackgroundCheck ?? true,
      canPassDrugTest: profile.autofillData?.canPassDrugTest ?? true,
      languages: profile.autofillData?.languages?.join(', ') || 'English',
      availableStartDate: profile.autofillData?.availableStartDate || 'Immediately',
      noticePeriod: profile.autofillData?.noticePeriod || '',
      willingToRelocate: profile.autofillData?.willingToRelocate || false,
      workPreference: profile.autofillData?.remotePreference || 'flexible',
      preferredLocations: profile.autofillData?.relocationPreferences?.join(', ') || '',
      gender: profile.autofillData?.demographics?.gender || '',
      pronouns: profile.autofillData?.demographics?.pronouns || '',
      ethnicity: profile.autofillData?.demographics?.ethnicity || '',
      race: profile.autofillData?.demographics?.race || '',
      veteranStatus: profile.autofillData?.demographics?.veteranStatus || '',
      disabilityStatus: profile.autofillData?.demographics?.disabilityStatus || '',
      salaryMin: profile.autofillData?.salaryExpectations?.min?.toString() || '',
      salaryMax: profile.autofillData?.salaryExpectations?.max?.toString() || '',
      salaryCurrency: profile.autofillData?.salaryExpectations?.currency || 'USD',
    });
  }, [profile]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Build salary expectations if provided
      const salaryExpectations =
        formData.salaryMin || formData.salaryMax
          ? {
              min: formData.salaryMin ? parseInt(formData.salaryMin) : 0,
              max: formData.salaryMax ? parseInt(formData.salaryMax) : 0,
              currency: formData.salaryCurrency,
              negotiable: true,
            }
          : undefined;

      const success = await onSave({
        autofillData: {
          // Defaults for required boolean fields (in case autofillData is undefined)
          linkedInConsent: false,
          portfolioConsent: false,
          backgroundCheckConsent: false,
          drugTestConsent: false,
          currentlyEmployed: false,
          ...profile.autofillData,
          // Address fields
          streetAddress: formData.streetAddress || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          zipCode: formData.zipCode || undefined,
          country: formData.country || undefined,
          // Work Authorization
          workAuthorization: formData.workAuthorization as
            | 'citizen'
            | 'permanent_resident'
            | 'visa'
            | 'other',
          workAuthorizationText:
            formData.workAuthorization === 'citizen'
              ? 'US Citizen'
              : formData.workAuthorization === 'permanent_resident'
                ? 'Permanent Resident'
                : formData.workAuthorization === 'visa'
                  ? formData.visaType || 'Work Visa'
                  : 'Other',
          visaType: formData.visaType || undefined,
          requiresSponsorship: formData.requiresSponsorship,
          // Security & Background
          securityClearance: formData.securityClearance as
            | 'none'
            | 'public_trust'
            | 'secret'
            | 'top_secret'
            | 'ts_sci',
          canPassBackgroundCheck: formData.canPassBackgroundCheck,
          canPassDrugTest: formData.canPassDrugTest,
          // Languages
          languages: formData.languages
            ? formData.languages
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : ['English'],
          availableStartDate: formData.availableStartDate || undefined,
          noticePeriod: formData.noticePeriod || undefined,
          canStartImmediately: formData.availableStartDate === 'Immediately',
          willingToRelocate: formData.willingToRelocate,
          remotePreference: formData.workPreference as 'remote' | 'hybrid' | 'onsite' | 'flexible',
          relocationPreferences: formData.preferredLocations
            ? formData.preferredLocations
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          salaryExpectations,
          demographics: {
            gender: formData.gender || undefined,
            pronouns: formData.pronouns || undefined,
            ethnicity: formData.ethnicity || undefined,
            race: formData.race || undefined,
            veteranStatus: formData.veteranStatus || undefined,
            disabilityStatus: formData.disabilityStatus || undefined,
          },
        },
      });

      if (success) {
        setSaveMessage({ type: 'success', text: 'Settings saved successfully!' });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: 'Failed to save settings' });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: 'Error saving settings' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="autofill-settings">
      <div className="settings-intro">
        <p>
          Configure your default answers for common application questions. These will be used to
          automatically fill checkbox groups, dropdowns, and other fields on job applications.
        </p>
      </div>

      {saveMessage && (
        <div className={`save-message ${saveMessage.type}`}>
          {saveMessage.type === 'success' ? (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          {saveMessage.text}
        </div>
      )}

      {/* Address Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Address
        </h3>
        <p className="section-hint">
          Your address for job applications. This will auto-fill address fields on forms.
        </p>

        <div className="form-group">
          <label>Street Address</label>
          <input
            type="text"
            value={formData.streetAddress}
            onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
            placeholder="123 Main Street, Apt 4B"
          />
        </div>

        <div className="form-row two-col">
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Jersey City"
            />
          </div>

          <div className="form-group">
            <label>State</label>
            <input
              type="text"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="NJ"
            />
          </div>
        </div>

        <div className="form-row two-col">
          <div className="form-group">
            <label>ZIP Code</label>
            <input
              type="text"
              value={formData.zipCode}
              onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
              placeholder="07302"
            />
          </div>

          <div className="form-group">
            <label>Country</label>
            <input
              type="text"
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              placeholder="United States"
            />
          </div>
        </div>
      </div>

      {/* Work Authorization Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Work Authorization
        </h3>

        <div className="form-group">
          <label>Authorization Status *</label>
          <select
            value={formData.workAuthorization}
            onChange={(e) =>
              setFormData({
                ...formData,
                workAuthorization: e.target.value as
                  | 'citizen'
                  | 'permanent_resident'
                  | 'visa'
                  | 'other',
              })
            }
          >
            <option value="citizen">US Citizen</option>
            <option value="permanent_resident">Permanent Resident / Green Card</option>
            <option value="visa">Work Visa</option>
            <option value="other">Other</option>
          </select>
        </div>

        {formData.workAuthorization === 'visa' && (
          <>
            <div className="form-group">
              <label>Visa Type</label>
              <select
                value={formData.visaType}
                onChange={(e) => setFormData({ ...formData, visaType: e.target.value })}
              >
                <option value="">Select visa type...</option>
                <option value="H-1B">H-1B (Specialty Occupation)</option>
                <option value="L-1">L-1 (Intracompany Transfer)</option>
                <option value="E-3">E-3 (Australian Specialty)</option>
                <option value="TN">TN (NAFTA/USMCA)</option>
                <option value="O-1">O-1 (Extraordinary Ability)</option>
                <option value="F-1 OPT">F-1 OPT (Student)</option>
                <option value="F-1 CPT">F-1 CPT (Student)</option>
                <option value="J-1">J-1 (Exchange Visitor)</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.requiresSponsorship}
                  onChange={(e) =>
                    setFormData({ ...formData, requiresSponsorship: e.target.checked })
                  }
                />
                <span>I require visa sponsorship</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* Security & Background Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Security & Background
        </h3>
        <p className="section-hint">Some jobs require security clearance or background checks.</p>

        <div className="form-group">
          <label>Security Clearance</label>
          <select
            value={formData.securityClearance}
            onChange={(e) =>
              setFormData({
                ...formData,
                securityClearance: e.target.value as
                  | 'none'
                  | 'public_trust'
                  | 'secret'
                  | 'top_secret'
                  | 'ts_sci',
              })
            }
          >
            <option value="none">None</option>
            <option value="public_trust">Public Trust</option>
            <option value="secret">Secret</option>
            <option value="top_secret">Top Secret</option>
            <option value="ts_sci">TS/SCI</option>
          </select>
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.canPassBackgroundCheck}
              onChange={(e) =>
                setFormData({ ...formData, canPassBackgroundCheck: e.target.checked })
              }
            />
            <span>I can pass a background check</span>
          </label>
        </div>

        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.canPassDrugTest}
              onChange={(e) => setFormData({ ...formData, canPassDrugTest: e.target.checked })}
            />
            <span>I can pass a drug test</span>
          </label>
        </div>
      </div>

      {/* Languages Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
          </svg>
          Languages
        </h3>
        <p className="section-hint">Languages you speak (separate with commas).</p>

        <div className="form-group">
          <label>Languages Spoken</label>
          <input
            type="text"
            value={formData.languages}
            onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
            placeholder="English, Spanish, Mandarin"
          />
        </div>
      </div>

      {/* Availability Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Availability
        </h3>

        <div className="form-row two-col">
          <div className="form-group">
            <label>Available Start Date</label>
            <select
              value={formData.availableStartDate}
              onChange={(e) => setFormData({ ...formData, availableStartDate: e.target.value })}
            >
              <option value="Immediately">Immediately</option>
              <option value="2 weeks">2 Weeks Notice</option>
              <option value="1 month">1 Month Notice</option>
              <option value="2 months">2 Months Notice</option>
              <option value="3 months">3 Months Notice</option>
            </select>
          </div>

          <div className="form-group">
            <label>Notice Period (if employed)</label>
            <input
              type="text"
              value={formData.noticePeriod}
              onChange={(e) => setFormData({ ...formData, noticePeriod: e.target.value })}
              placeholder="e.g., 2 weeks"
            />
          </div>
        </div>
      </div>

      {/* Work Preferences Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Work Preferences
        </h3>

        <div className="form-row two-col">
          <div className="form-group">
            <label>Work Location Preference</label>
            <select
              value={formData.workPreference}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  workPreference: e.target.value as 'remote' | 'hybrid' | 'onsite' | 'flexible',
                })
              }
            >
              <option value="flexible">Flexible / Open to All</option>
              <option value="remote">Remote Only</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-Site</option>
            </select>
          </div>

          <div className="form-group checkbox-group" style={{ paddingTop: '28px' }}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.willingToRelocate}
                onChange={(e) => setFormData({ ...formData, willingToRelocate: e.target.checked })}
              />
              <span>Willing to relocate</span>
            </label>
          </div>
        </div>

        {formData.willingToRelocate && (
          <div className="form-group">
            <label>Preferred Locations (comma-separated)</label>
            <input
              type="text"
              value={formData.preferredLocations}
              onChange={(e) => setFormData({ ...formData, preferredLocations: e.target.value })}
              placeholder="e.g., San Francisco, New York, Austin"
            />
          </div>
        )}
      </div>

      {/* Salary Section */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Salary Expectations
        </h3>

        <div className="form-row three-col">
          <div className="form-group">
            <label>Minimum</label>
            <input
              type="number"
              value={formData.salaryMin}
              onChange={(e) => setFormData({ ...formData, salaryMin: e.target.value })}
              placeholder="e.g., 120000"
            />
          </div>

          <div className="form-group">
            <label>Maximum</label>
            <input
              type="number"
              value={formData.salaryMax}
              onChange={(e) => setFormData({ ...formData, salaryMax: e.target.value })}
              placeholder="e.g., 160000"
            />
          </div>

          <div className="form-group">
            <label>Currency</label>
            <select
              value={formData.salaryCurrency}
              onChange={(e) => setFormData({ ...formData, salaryCurrency: e.target.value })}
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (C$)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Demographics Section (EEO) */}
      <div className="settings-section">
        <h3>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Demographics (EEO)
          <span className="section-hint">Optional - for Equal Employment Opportunity forms</span>
        </h3>

        <div className="form-row two-col">
          <div className="form-group">
            <label>Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-binary">Non-binary</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="form-group">
            <label>Pronouns</label>
            <select
              value={formData.pronouns}
              onChange={(e) => setFormData({ ...formData, pronouns: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="he/him">He/Him</option>
              <option value="she/her">She/Her</option>
              <option value="they/them">They/Them</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="form-row two-col">
          <div className="form-group">
            <label>Ethnicity</label>
            <select
              value={formData.ethnicity}
              onChange={(e) => setFormData({ ...formData, ethnicity: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="Hispanic or Latino">Hispanic or Latino</option>
              <option value="Not Hispanic or Latino">Not Hispanic or Latino</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="form-group">
            <label>Race</label>
            <select
              value={formData.race}
              onChange={(e) => setFormData({ ...formData, race: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="American Indian or Alaska Native">
                American Indian or Alaska Native
              </option>
              <option value="Asian">Asian</option>
              <option value="Black or African American">Black or African American</option>
              <option value="Native Hawaiian or Other Pacific Islander">
                Native Hawaiian or Pacific Islander
              </option>
              <option value="White">White</option>
              <option value="Two or More Races">Two or More Races</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div className="form-row two-col">
          <div className="form-group">
            <label>Veteran Status</label>
            <select
              value={formData.veteranStatus}
              onChange={(e) => setFormData({ ...formData, veteranStatus: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="I am a veteran">I am a veteran</option>
              <option value="I am not a veteran">I am not a veteran</option>
              <option value="Prefer not to say">Prefer not to say</option>
            </select>
          </div>

          <div className="form-group">
            <label>Disability Status</label>
            <select
              value={formData.disabilityStatus}
              onChange={(e) => setFormData({ ...formData, disabilityStatus: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="Yes, I have a disability">Yes, I have a disability</option>
              <option value="No, I do not have a disability">No, I do not have a disability</option>
              <option value="I do not wish to answer">I do not wish to answer</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="spinner-sm"></div>
              Saving...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
