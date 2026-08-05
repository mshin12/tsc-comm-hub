import Anthropic from '@anthropic-ai/sdk';
import { authenticate, assertSessionAccess } from './_lib/supabaseAuth.js';

const MAX_TRANSCRIPT_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 6000;

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
          'A warm, plain-language 1-3 sentence summary suitable for sharing directly with family members, in English. No clinical language.',
      },
      family_summary_ko: {
        type: 'string',
        description:
          'The exact same summary as family_summary, translated into natural, warm, conversational Korean (not a literal word-for-word translation).',
      },
      suggested_focus: {
        type: 'string',
        description:
          "A single short, concrete, forward-looking sentence about what to gently emphasize in this individual's NEXT session — grounded only in what actually happened in this transcript. Not a diagnosis, not clinical language, and not a restatement of challenge_noted. Return an empty string if nothing specific stands out this session — don't fabricate a suggestion just to fill the field.",
      },
    },
    required: ['went_well', 'challenge_noted', 'goal_moment', 'family_summary', 'family_summary_ko', 'suggested_focus'],
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
          'A warm, plain-language 1-3 sentence summary suitable for sharing directly with family members, in English. No clinical language.',
      },
      family_summary_ko: {
        type: 'string',
        description:
          'The exact same summary as family_summary, translated into natural, warm, conversational Korean (not a literal word-for-word translation).',
      },
    },
    required: ['family_summary', 'family_summary_ko'],
  },
};

// Family-only feature (CLAUDE.md Known Issues #13): staff/admin themselves
// never see or write Korean. Both languages are generated unconditionally,
// every time, regardless of what any linked family account currently
// prefers — deliberately NOT gated on a language param passed by the
// caller. An earlier version of this file only generated family_summary_ko
// when told to, based on the family account's preference AT THAT MOMENT;
// if the family later switched languages, or the summary predated this
// feature, the stored text never updated. Generating both up front and
// letting the display layer (FamilyView.jsx) pick whichever matches the
// CURRENT toggle fixes that — switching the toggle now instantly affects
// even old history, with no extra lookups or regeneration needed.
const FAMILY_SUMMARY_KO_INSTRUCTION =
  '\n\nAlso translate that same family_summary into natural, warm, conversational Korean (not a literal word-for-word translation) for the family_summary_ko field — every family-facing session gets both languages generated together, regardless of which language any particular family account currently prefers.';

function buildAnalysisSystemPrompt(individual) {
  return `You are a clinical support assistant for staff running AI-assisted communication practice sessions with ${
    individual?.full_name || 'an individual'
  }, whose communication goal is: ${individual?.goals || 'not specified'}.

You will receive the full transcript of a completed roleplay practice session. In the transcript, "assistant" turns are the in-character roleplay partner, and "user" turns are what the individual communicated.

Analyze only what actually happened in this transcript — never invent details it doesn't support. Call the log_session_analysis tool with your analysis. If a category genuinely doesn't apply, say so briefly and honestly rather than fabricating detail.

Note that the session is always ended by a staff/admin user, so the END SESSION transcript message is not the individual's own words. Do not treat it as a user turn when analyzing the transcript and generating the summary.${FAMILY_SUMMARY_KO_INSTRUCTION}`;
}

function buildFamilySummarySystemPrompt(individual) {
  return `A family member or caregiver just supervised a communication practice roleplay with ${
    individual?.full_name || 'an individual'
  }, whose communication goal is: ${individual?.goals || 'not specified'}.

You will receive the full transcript. In it, "assistant" turns are the in-character roleplay partner, and "user" turns are what the individual communicated.

Call the log_family_summary tool with a short, warm summary of what happened, written directly for the family — plain language, no clinical or technical terms. Base it only on what actually happened in the transcript.

Note that the session may be ended by a family member or caregiver, so the END SESSION transcript message is not necessarily the individual's own words. Do not assume it is a user turn when analyzing the transcript and generating the summary.${FAMILY_SUMMARY_KO_INSTRUCTION}`;
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

  const auth = await authenticate(token);

  if (!auth) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  const { sessionId, transcript, individual, mode } = req.body || {};

  // Ties this analysis to a real sessions row the caller can already read
  // under RLS, so the endpoint can't be used as an unrestricted transcript
  // analyzer by any authenticated account (see api/chat.js for the same
  // pattern and the reasoning behind it).
  if (!(await assertSessionAccess(auth.userClient, sessionId))) {
    return res.status(403).json({ error: 'You do not have access to this session.' });
  }

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res.status(400).json({ error: '"transcript" must be a non-empty array.' });
  }

  if (transcript.length > MAX_TRANSCRIPT_MESSAGES) {
    return res.status(400).json({ error: 'This transcript is too long to analyze.' });
  }

  if (transcript.some((m) => typeof m?.content !== 'string' || m.content.length > MAX_MESSAGE_LENGTH)) {
    return res.status(400).json({ error: 'A transcript message is missing content or is too long.' });
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
