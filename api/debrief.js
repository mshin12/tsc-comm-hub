import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

// Forcing a tool call (rather than asking for JSON in prose) guarantees a
// parseable, complete result instead of relying on the model to format its
// own text correctly.
const ANALYSIS_TOOL = {
  name: 'log_session_analysis',
  description:
    'Records a structured analysis of a completed communication practice session, to be saved directly into the session log.',
  input_schema: {
    type: 'object',
    properties: {
      went_well: {
        type: 'string',
        description:
          'Specific, observable moments of success or progress during the session.',
      },
      challenge_noted: {
        type: 'string',
        description:
          'Any challenges, difficulties, or unexpected moments observed during the session.',
      },
      goal_moment: {
        type: 'string',
        description:
          "One specific moment in the session that was directly relevant to the individual's communication goal.",
      },
      family_summary: {
        type: 'string',
        description:
          'A warm, plain-language 1-3 sentence summary suitable for sharing directly with family members. No clinical language.',
      },
    },
    required: ['went_well', 'challenge_noted', 'goal_moment', 'family_summary'],
  },
};

// Used for family/caregiver-run sessions, where there's no staff review step
// and no reason to generate clinical categories nobody will read — just the
// one field the family view actually shows.
const FAMILY_SUMMARY_TOOL = {
  name: 'log_family_summary',
  description:
    'Records a warm, plain-language summary of a completed practice session, written for the individual\'s family.',
  input_schema: {
    type: 'object',
    properties: {
      family_summary: {
        type: 'string',
        description:
          'A warm, plain-language 1-3 sentence summary suitable for sharing directly with family members. No clinical language.',
      },
    },
    required: ['family_summary'],
  },
};

function buildAnalysisSystemPrompt(individual) {
  return `You are a clinical support assistant for staff running AI-assisted communication practice sessions with ${
    individual?.full_name || 'an individual'
  }, whose communication goal is: ${individual?.goals || 'not specified'}.

You will receive the full transcript of a completed roleplay practice session. In the transcript, "assistant" turns are the in-character roleplay partner, and "user" turns are what the individual communicated.

Analyze only what actually happened in this transcript — never invent details it doesn't support. Call the log_session_analysis tool with your analysis. If a category genuinely doesn't apply, say so briefly and honestly rather than fabricating detail.`;
}

function buildFamilySummarySystemPrompt(individual) {
  return `A family member or caregiver just supervised a communication practice roleplay with ${
    individual?.full_name || 'an individual'
  }, whose communication goal is: ${individual?.goals || 'not specified'}.

You will receive the full transcript. In it, "assistant" turns are the in-character roleplay partner, and "user" turns are what the individual communicated.

Call the log_family_summary tool with a short, warm summary of what happened, written directly for the family — plain language, no clinical or technical terms. Base it only on what actually happened in the transcript.`;
}

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

  const { transcript, individual, mode } = req.body || {};

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: '"transcript" must be a non-empty array.' });
  }

  const familySummaryOnly = mode === 'family_summary_only';
  const tool = familySummaryOnly ? FAMILY_SUMMARY_TOOL : ANALYSIS_TOOL;
  const systemPrompt = familySummaryOnly
    ? buildFamilySummarySystemPrompt(individual)
    : buildAnalysisSystemPrompt(individual);

  let anthropic;
  try {
    anthropic = new Anthropic();
  } catch (configError) {
    console.error('Anthropic client configuration error:', configError);
    return res.status(500).json({
      error: 'The assistant is not configured correctly. Please contact your administrator.',
    });
  }

  const transcriptText = transcript
    .map((message) => (message.role === 'user' ? 'Individual: ' : 'Roleplay partner: ') + message.content)
    .join('\n\n');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: 'Here is the session transcript:\n\n' + transcriptText,
        },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
    });

    const toolUse = response.content.find((block) => block.type === 'tool_use');

    if (!toolUse) {
      throw new Error('The assistant did not return an analysis.');
    }

    return res.status(200).json(toolUse.input);
  } catch (error) {
    console.error('Anthropic API error (debrief):', error);
    return res.status(500).json({
      error: 'Could not generate a session summary. Please fill in the log manually.',
    });
  }
}
