# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.0.x   | yes       |
| < 1.0   | no        |

## Reporting a vulnerability

If you discover a security issue in ApplySharp, please report it privately so we can fix it before public disclosure.

**Preferred channel:** [GitHub Security Advisories](https://github.com/saitata7/apply-sharp/security/advisories/new)

This creates a private, encrypted thread between you and the maintainers.

**What to include:**

- A clear description of the issue and where it lives in the codebase
- Steps to reproduce
- The impact (what an attacker could do)
- Any suggested mitigation

**Response timeline:**

- Acknowledgment within 72 hours
- Initial assessment within 7 days
- Fix released within 30 days for high-severity issues

We follow coordinated disclosure. We will work with you on a timeline that lets us ship a patch before details go public.

## Out of scope

The following are NOT considered vulnerabilities:

- Bugs that require the user to install a malicious extension alongside ApplySharp
- Issues in third-party AI providers (OpenAI, Anthropic, Groq, Ollama). Report those to the providers directly.
- Issues that require physical access to an unlocked machine
- Social engineering attacks

## Security posture

ApplySharp is designed with the following security defaults:

- All user data lives in `chrome.storage.local` and IndexedDB. Nothing is sent to a remote server we control.
- BYOK model: API keys are stored locally and only sent to the provider you configured (OpenAI, Anthropic, Groq, or your local Ollama).
- LinkedIn-related features are off by default and require explicit opt-in via Options.
- Optional company research uses public endpoints (Jina, Wikipedia) only when autofill is invoked.
- No telemetry, no analytics, no crash reporting.

If you find a deviation from these defaults, please report it.
