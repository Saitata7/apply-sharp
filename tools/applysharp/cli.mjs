#!/usr/bin/env node
/**
 * ApplySharp CLI — drive the extension from this terminal.
 *
 * The CLI mutates a local state.json (ExportData shape). The user imports
 * it via DataManager → Import. See README.md for the full workflow.
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import { STATE_PATH, emptyState, loadState, saveState, getProfile } from './state.mjs';

function parseArgs(argv) {
  const args = {};
  const flags = new Set();
  const positional = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags.add(key);
        i++;
      } else {
        if (args[key] === undefined) args[key] = next;
        else if (Array.isArray(args[key])) args[key].push(next);
        else args[key] = [args[key], next];
        i += 2;
      }
    } else {
      positional.push(a);
      i++;
    }
  }
  return { args, flags, positional };
}

function commands() {
  return {
    init,
    show,
    path: showPath,
    'add-skill': addSkill,
    'add-skills': addSkills,
    'add-experience': addExperience,
    'set-personal': setPersonal,
    'set-visa': setVisa,
    'pull-from-extension': pullFromExtension,
    help: showHelp,
  };
}

function showHelp() {
  console.log(`
ApplySharp CLI — drive the extension from outside the browser.

Commands:
  init [--force]                              Create a fresh state.json
  show                                        Print current profile summary
  path                                        Print absolute path of state.json
  add-skill NAME                              Append a technical skill
  add-skills "A,B,C"                          Append a comma-separated list
  add-experience --company X --title Y \\
                 [--start YYYY-MM] [--end YYYY-MM] \\
                 [--current] [--bullet "..."]  Add work experience entry
  set-personal --name "Sai Tata" --email X \\
                 [--linkedin URL] [--github URL] \\
                 [--city X] [--state X]
  set-visa --type "F-1 OPT" [--sponsorship]
  pull-from-extension                         How to copy from extension export

State file: ${STATE_PATH}

Workflow:
  1. Mutate state via CLI
  2. node tools/applysharp/cli.mjs path     # copy the printed path
  3. ApplySharp → Data Manager → Import → paste path
`);
}

function init({ flags }) {
  if (fs.existsSync(STATE_PATH) && !flags.has('force')) {
    console.error(
      `State already exists at ${STATE_PATH}. Pass --force to overwrite.`
    );
    process.exit(1);
  }
  saveState(emptyState());
  console.log(`Created ${STATE_PATH}`);
  console.log(`Next: node tools/applysharp/cli.mjs set-personal --name "Your Name" --email "you@x.com"`);
}

function show() {
  const state = loadState();
  const p = getProfile(state);
  const skills = (p.skills?.technical ?? []).map((s) => s.name).join(', ');
  const exp = (p.experience ?? [])
    .map((e) => `  - ${e.company} (${e.title}) ${e.startDate ?? ''} → ${e.isCurrent ? 'present' : e.endDate ?? ''}`)
    .join('\n');

  console.log(`Name:      ${p.personal?.fullName || '(not set)'}`);
  console.log(`Email:     ${p.personal?.email || '(not set)'}`);
  console.log(`Location:  ${p.personal?.location?.formatted || '(not set)'}`);
  console.log(`LinkedIn:  ${p.personal?.linkedInUrl || '(not set)'}`);
  console.log(`GitHub:    ${p.personal?.githubUrl || '(not set)'}`);
  console.log(`Visa:      ${p.autofillData?.workAuthorization || 'citizen'}${p.autofillData?.visaType ? ` (${p.autofillData.visaType})` : ''}, sponsorship=${p.autofillData?.requiresSponsorship ?? false}`);
  console.log(`Skills (${(p.skills?.technical ?? []).length}): ${skills || '(none)'}`);
  console.log(`Experience (${(p.experience ?? []).length}):\n${exp || '  (none)'}`);
}

function showPath() {
  console.log(STATE_PATH);
}

function addSkill({ positional }) {
  const name = positional[0];
  if (!name) {
    console.error('Usage: cli.mjs add-skill NAME');
    process.exit(1);
  }
  const state = loadState();
  const p = getProfile(state);
  p.skills = p.skills ?? {};
  p.skills.technical = p.skills.technical ?? [];
  if (p.skills.technical.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    console.log(`(skip) ${name} already present`);
    return;
  }
  p.skills.technical.push(skillRecord(name));
  saveState(state);
  console.log(`Added skill: ${name}`);
}

function addSkills({ positional }) {
  const list = positional[0];
  if (!list) {
    console.error('Usage: cli.mjs add-skills "Java,Spring Boot,Kafka"');
    process.exit(1);
  }
  const state = loadState();
  const p = getProfile(state);
  p.skills = p.skills ?? {};
  p.skills.technical = p.skills.technical ?? [];
  const names = list.split(',').map((s) => s.trim()).filter(Boolean);
  let added = 0;
  for (const name of names) {
    if (p.skills.technical.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue;
    p.skills.technical.push(skillRecord(name));
    added++;
  }
  saveState(state);
  console.log(`Added ${added} skill(s) (${names.length - added} duplicate(s) skipped).`);
}

function skillRecord(name) {
  return {
    name,
    normalizedName: name,
    category: 'technical',
    yearsOfExperience: 0,
    proficiency: 'intermediate',
    lastUsed: 'current',
    evidenceFrom: [],
    aliases: [],
  };
}

function addExperience({ args, flags }) {
  const company = args.company;
  const title = args.title;
  if (!company || !title) {
    console.error('Usage: cli.mjs add-experience --company X --title Y [--start YYYY-MM] [--end YYYY-MM] [--current] [--bullet "..."]');
    process.exit(1);
  }
  const state = loadState();
  const p = getProfile(state);
  p.experience = p.experience ?? [];

  const bullets = []
    .concat(args.bullet ?? [])
    .filter(Boolean)
    .map((statement) => ({
      statement,
      isQuantified: /\d/.test(statement),
      keywords: [],
    }));

  p.experience.push({
    id: crypto.randomUUID(),
    company,
    title,
    normalizedTitle: title,
    location: args.location ?? '',
    employmentType: 'full-time',
    startDate: args.start ?? '',
    endDate: args.end,
    isCurrent: flags.has('current'),
    durationMonths: 0,
    description: args.description ?? '',
    achievements: bullets,
    responsibilities: [],
    technologiesUsed: [],
    skillsGained: [],
    relevanceMap: {},
  });
  saveState(state);
  console.log(`Added experience: ${company} — ${title}${flags.has('current') ? ' (current)' : ''}`);
}

function setPersonal({ args }) {
  const state = loadState();
  const p = getProfile(state);
  p.personal = p.personal ?? {};
  p.personal.location = p.personal.location ?? { city: '', state: '', country: 'USA', formatted: '' };

  if (args.name) {
    p.personal.fullName = args.name;
    const parts = args.name.split(/\s+/);
    p.personal.firstName = parts[0] ?? '';
    p.personal.lastName = parts.slice(1).join(' ');
  }
  if (args.email) p.personal.email = args.email;
  if (args.phone) p.personal.phone = args.phone;
  if (args.linkedin) p.personal.linkedInUrl = args.linkedin;
  if (args.github) p.personal.githubUrl = args.github;
  if (args.portfolio) p.personal.portfolioUrl = args.portfolio;
  if (args.city) p.personal.location.city = args.city;
  if (args.state) p.personal.location.state = args.state;
  p.personal.location.formatted = [p.personal.location.city, p.personal.location.state]
    .filter(Boolean)
    .join(', ');
  saveState(state);
  console.log(`Updated personal info.`);
}

function setVisa({ args, flags }) {
  const state = loadState();
  const p = getProfile(state);
  p.autofillData = p.autofillData ?? {};
  if (args.type) {
    p.autofillData.workAuthorization = 'visa';
    p.autofillData.visaType = args.type;
    p.autofillData.workAuthorizationText = `On ${args.type}; require sponsorship.`;
  }
  p.autofillData.requiresSponsorship = flags.has('sponsorship');
  saveState(state);
  console.log(
    `Visa: ${p.autofillData.visaType ?? p.autofillData.workAuthorization}, sponsorship=${p.autofillData.requiresSponsorship}`
  );
}

function pullFromExtension() {
  console.log(`To pull state OUT of the running extension:

  1. Open ApplySharp → Data Manager → Export
  2. Save the file (default goes to ~/Downloads/)
  3. cp ~/Downloads/applysharp-export-*.json ${STATE_PATH}
  4. node tools/applysharp/cli.mjs show     # confirm

After that, all CLI commands operate on what was in your extension.`);
}

const [, , cmd, ...rest] = process.argv;
const handlers = commands();
if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
  showHelp();
  process.exit(0);
}
const handler = handlers[cmd];
if (!handler) {
  console.error(`Unknown command: ${cmd}\n`);
  showHelp();
  process.exit(1);
}
try {
  handler(parseArgs(rest));
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
