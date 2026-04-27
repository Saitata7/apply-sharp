/**
 * Gmail draft creation via the Gmail API, BYOK pattern.
 *
 * The user supplies their own Google OAuth Client ID in settings. ApplySharp
 * never ships its own client ID, which means we never need to go through
 * Google's CASA Tier 2 audit ($500 to $4,500/yr) for the gmail.compose
 * restricted scope. The user stays in their own Google Cloud project's
 * Testing mode (100-user cap, no audit), exactly mirroring how the existing
 * Anthropic / OpenAI / Groq BYOK flow works.
 *
 * The provider ONLY creates drafts. It never calls users.messages.send or
 * any other write scope. The user opens Gmail and clicks send manually. This
 * is both the legally safest scope choice and the right UX pattern: AI
 * generated cold emails should never auto-send.
 *
 * Auth flow: chrome.identity.getAuthToken({ interactive: true }) with the
 * user's client ID. Token is cached by chrome.identity until revoked.
 *
 * Required manifest additions (added in a follow-up commit):
 *   "permissions": ["identity"]
 *   "oauth2": { "client_id": "<user_supplied>", "scopes": ["https://www.googleapis.com/auth/gmail.compose"] }
 *
 * Because the client_id is per-user, we cannot put it in the static
 * manifest. We use the chrome.identity.launchWebAuthFlow path instead,
 * which accepts the client_id at runtime.
 */

const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_API_DRAFTS = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts';

export interface GmailDraftOptions {
  to: string;
  subject: string;
  /** Plain text body. The Gmail API also accepts HTML; we keep it plain to
   *  avoid AI-detection landmines (Gmail's RETVec spam classifier flags
   *  templated HTML cold emails harder than plain text). */
  body: string;
  cc?: string;
  bcc?: string;
}

export interface GmailDraftResult {
  draftId: string;
  /** Pre-filled URL the user can click to open the draft in Gmail compose. */
  composeUrl: string;
}

export interface GmailProviderConfig {
  /** Google OAuth Client ID, from the user's own Google Cloud project. */
  clientId: string;
}

export class GmailProvider {
  readonly name = 'Gmail (BYOK)';
  private clientId: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(config: GmailProviderConfig) {
    if (!config.clientId) {
      throw new Error('Gmail provider requires a Google OAuth Client ID');
    }
    this.clientId = config.clientId;
  }

  /**
   * Acquire an OAuth token via chrome.identity.launchWebAuthFlow.
   *
   * We use launchWebAuthFlow rather than getAuthToken because getAuthToken
   * requires the client_id to be baked into the manifest at build time, which
   * defeats the BYOK pattern. launchWebAuthFlow accepts the client_id at
   * runtime and returns the token via a redirect URL we parse here.
   */
  private async getToken(interactive: boolean = true): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token;
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'token',
      redirect_uri: redirectUri,
      scope: GMAIL_COMPOSE_SCOPE,
      prompt: 'consent',
    });
    const authUrl = `${GOOGLE_AUTH_BASE}?${params.toString()}`;

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive,
    });

    if (!responseUrl) {
      throw new Error('Gmail OAuth was cancelled or failed');
    }

    // The response URL contains a fragment like:
    //   https://<extension>.chromiumapp.org/#access_token=...&expires_in=3600&...
    const fragment = responseUrl.split('#')[1] ?? '';
    const fragmentParams = new URLSearchParams(fragment);
    const token = fragmentParams.get('access_token');
    const expiresIn = parseInt(fragmentParams.get('expires_in') ?? '3600', 10);

    if (!token) {
      const error = fragmentParams.get('error') ?? 'no token in response';
      throw new Error(`Gmail OAuth failed: ${error}`);
    }

    this.cachedToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return token;
  }

  /**
   * Sanitize a header value: strip CR, LF, and NUL (the three bytes that
   * could otherwise inject extra MIME headers via concatenation), then cap
   * length at 998 chars per RFC 5322 line-length limit. Without this guard
   * a recruiter-research payload with `\r\n` in it could inject a hidden
   * Bcc into the draft. The user signs and clicks Send eventually so the
   * injection lands.
   */
  private sanitizeHeader(value: string): string {
    if (!value) return '';
    return (
      value
        // eslint-disable-next-line no-control-regex -- intentional: this is the security guard
        .replace(/[\r\n\u0000]/g, ' ')
        .trim()
        .slice(0, 998)
    );
  }

  /**
   * Build an RFC 2822 message and base64url-encode it for the Gmail API.
   * All header values pass through sanitizeHeader to prevent CRLF injection.
   *
   * Encoding note: the previous version used `btoa(String.fromCharCode(...utf8))`
   * which trips the V8 argument-count limit (~65k bytes) on large messages.
   * Cold emails are capped at 120 words so this never happened in practice,
   * but any future caller with attachments or long bodies would throw a
   * RangeError. The current version chunks the array into 32KB slices and
   * concatenates the encoded base64 at the end.
   */
  private encodeMessage(opts: GmailDraftOptions): string {
    const to = this.sanitizeHeader(opts.to);
    const subject = this.sanitizeHeader(opts.subject);
    const cc = opts.cc ? this.sanitizeHeader(opts.cc) : '';
    const bcc = opts.bcc ? this.sanitizeHeader(opts.bcc) : '';

    const lines = [
      `To: ${to}`,
      ...(cc ? [`Cc: ${cc}`] : []),
      ...(bcc ? [`Bcc: ${bcc}`] : []),
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      opts.body,
    ];
    const raw = lines.join('\r\n');
    const utf8 = new TextEncoder().encode(raw);

    // Chunked binary-string assembly to avoid RangeError on large bodies.
    const CHUNK = 0x8000; // 32KB
    let binary = '';
    for (let i = 0; i < utf8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(utf8.subarray(i, i + CHUNK)));
    }
    let b64 = btoa(binary);
    // base64url: + -> -, / -> _, strip = padding (Gmail API spec).
    b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  }

  /**
   * Create a draft in the user's Gmail. Throws on auth failure or API error.
   * Returns the draft id and a URL the user can open to send it manually.
   */
  async createDraft(opts: GmailDraftOptions): Promise<GmailDraftResult> {
    if (!opts.to) throw new Error('Gmail draft requires a "to" address');
    if (!opts.subject) throw new Error('Gmail draft requires a subject');
    if (!opts.body) throw new Error('Gmail draft requires a body');

    const token = await this.getToken(true);
    const raw = this.encodeMessage(opts);

    const response = await fetch(GMAIL_API_DRAFTS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: { raw } }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Gmail draft create failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as { id: string };
    return {
      draftId: data.id,
      composeUrl: `https://mail.google.com/mail/u/0/#drafts/${data.id}`,
    };
  }

  /**
   * Test that the OAuth flow works without creating a draft. Used by the
   * settings UI to verify the user's Client ID.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getToken(false);
      return true;
    } catch {
      return false;
    }
  }

  /** Force re-auth. Used when the user changes their Client ID. */
  resetCachedToken(): void {
    this.cachedToken = null;
  }
}
