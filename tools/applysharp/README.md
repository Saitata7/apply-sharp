# ApplySharp CLI bridge

Drive ApplySharp from outside the browser. Claude Code (or any shell user) can
read/write a local state file; the extension consumes it via Data Manager →
Import. Round-trip works the other way too: Data Manager → Export drops a
JSON you can replace this state with.

## Why this exists

Chrome extensions are sandboxed — there is no path on disk that ApplySharp
auto-watches. The bridge is one click on each side:

```
┌─────────────────┐                  ┌──────────────────────┐
│  CLI / Claude   │  state.json      │   ApplySharp         │
│  Code mutates   │ ───────────────▶ │   DataManager Import │
│  state.json     │                  │                      │
│                 │ ◀─────────────── │   DataManager Export │
└─────────────────┘   state.json     └──────────────────────┘
```

This is intentionally simple. A proper Native Messaging host or MCP server
can replace the manual click later — the JSON shape stays the same.

## Quick start

```bash
# 1. Initialize a fresh state file (creates tools/applysharp/state.json):
npm run applysharp:init

# 2. Add skills, experience, etc. — see commands below.
node tools/applysharp/cli.mjs add-skill "Java"
node tools/applysharp/cli.mjs add-experience \
  --company "Acme Corp" --title "Backend GenAI Engineer" \
  --start "2024-01" --current

# 3. Inspect the state:
node tools/applysharp/cli.mjs show

# 4. Print the absolute path to import in DataManager:
node tools/applysharp/cli.mjs path

# 5. Open ApplySharp → Data Manager → Import → pick that file.
```

## Commands

| Command                                                                                       | What it does                                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `init`                                                                                        | Create a fresh empty state.json (won't overwrite). Pass `--force` to replace. |
| `show`                                                                                        | Dump the current profile in human-readable form.                              |
| `path`                                                                                        | Print the absolute path to state.json (use this in DataManager Import).       |
| `add-skill NAME`                                                                              | Append a technical skill.                                                     |
| `add-skills "A,B,C"`                                                                          | Append a comma-separated list of skills.                                      |
| `add-experience --company X --title Y [--start ...] [--end ...] [--current] [--bullet "..."]` | Append a work experience entry. Multiple `--bullet` flags supported.          |
| `set-personal --name X --email Y [--linkedin ...] [--github ...] [--city ...] [--state ...]`  | Update personal/contact info.                                                 |
| `set-visa --type "F-1 OPT" [--sponsorship]`                                                   | Update autofill work authorization.                                           |
| `pull-from-extension`                                                                         | Tell user the manual sync step (Data Manager → Export, copy file).            |

## Round-trip with the extension

To pull state OUT of the extension into the CLI:

1. Open ApplySharp → Data Manager → Export → save the JSON.
2. `cp ~/Downloads/applysharp-export-*.json tools/applysharp/state.json`
3. Now `cli.mjs show` reflects what's in the extension.

To push state INTO the extension from the CLI:

1. `node tools/applysharp/cli.mjs path` — copy the printed path.
2. Open ApplySharp → Data Manager → Import → paste/upload that file.

## What the state file looks like

It's the ApplySharp `ExportData` shape (same as the extension's Export):

```jsonc
{
  "version": 1,
  "exportedAt": "2026-04-25T...",
  "data": {
    "masterProfiles": [
      {
        /* MasterProfile object */
      },
    ],
    "applications": [],
    "jobs": [],
    "resumeVersions": [],
    "settings": {},
  },
}
```

The CLI mutates `data.masterProfiles[0]` for profile commands.
