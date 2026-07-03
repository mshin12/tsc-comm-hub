import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

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

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  const { messages, systemPrompt } = req.body || {};
 
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }
 
  if (typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: '"systemPrompt" must be a string.' });
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