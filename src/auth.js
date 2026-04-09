/**
 * LinkedIn OAuth 2.0 Authentication Helper
 * Run: node src/auth.js
 * Generates a fresh LINKEDIN_ACCESS_TOKEN.
 *
 * PHASE 1 — requires only "Sign In with LinkedIn using OpenID Connect" product.
 * PHASE 2 — uncomment PHASE 2 scopes below after MDP is approved, then re-run.
 */

import 'dotenv/config';
import http from 'http';
import { execFile } from 'child_process';
import axios from 'axios';

const CLIENT_ID     = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:3000/callback';
const PORT          = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nERROR: LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set in .env\n');
  process.exit(1);
}

// PHASE 2: MDP approved — core organization page scopes
const SCOPES = [
  'w_organization_social',
  'r_organization_social',
  'rw_organization_admin',
  'w_member_social',
].join(' ');

// PHASE 2 — uncomment after Marketing Developer Platform is approved:
// const SCOPES = [
//   'w_organization_social',
//   'r_organization_social',
//   'w_organization_social_feed',
//   'r_organization_social_feed',
//   'rw_organization_admin',
//   'w_member_social',
// ].join(' ');

const authUrl =
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}`;

console.log('\n[Spreadcom LinkedIn Agent] Starting OAuth flow...\n');
console.log('Opening browser for LinkedIn authorization...');
console.log('If browser does not open, visit this URL manually:\n');
console.log(authUrl, '\n');

const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
execFile(openCmd, [authUrl]);

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return;

  const url   = new URL(req.url, `http://localhost:${PORT}`);
  const code  = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`<h2>Authorization failed: ${error}</h2>`);
    console.error('\nAuthorization denied or failed:', error);
    server.close();
    return;
  }

  try {
    const tokenRes = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Debug: print raw response fields (excluding token value) to diagnose token issues
    console.log('\nToken exchange raw response keys:', Object.keys(tokenRes.data));
    console.log('access_token present:', !!tokenRes.data.access_token);
    console.log('access_token type:', typeof tokenRes.data.access_token);
    console.log('access_token length:', tokenRes.data.access_token?.length);

    const { access_token, expires_in } = tokenRes.data;
    const expiryDays = Math.round((expires_in || 0) / 86400);

    // Immediately test the token before printing it
    console.log('\nTesting token immediately after exchange...');
    try {
      const test = await axios.get('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202501',
        },
      });
      console.log('Token test PASSED — member ID:', test.data.id);
    } catch (testErr) {
      console.log('Token test FAILED:', JSON.stringify(testErr.response?.data));
    }

    res.end('<h2>Authorization successful! You can close this tab.</h2>');

    console.log('\n========================================');
    console.log('SUCCESS — Copy this value into your .env file:');
    console.log('========================================\n');
    console.log(`LINKEDIN_ACCESS_TOKEN=${access_token}`);
    console.log(`\nToken expires in ~${expiryDays} days. Re-run this script to refresh.`);
    console.log(`\nLINKEDIN_PERSON_URN is already set in your .env — no change needed.\n`);

  } catch (err) {
    res.end('<h2>Token exchange failed. Check terminal for details.</h2>');
    console.error('\nToken exchange error:', err.response?.data || err.message);
  }

  server.close();
});

server.listen(PORT, () => {
  console.log(`Listening for OAuth callback on http://localhost:${PORT}/callback\n`);
});
