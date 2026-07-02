import Anthropic from '@anthropic-ai/sdk';
 
const anthropic = new Anthropic();
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { messages, systemPrompt } = req.body || {};
 
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" must be a non-empty array.' });
  }
 
  if (typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: '"systemPrompt" must be a string.' });
  }
 
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });
 
    const textBlock = response.content.find((block) => block.type === 'text');
    const text = textBlock ? textBlock.text : '';
 
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({
      error: 'Failed to get a response from the assistant. Please try again.',
    });
  }
}