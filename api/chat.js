import Anthropic from '@anthropic-ai/sdk';
import { authenticate, assertSessionAccess } from './_lib/supabaseAuth.js';

// Bounds on a single request — cheap to check, and the only thing standing
// between an authorized-but-malicious caller and an unbounded Anthropic bill
// (max_tokens below only caps the *response*, not what we pay for on input).
const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 6000;
const MAX_SYSTEM_PROMPT_LENGTH = 20000;

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

  const { sessionId, messages, systemPrompt } = req.body || {};

  // Every chat turn belongs to a real sessions row. Requiring it here — and
  // checking it through a client scoped to the caller's own JWT — means
  // authorization is enforced by the same RLS policies that already govern
  // who can read a session, instead of this endpoint being reachable by any
  // authenticated account with any content, unrelated to a real session.
  if (!(await assertSessionAccess(auth.userClient, sessionId))) {
    return res.status(403).json({ error: 'You do not have access to this session.' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }

  if (messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: 'Too many messages in this conversation.' });
  }

  if (typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: '"systemPrompt" must be a string.' });
  }

  if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    return res.status(400).json({ error: '"systemPrompt" is too long.' });
  }

  if (messages.some((m) => typeof m?.content !== 'string' || m.content.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ error: 'A message is missing content or is too long.' });
  }

  let anthropic;
  try {
    anthropic = new Anthropic();
  } catch (configError) {
    console.error('Anthropic client configuration error:', configError);
    return res.status(500).json({
      error: 'The assistant is not configured correctly. Please contact your administrator.',
    });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock ? textBlock.text : '';
    const truncated = response.stop_reason === 'max_tokens';

    return res.status(200).json({ text, truncated });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({
      error: 'Failed to get a response from the assistant. Please try again.',
    });
  }
}