// api/speechToken.js
// Mints a short-lived Azure Speech authorization token (valid ~10 minutes
// per Azure's docs) so the browser can talk to Azure's Pronunciation
// Assessment service directly over its own WebSocket, without ever seeing
// the real AZURE_SPEECH_KEY. Mirrors api/invite.js's pattern of never
// handing the client a long-lived secret, and api/chat.js/api/tts.js's
// pattern of requiring sessionId + assertSessionAccess so this can't be
// used as an unrelated, unmetered proxy to a paid API by any authenticated
// account.
//
// Requires two Vercel env vars this project doesn't have yet:
//   AZURE_SPEECH_KEY    — the subscription key for an Azure AI Speech resource
//   AZURE_SPEECH_REGION — that resource's region, e.g. "eastus"
// See CLAUDE.md's "Live speech coaching" section for setup steps.

import { authenticate, assertSessionAccess } from './_lib/supabaseAuth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  const auth = await authenticate(token);

  if (!auth) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  const { sessionId } = req.body || {};

  if (!(await assertSessionAccess(auth.userClient, sessionId))) {
    return res.status(403).json({ error: 'You do not have access to this session.' });
  }

  const region = process.env.AZURE_SPEECH_REGION;
  const key = process.env.AZURE_SPEECH_KEY;

  if (!region || !key) {
    console.error('Azure Speech is not configured (missing AZURE_SPEECH_REGION/AZURE_SPEECH_KEY).');
    return res.status(500).json({
      error: 'Speech coaching is not configured. Please contact your administrator.',
    });
  }

  try {
    const tokenRes = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Length': '0',
      },
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Azure Speech token error:', errText);
      return res.status(502).json({ error: 'Could not start speech coaching. Please try again.' });
    }

    const authToken = await tokenRes.text();

    return res.status(200).json({ token: authToken, region });
  } catch (err) {
    console.error('Speech token route error:', err);
    return res.status(500).json({ error: 'internal error' });
  }
}
