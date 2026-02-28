/**
 * Other Backgrounds - Healthcare, Finance, Legal, Education
 * Full 4-layer keyword databases organized by skill area
 */

import type { KeywordEntry } from '@shared/types/background.types';

// =====================================================================
// HEALTHCARE
// =====================================================================

// Clinical Skills
export const CLINICAL_SKILLS_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Patient Care',
    variations: ['patient-centered', 'patient safety', 'patient-centered care'],
    weight: 2.0,
    isCore: true,
  },
  {
    name: 'Clinical',
    variations: ['clinical experience', 'clinical skills', 'clinical practice'],
    weight: 1.9,
    isCore: true,
  },
  {
    name: 'Patient Assessment',
    variations: ['patient evaluation', 'nursing assessment', 'health assessment'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Vital Signs',
    variations: ['vitals', 'patient vitals', 'vital sign monitoring'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Triage',
    variations: ['patient triage', 'emergency triage'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Medication Administration',
    variations: ['med admin', 'dispensing medication', 'drug administration'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Wound Care',
    variations: ['wound management', 'wound dressing', 'wound assessment'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'IV Therapy',
    variations: ['intravenous therapy', 'iv insertion', 'infusion therapy'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Catheterization',
    variations: ['catheter insertion', 'foley catheter', 'urinary catheter'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Phlebotomy',
    variations: ['blood draw', 'venipuncture', 'blood collection'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Charting',
    variations: ['medical documentation', 'clinical documentation', 'nursing notes'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Physical Examination',
    variations: ['physical exam', 'physical assessment'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Diagnosis',
    variations: ['diagnostic', 'differential diagnosis', 'clinical diagnosis'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Treatment Plan',
    variations: ['treatment planning', 'care plan', 'care planning'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Emergency Care',
    variations: ['emergency medicine', 'acute care', 'critical care'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Surgical',
    variations: ['surgery', 'surgical assistance', 'pre-operative', 'post-operative'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Laboratory',
    variations: ['lab work', 'lab results', 'laboratory testing'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Rehabilitation',
    variations: ['rehab', 'physical therapy', 'occupational therapy'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Pediatrics',
    variations: ['pediatric', 'pediatric care', 'child health'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Geriatrics',
    variations: ['geriatric', 'elderly care', 'senior care'],
    weight: 1.4,
    isCore: false,
  },
];

// Patient Care & Communication
export const PATIENT_CARE_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Bedside Manner',
    variations: ['compassionate care', 'empathy', 'empathetic'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Patient Advocacy',
    variations: ['patient advocate', 'patient rights'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Discharge Planning',
    variations: ['discharge', 'transition of care', 'continuity of care'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Patient Education',
    variations: ['health education', 'family education', 'patient teaching'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Palliative Care',
    variations: ['end-of-life care', 'hospice', 'comfort care'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Mental Health',
    variations: ['behavioral health', 'psychiatric', 'psychiatric nursing'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Pain Management',
    variations: ['pain assessment', 'pain control'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Case Management',
    variations: ['case manager', 'care coordination', 'care coordinator'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Interdisciplinary Team',
    variations: ['multidisciplinary team', 'collaborative care', 'team-based care'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Cultural Competence',
    variations: ['cultural sensitivity', 'diversity in healthcare'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Family-Centered Care',
    variations: ['family involvement', 'family communication'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Home Health',
    variations: ['home healthcare', 'home care', 'visiting nurse'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Chronic Disease Management',
    variations: ['chronic care', 'disease management'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Wellness',
    variations: ['health promotion', 'preventive care', 'health screening'],
    weight: 1.4,
    isCore: false,
  },
];

// Healthcare Technology
export const HEALTHCARE_TECHNOLOGY_KEYWORDS: KeywordEntry[] = [
  {
    name: 'EMR',
    variations: ['ehr', 'electronic medical records', 'electronic health records'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Epic',
    variations: ['epic systems', 'epic ehr', 'epic emr'],
    weight: 1.7,
    isCore: false,
  },
  { name: 'Cerner', variations: ['cerner ehr', 'cerner millennium'], weight: 1.6, isCore: false },
  {
    name: 'Meditech',
    variations: ['meditech ehr', 'meditech expanse'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'CPOE',
    variations: ['computerized physician order entry', 'electronic ordering'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Telemedicine',
    variations: ['telehealth', 'virtual care', 'remote patient monitoring'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'PACS',
    variations: ['picture archiving', 'medical imaging systems'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Medical Devices',
    variations: ['biomedical equipment', 'medical equipment'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Health Informatics',
    variations: ['clinical informatics', 'healthcare informatics', 'medical informatics'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'HL7',
    variations: ['health level 7', 'fhir', 'healthcare interoperability'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Clinical Decision Support',
    variations: ['cds', 'decision support system'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Patient Portal',
    variations: ['patient portal management', 'mychart'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Barcode Medication Administration',
    variations: ['bcma', 'barcode scanning'],
    weight: 1.3,
    isCore: false,
  },
];

// Healthcare Compliance
export const HEALTHCARE_COMPLIANCE_KEYWORDS: KeywordEntry[] = [
  {
    name: 'HIPAA',
    variations: ['hipaa compliance', 'patient privacy', 'phi protection'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'JCAHO',
    variations: ['joint commission', 'accreditation', 'joint commission accreditation'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'CMS',
    variations: ['centers for medicare', 'medicare', 'medicaid'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Infection Control',
    variations: ['infection prevention', 'infection control practices', 'hand hygiene'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Quality Measures',
    variations: ['quality improvement', 'quality assurance', 'performance improvement'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Patient Safety',
    variations: ['safety protocols', 'fall prevention', 'medication safety'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Risk Management',
    variations: ['healthcare risk', 'incident reporting'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'OSHA',
    variations: ['occupational safety', 'workplace safety'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'FDA',
    variations: ['food and drug administration', 'fda regulations'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Clinical Trials',
    variations: ['research protocol', 'irb', 'institutional review board'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Evidence-Based Practice',
    variations: ['evidence-based', 'ebp', 'best practices'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Regulatory Compliance',
    variations: ['state regulations', 'federal regulations', 'healthcare regulations'],
    weight: 1.5,
    isCore: false,
  },
];

// Healthcare Administration
export const HEALTHCARE_ADMIN_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Healthcare Administration',
    variations: ['health administration', 'hospital administration'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Medical Billing',
    variations: ['medical coding', 'billing and coding', 'claims processing'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'ICD-10',
    variations: ['icd coding', 'icd-10-cm', 'diagnostic coding'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'CPT',
    variations: ['cpt codes', 'procedure coding', 'cpt coding'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Insurance Verification',
    variations: ['insurance', 'health insurance', 'prior authorization'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Revenue Cycle',
    variations: ['revenue cycle management', 'rcm'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Scheduling',
    variations: ['patient scheduling', 'appointment scheduling', 'staff scheduling'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Credentialing',
    variations: ['provider credentialing', 'privileging'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Utilization Review',
    variations: ['utilization management', 'ur'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Population Health',
    variations: ['population health management', 'community health'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Healthcare Operations',
    variations: ['hospital operations', 'clinical operations'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Managed Care',
    variations: ['managed care organization', 'mco', 'hmo', 'ppo'],
    weight: 1.4,
    isCore: false,
  },
];

// Healthcare Certifications
export const HEALTHCARE_CERTIFICATIONS_KEYWORDS: KeywordEntry[] = [
  { name: 'Nursing', variations: ['nurse', 'rn', 'registered nurse'], weight: 1.8, isCore: true },
  {
    name: 'LPN',
    variations: ['licensed practical nurse', 'lvn', 'licensed vocational nurse'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Nurse Practitioner',
    variations: ['np', 'aprn', 'advanced practice'],
    weight: 1.7,
    isCore: false,
  },
  { name: 'Physician Assistant', variations: ['pa', 'pa-c'], weight: 1.6, isCore: false },
  { name: 'CPR', variations: ['cpr certified', 'cpr certification'], weight: 1.5, isCore: false },
  { name: 'BLS', variations: ['basic life support', 'bls certified'], weight: 1.5, isCore: false },
  {
    name: 'ACLS',
    variations: ['advanced cardiac life support', 'acls certified'],
    weight: 1.5,
    isCore: false,
  },
  { name: 'PALS', variations: ['pediatric advanced life support'], weight: 1.4, isCore: false },
  {
    name: 'CNA',
    variations: ['certified nursing assistant', 'nursing assistant'],
    weight: 1.4,
    isCore: false,
  },
  { name: 'BSN', variations: ['bachelor of science in nursing'], weight: 1.4, isCore: false },
  { name: 'MSN', variations: ['master of science in nursing'], weight: 1.4, isCore: false },
  {
    name: 'Medical',
    variations: ['medical care', 'medical knowledge', 'medical practice'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Healthcare',
    variations: ['health care', 'healthcare industry', 'healthcare sector'],
    weight: 1.7,
    isCore: true,
  },
];

// Aggregate
export const HEALTHCARE_KEYWORDS: KeywordEntry[] = [
  ...CLINICAL_SKILLS_KEYWORDS,
  ...PATIENT_CARE_KEYWORDS,
  ...HEALTHCARE_TECHNOLOGY_KEYWORDS,
  ...HEALTHCARE_COMPLIANCE_KEYWORDS,
  ...HEALTHCARE_ADMIN_KEYWORDS,
  ...HEALTHCARE_CERTIFICATIONS_KEYWORDS,
];

// =====================================================================
// FINANCE & ACCOUNTING
// =====================================================================

// Financial Analysis
export const FINANCIAL_ANALYSIS_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Financial Analysis',
    variations: ['financial analyst', 'finance analysis'],
    weight: 2.0,
    isCore: true,
  },
  {
    name: 'Financial Modeling',
    variations: ['financial models', 'financial modelling'],
    weight: 1.9,
    isCore: true,
  },
  {
    name: 'Valuation',
    variations: ['company valuation', 'business valuation', 'asset valuation'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'DCF',
    variations: ['discounted cash flow', 'dcf analysis', 'dcf model'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Ratio Analysis',
    variations: ['financial ratios', 'liquidity ratios'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Variance Analysis',
    variations: ['budget variance', 'cost variance'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Trend Analysis',
    variations: ['financial trends', 'market trends'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Scenario Analysis',
    variations: ['what-if analysis', 'sensitivity analysis'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Financial Reporting',
    variations: ['financial statements', 'financial reports'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Due Diligence',
    variations: ['financial due diligence', 'dd'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Finance',
    variations: ['financial', 'financial services', 'finance industry'],
    weight: 1.9,
    isCore: true,
  },
  { name: 'ROI', variations: ['return on investment', 'roi analysis'], weight: 1.5, isCore: false },
  {
    name: 'Cost-Benefit Analysis',
    variations: ['cost benefit', 'cba'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Break-Even Analysis',
    variations: ['break even', 'breakeven point'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Revenue Analysis',
    variations: ['revenue forecasting', 'revenue growth'],
    weight: 1.5,
    isCore: false,
  },
];

// Accounting
export const ACCOUNTING_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Accounting',
    variations: ['accountant', 'accounting principles'],
    weight: 2.0,
    isCore: true,
  },
  {
    name: 'GAAP',
    variations: ['generally accepted accounting principles', 'us gaap'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'IFRS',
    variations: ['international financial reporting standards'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'General Ledger',
    variations: ['gl', 'ledger', 'general ledger maintenance'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Journal Entries',
    variations: ['journal entry', 'adjusting entries'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Reconciliation',
    variations: ['account reconciliation', 'bank reconciliation'],
    weight: 1.6,
    isCore: false,
  },
  { name: 'Accounts Payable', variations: ['ap', 'a/p', 'payables'], weight: 1.5, isCore: false },
  {
    name: 'Accounts Receivable',
    variations: ['ar', 'a/r', 'receivables', 'collections'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Accruals',
    variations: ['accrual accounting', 'accrued expenses'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Depreciation',
    variations: ['amortization', 'depreciation schedule', 'fixed assets'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Consolidation',
    variations: ['financial consolidation', 'intercompany'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Tax',
    variations: ['taxation', 'tax preparation', 'tax planning', 'tax compliance'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Month-End Close',
    variations: ['month end', 'close process', 'year-end close', 'financial close'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Payroll',
    variations: ['payroll processing', 'payroll management'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Cost Accounting',
    variations: ['cost analysis', 'cost management'],
    weight: 1.5,
    isCore: false,
  },
];

// Budgeting & Forecasting
export const BUDGETING_FORECASTING_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Budgeting',
    variations: ['budget', 'budget management', 'budget planning'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Forecasting',
    variations: ['financial forecasting', 'forecast', 'forecast models'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'P&L',
    variations: ['profit and loss', 'income statement', 'p&l management'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Cash Flow',
    variations: ['cash flow management', 'cash management', 'cash flow analysis'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Working Capital',
    variations: ['working capital management', 'current assets'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Financial Planning',
    variations: ['financial plan', 'strategic financial planning'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'FP&A',
    variations: ['financial planning and analysis', 'fp&a analyst'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Balance Sheet',
    variations: ['financial position', 'balance sheet analysis'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Capital Expenditure',
    variations: ['capex', 'capital spending', 'capital budget'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Operating Budget',
    variations: ['opex', 'operating expenses', 'operational budget'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Treasury',
    variations: ['treasury management', 'treasury operations', 'cash treasury'],
    weight: 1.4,
    isCore: false,
  },
];

// Investment & Banking
export const INVESTMENT_BANKING_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Banking',
    variations: ['bank', 'banking industry', 'commercial banking'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Investment',
    variations: ['investments', 'investment analysis', 'investment management'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Portfolio Management',
    variations: ['portfolio', 'asset management', 'wealth management'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'M&A',
    variations: ['mergers and acquisitions', 'mergers', 'acquisitions'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Underwriting',
    variations: ['underwrite', 'insurance underwriting', 'loan underwriting'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Equity Research',
    variations: ['equity analyst', 'stock research', 'sell-side research'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Fixed Income',
    variations: ['bonds', 'bond trading', 'debt markets'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Derivatives',
    variations: ['options', 'futures', 'swaps', 'hedging'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Securities',
    variations: ['securities trading', 'securities analysis'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Private Equity',
    variations: ['pe', 'venture capital', 'vc', 'buyout'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'IPO',
    variations: ['initial public offering', 'public offering'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Credit Analysis',
    variations: ['credit risk', 'credit assessment', 'creditworthiness'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Loan',
    variations: ['lending', 'loan origination', 'loan servicing'],
    weight: 1.4,
    isCore: false,
  },
];

// Financial Compliance & Audit
export const FINANCIAL_COMPLIANCE_KEYWORDS: KeywordEntry[] = [
  { name: 'CPA', variations: ['certified public accountant'], weight: 1.8, isCore: false },
  { name: 'CFA', variations: ['chartered financial analyst'], weight: 1.7, isCore: false },
  {
    name: 'SOX',
    variations: ['sarbanes-oxley', 'sox compliance', 'section 404'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Audit',
    variations: ['auditing', 'internal audit', 'external audit'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Internal Controls',
    variations: ['internal control', 'control testing', 'control framework'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Risk Management',
    variations: ['financial risk', 'risk assessment', 'risk mitigation'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Compliance',
    variations: ['regulatory compliance', 'financial compliance'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'AML',
    variations: ['anti-money laundering', 'anti money laundering'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'KYC',
    variations: ['know your customer', 'customer due diligence'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'SEC',
    variations: ['securities and exchange commission', 'sec reporting', 'sec filings'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'FINRA',
    variations: ['financial industry regulatory authority'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Fraud Detection',
    variations: ['fraud prevention', 'forensic accounting'],
    weight: 1.4,
    isCore: false,
  },
];

// Finance Tools
export const FINANCE_TOOLS_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Excel',
    variations: ['advanced excel', 'financial modeling excel', 'vlookup', 'pivot tables'],
    weight: 1.8,
    isCore: true,
  },
  { name: 'SAP', variations: ['sap erp', 'sap fico', 'sap s/4hana'], weight: 1.6, isCore: false },
  {
    name: 'Oracle Financials',
    variations: ['oracle finance', 'oracle erp'],
    weight: 1.5,
    isCore: false,
  },
  { name: 'QuickBooks', variations: ['quickbooks online', 'qbo'], weight: 1.5, isCore: false },
  { name: 'NetSuite', variations: ['netsuite erp', 'oracle netsuite'], weight: 1.5, isCore: false },
  {
    name: 'Bloomberg',
    variations: ['bloomberg terminal', 'bloomberg data'],
    weight: 1.5,
    isCore: false,
  },
  { name: 'Power BI', variations: ['powerbi', 'power bi dashboard'], weight: 1.4, isCore: false },
  {
    name: 'Tableau',
    variations: ['tableau financial', 'tableau dashboard'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Hyperion',
    variations: ['oracle hyperion', 'hyperion planning'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Workday',
    variations: ['workday financials', 'workday adaptive'],
    weight: 1.4,
    isCore: false,
  },
  { name: 'SQL', variations: ['sql queries', 'database queries'], weight: 1.4, isCore: false },
  {
    name: 'VBA',
    variations: ['visual basic', 'excel macros', 'macro'],
    weight: 1.3,
    isCore: false,
  },
  { name: 'Sage', variations: ['sage accounting', 'sage intacct'], weight: 1.3, isCore: false },
];

// Aggregate
export const FINANCE_KEYWORDS: KeywordEntry[] = [
  ...FINANCIAL_ANALYSIS_KEYWORDS,
  ...ACCOUNTING_KEYWORDS,
  ...BUDGETING_FORECASTING_KEYWORDS,
  ...INVESTMENT_BANKING_KEYWORDS,
  ...FINANCIAL_COMPLIANCE_KEYWORDS,
  ...FINANCE_TOOLS_KEYWORDS,
];

// =====================================================================
// LEGAL
// =====================================================================

// Legal Practice Areas
export const LEGAL_PRACTICE_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Legal',
    variations: ['legal services', 'legal industry', 'legal department'],
    weight: 2.0,
    isCore: true,
  },
  {
    name: 'Attorney',
    variations: ['lawyer', 'counsel', 'legal counsel'],
    weight: 1.9,
    isCore: true,
  },
  {
    name: 'Litigation',
    variations: ['litigator', 'trial', 'trial attorney', 'courtroom'],
    weight: 1.8,
    isCore: false,
  },
  {
    name: 'Corporate Law',
    variations: ['corporate legal', 'business law', 'corporate transactions'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Intellectual Property',
    variations: ['ip', 'patents', 'trademarks', 'copyright', 'ip law'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Employment Law',
    variations: ['labor law', 'hr law', 'workplace law'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Real Estate Law',
    variations: ['property law', 'real estate transactions'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Regulatory',
    variations: ['regulatory law', 'regulatory affairs', 'government relations'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Environmental Law',
    variations: ['environmental compliance', 'environmental regulation'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Immigration Law',
    variations: ['immigration', 'visa', 'work permit'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Bankruptcy',
    variations: ['bankruptcy law', 'insolvency', 'restructuring'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Family Law',
    variations: ['divorce', 'custody', 'family court'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Criminal Law',
    variations: ['criminal defense', 'prosecution', 'criminal justice'],
    weight: 1.4,
    isCore: false,
  },
  { name: 'Tax Law', variations: ['tax attorney', 'tax litigation'], weight: 1.4, isCore: false },
  {
    name: 'Healthcare Law',
    variations: ['health law', 'medical malpractice'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Privacy Law',
    variations: ['data privacy', 'gdpr', 'ccpa', 'privacy compliance'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Mergers and Acquisitions',
    variations: ['m&a', 'deal negotiation', 'transaction'],
    weight: 1.5,
    isCore: false,
  },
];

// Legal Research & Writing
export const LEGAL_RESEARCH_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Legal Research',
    variations: ['legal analysis', 'case research', 'legal investigation'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Legal Writing',
    variations: ['legal drafting', 'briefs', 'legal memoranda'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Case Law',
    variations: ['case precedent', 'judicial opinions', 'court decisions'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Statutory Interpretation',
    variations: ['statutory analysis', 'legislative analysis'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Memorandum',
    variations: ['legal memo', 'memo of law', 'research memo'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Brief Writing',
    variations: ['appellate brief', 'motion brief', 'summary judgment'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Motions',
    variations: ['motion practice', 'filing motions', 'motion to dismiss'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Discovery',
    variations: ['civil discovery', 'interrogatories', 'depositions'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Pleadings',
    variations: ['complaint', 'answer', 'counterclaim'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Legal Opinions',
    variations: ['legal opinion letter', 'advisory opinion'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Citation',
    variations: ['legal citation', 'bluebook', 'case citation'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Argumentation',
    variations: ['legal argument', 'oral argument', 'advocacy'],
    weight: 1.5,
    isCore: false,
  },
];

// Contract Management
export const CONTRACT_MANAGEMENT_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Contract',
    variations: ['contracts', 'contract law', 'contract drafting'],
    weight: 1.9,
    isCore: true,
  },
  {
    name: 'Negotiation',
    variations: ['negotiating', 'settlement', 'deal negotiation'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Contract Review',
    variations: ['contract analysis', 'agreement review'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Redlining',
    variations: ['contract markup', 'redline', 'track changes'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'NDA',
    variations: ['non-disclosure agreement', 'confidentiality agreement'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'SLA',
    variations: ['service level agreement', 'service agreement'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'MSA',
    variations: ['master service agreement', 'master agreement'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Licensing',
    variations: ['license agreement', 'software license', 'intellectual property license'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Amendment',
    variations: ['contract amendment', 'modification'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Terms and Conditions',
    variations: ['terms of service', 'tos'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Procurement',
    variations: ['vendor contracts', 'supplier agreements'],
    weight: 1.3,
    isCore: false,
  },
  { name: 'RFP', variations: ['request for proposal', 'rfp response'], weight: 1.3, isCore: false },
];

// Legal Tools & Technology
export const LEGAL_TOOLS_KEYWORDS: KeywordEntry[] = [
  { name: 'Westlaw', variations: ['westlaw edge', 'westlaw research'], weight: 1.6, isCore: false },
  {
    name: 'LexisNexis',
    variations: ['lexis', 'lexis nexis', 'lexis advance'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'PACER',
    variations: ['federal court records', 'court filings'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'E-Discovery',
    variations: ['electronic discovery', 'ediscovery'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Relativity',
    variations: ['relativity ediscovery', 'kCura'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Document Management',
    variations: ['dms', 'document management system', 'imanage', 'netdocuments'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Case Management',
    variations: ['matter management', 'case management system', 'clio'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Legal Billing',
    variations: ['time tracking', 'billable hours', 'legal invoicing'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Contract Lifecycle Management',
    variations: ['clm', 'contract management software'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Legal Analytics',
    variations: ['litigation analytics', 'legal data'],
    weight: 1.3,
    isCore: false,
  },
];

// Legal Compliance & Governance
export const LEGAL_COMPLIANCE_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Compliance',
    variations: ['regulatory compliance', 'legal compliance', 'compliance program'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Due Diligence',
    variations: ['dd', 'legal due diligence', 'transactional due diligence'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Corporate Governance',
    variations: ['governance', 'board governance', 'corporate secretary'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Risk Assessment',
    variations: ['legal risk', 'risk evaluation', 'risk analysis'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Policy Development',
    variations: ['policy drafting', 'policy review', 'corporate policies'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'SEC Filings',
    variations: ['sec reporting', '10-k', '10-q', 'proxy statement'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'GDPR',
    variations: ['data protection', 'data privacy regulation'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Ethics',
    variations: ['legal ethics', 'professional responsibility', 'code of conduct'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Anti-Trust',
    variations: ['antitrust', 'competition law', 'antitrust compliance'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Paralegal',
    variations: ['legal assistant', 'litigation support'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'JD',
    variations: ['juris doctor', 'law degree', 'jd degree'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Bar Admission',
    variations: ['bar certified', 'licensed attorney', 'bar exam'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Client Relations',
    variations: ['client management', 'client service', 'client counseling'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Document Review',
    variations: ['doc review', 'document analysis'],
    weight: 1.4,
    isCore: false,
  },
];

// Aggregate
export const LEGAL_KEYWORDS: KeywordEntry[] = [
  ...LEGAL_PRACTICE_KEYWORDS,
  ...LEGAL_RESEARCH_KEYWORDS,
  ...CONTRACT_MANAGEMENT_KEYWORDS,
  ...LEGAL_TOOLS_KEYWORDS,
  ...LEGAL_COMPLIANCE_KEYWORDS,
];

// =====================================================================
// EDUCATION
// =====================================================================

// Teaching & Instruction
export const TEACHING_INSTRUCTION_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Teaching',
    variations: ['teacher', 'educator', 'instruction', 'instructor'],
    weight: 2.0,
    isCore: true,
  },
  {
    name: 'Differentiated Instruction',
    variations: ['differentiation', 'individualized learning', 'personalized learning'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Scaffolding',
    variations: ['instructional scaffolding', 'guided practice'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Formative Assessment',
    variations: ['formative evaluation', 'check for understanding'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Summative Assessment',
    variations: ['summative evaluation', 'final exam', 'standardized testing'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Rubrics',
    variations: ['rubric design', 'assessment rubric', 'grading rubric'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Learning Objectives',
    variations: ['learning outcomes', 'student learning objectives', 'slo'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Pedagogy',
    variations: ['pedagogical', 'teaching methods', 'teaching strategies'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Lesson Planning',
    variations: ['lesson plans', 'instructional planning', 'lesson design'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Student Engagement',
    variations: ['engagement', 'active learning', 'student participation'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'Lecture',
    variations: ['lectures', 'seminar', 'workshop facilitation'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Tutoring',
    variations: ['tutor', 'academic support', 'peer tutoring'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'K-12',
    variations: ['k12', 'elementary', 'secondary', 'high school', 'middle school'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Higher Education',
    variations: ['university', 'college', 'professor', 'adjunct'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Student Assessment',
    variations: ['assessment', 'grading', 'evaluation'],
    weight: 1.6,
    isCore: true,
  },
  {
    name: 'Inquiry-Based Learning',
    variations: ['project-based learning', 'pbl', 'experiential learning'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Flipped Classroom',
    variations: ['flipped learning', 'blended instruction'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Cooperative Learning',
    variations: ['group work', 'collaborative learning', 'team-based learning'],
    weight: 1.4,
    isCore: false,
  },
];

// Curriculum Design
export const CURRICULUM_DESIGN_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Curriculum',
    variations: ['curriculum development', 'curriculum design', 'curriculum mapping'],
    weight: 1.9,
    isCore: true,
  },
  {
    name: 'Backward Design',
    variations: ['understanding by design', 'ubd'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Standards Alignment',
    variations: ['common core', 'state standards', 'ngss', 'curriculum standards'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Scope and Sequence',
    variations: ['scope & sequence', 'course outline', 'program design'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Unit Planning',
    variations: ['unit design', 'thematic units'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Course Development',
    variations: ['course design', 'course creation', 'course authoring'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Textbook Selection',
    variations: ['resource selection', 'materials adoption'],
    weight: 1.2,
    isCore: false,
  },
  {
    name: 'Academic Program',
    variations: ['program development', 'program evaluation', 'program accreditation'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: "Bloom's Taxonomy",
    variations: ['blooms taxonomy', 'cognitive levels', 'higher-order thinking'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Competency-Based',
    variations: ['competency-based education', 'cbe', 'mastery-based'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Professional Development',
    variations: ['pd', 'teacher training', 'staff development'],
    weight: 1.5,
    isCore: false,
  },
];

// Student Management & Support
export const STUDENT_MANAGEMENT_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Classroom Management',
    variations: ['classroom', 'behavior management', 'classroom discipline'],
    weight: 1.7,
    isCore: true,
  },
  {
    name: 'Special Education',
    variations: ['sped', 'special needs', 'exceptional students'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: 'IEP',
    variations: ['individualized education program', 'iep development', 'iep meeting'],
    weight: 1.6,
    isCore: false,
  },
  {
    name: '504 Plan',
    variations: ['504 accommodation', 'section 504'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'PBIS',
    variations: ['positive behavioral interventions', 'positive behavior support'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Restorative Practices',
    variations: ['restorative justice', 'restorative discipline'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Student Counseling',
    variations: ['school counselor', 'academic advising', 'guidance counselor'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Parent Communication',
    variations: ['parent engagement', 'parent-teacher conference', 'family engagement'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Inclusion',
    variations: ['inclusive education', 'inclusive classroom', 'mainstream'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'ESL',
    variations: ['esl instruction', 'ell', 'english language learner', 'tesol', 'efl'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Gifted Education',
    variations: ['gifted and talented', 'enrichment', 'advanced placement'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Student Safety',
    variations: ['school safety', 'crisis management', 'emergency procedures'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Academic Integrity',
    variations: ['plagiarism prevention', 'academic honesty'],
    weight: 1.2,
    isCore: false,
  },
];

// Educational Technology
export const EDUCATIONAL_TECHNOLOGY_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Educational Technology',
    variations: ['edtech', 'ed tech', 'education technology'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'E-Learning',
    variations: ['elearning', 'online learning', 'distance learning', 'virtual learning'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'LMS',
    variations: ['learning management system', 'learning platform'],
    weight: 1.6,
    isCore: false,
  },
  { name: 'Canvas', variations: ['canvas lms', 'instructure canvas'], weight: 1.5, isCore: false },
  {
    name: 'Blackboard',
    variations: ['blackboard learn', 'blackboard lms'],
    weight: 1.4,
    isCore: false,
  },
  { name: 'Moodle', variations: ['moodle lms'], weight: 1.3, isCore: false },
  {
    name: 'Google Classroom',
    variations: ['google workspace for education', 'google edu'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Zoom',
    variations: ['virtual classroom', 'video conferencing', 'zoom education'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'SCORM',
    variations: ['scorm compliant', 'scorm package', 'xapi', 'tin can'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Articulate',
    variations: ['articulate storyline', 'articulate rise', 'storyline'],
    weight: 1.4,
    isCore: false,
  },
  { name: 'Captivate', variations: ['adobe captivate'], weight: 1.3, isCore: false },
  {
    name: 'Adaptive Learning',
    variations: ['adaptive technology', 'personalized technology'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Gamification',
    variations: ['game-based learning', 'gamified learning'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Microsoft Teams',
    variations: ['teams for education', 'teams classroom'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Interactive Whiteboard',
    variations: ['smartboard', 'digital whiteboard'],
    weight: 1.2,
    isCore: false,
  },
];

// Training & Development
export const TRAINING_DEVELOPMENT_KEYWORDS: KeywordEntry[] = [
  {
    name: 'Instructional Design',
    variations: ['instructional designer', 'learning design', 'id'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'ADDIE',
    variations: ['addie model', 'analysis design development implementation evaluation'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Training',
    variations: ['trainer', 'corporate training', 'employee training', 'training program'],
    weight: 1.8,
    isCore: true,
  },
  {
    name: 'Blended Learning',
    variations: ['hybrid learning', 'mixed-mode learning'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Needs Assessment',
    variations: ['training needs analysis', 'learning needs assessment'],
    weight: 1.4,
    isCore: false,
  },
  {
    name: 'Facilitation',
    variations: ['facilitator', 'workshop facilitation', 'group facilitation'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Onboarding',
    variations: ['new hire training', 'employee orientation', 'onboarding program'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Learning and Development',
    variations: ['l&d', 'talent development', 'organizational learning'],
    weight: 1.7,
    isCore: false,
  },
  {
    name: 'Coaching',
    variations: ['mentoring', 'performance coaching', 'executive coaching'],
    weight: 1.5,
    isCore: false,
  },
  {
    name: 'Knowledge Management',
    variations: ['knowledge base', 'knowledge transfer', 'knowledge sharing'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'ROI of Training',
    variations: ['training effectiveness', 'kirkpatrick model', 'learning metrics'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Microlearning',
    variations: ['bite-sized learning', 'just-in-time learning'],
    weight: 1.3,
    isCore: false,
  },
  {
    name: 'Teaching Credential',
    variations: ['teaching certificate', 'teaching license', 'state certification'],
    weight: 1.5,
    isCore: false,
  },
];

// Aggregate
export const EDUCATION_KEYWORDS: KeywordEntry[] = [
  ...TEACHING_INSTRUCTION_KEYWORDS,
  ...CURRICULUM_DESIGN_KEYWORDS,
  ...STUDENT_MANAGEMENT_KEYWORDS,
  ...EDUCATIONAL_TECHNOLOGY_KEYWORDS,
  ...TRAINING_DEVELOPMENT_KEYWORDS,
];

// =====================================================================
// PATTERN GENERATORS
// =====================================================================

function makePatterns(keywords: KeywordEntry[]): [RegExp, string][] {
  return keywords.map((kw) => {
    const allTerms = [kw.name, ...kw.variations];
    const escapedTerms = allTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');
    return [pattern, kw.name];
  });
}

export function getHealthcarePatterns(): [RegExp, string][] {
  return makePatterns(HEALTHCARE_KEYWORDS);
}

export function getFinancePatterns(): [RegExp, string][] {
  return makePatterns(FINANCE_KEYWORDS);
}

export function getLegalPatterns(): [RegExp, string][] {
  return makePatterns(LEGAL_KEYWORDS);
}

export function getEducationPatterns(): [RegExp, string][] {
  return makePatterns(EDUCATION_KEYWORDS);
}
