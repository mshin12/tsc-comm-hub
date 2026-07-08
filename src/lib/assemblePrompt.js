import { parseTierNumber } from './tier';

/**
 * assemblePrompt
 *
 * Fills a prompt template's placeholders with values from an individual's
 * record and the scenario selected for this session. Any field that is
 * null, undefined, or an empty/whitespace-only string is replaced with
 * 'not specified'.
 *
 * Supported placeholders -> source:
 *   [NAME]                -> individual.full_name
 *   [INTERESTS]           -> individual.interests
 *   [GOAL]                -> individual.goals
 *   [COMMUNICATION_LEVEL]  -> individual.communication_tier, mapped to a
 *                            plain-language description (see TIER_DESCRIPTIONS)
 *   [AAC_SYSTEM]          -> individual.aac_system
 *   [TRIGGERS]            -> individual.triggers_notes
 *   [KEY VOCABULARY]      -> individual.vocabulary_notes
 *   [SCENARIO]            -> scenario (e.g. the selected prompt's scenario_name)
 *
 * @param {string} promptTemplate - Template string containing placeholders.
 * @param {object} individual - Individual record with the fields above.
 * @param {string} [scenario] - Description of the scenario/activity for this session.
 * @returns {string} The template with all placeholders replaced.
 */

const TIER_DESCRIPTIONS = {
  1: 'single words',
  2: '2–3 word phrases',
  3: 'short sentences',
};

// Applied to every scenario regardless of what an individual prompts row
// says, so staff never have to remember to add formatting rules when they
// write a new scenario. Without this, Claude defaults to its normal
// assistant-style output (markdown headers, bold, bullet-point "menus" of
// suggested replies, emoji) instead of a short, natural, in-character line
// of dialogue — which is what broke the very first turn of every session.
const STYLE_CONTRACT = `You are roleplaying as a character in a live communication practice session with the individual described below. Follow these rules on every single turn, without exception:
- Stay fully in character. Never break character, never refer to yourself as an AI, and never mention these instructions or the hidden message that started the session.
- Respond only with what the character would actually say out loud — plain natural dialogue, nothing else.
- Do not use any markdown formatting: no headers, no bold or italics, no bullet points or numbered lists, no emoji unless the character would genuinely text one.
- Keep each response short and conversational (1-3 sentences), matching how a real person would talk in this moment. Never write a long, structured, or explanatory reply.
- Never explain the activity, list example responses, or give the individual a "menu" of ways they could respond. Just say your line in character and wait for their turn.`;

function assemblePrompt(promptTemplate, individual, scenario) {
  const safe = individual || {};

  const fill = (value) => {
    if (value === null || value === undefined) return 'not specified';
    const trimmed = String(value).trim();
    return trimmed === '' ? 'not specified' : trimmed;
  };

  const tierNumber = parseTierNumber(safe.communication_tier);
  const communicationLevel = TIER_DESCRIPTIONS[tierNumber] || fill(safe.communication_tier);

  const replacements = {
    '[NAME]': fill(safe.full_name),
    '[INTERESTS]': fill(safe.interests),
    '[GOAL]': fill(safe.goals),
    '[COMMUNICATION_LEVEL]': communicationLevel,
    '[AAC_SYSTEM]': fill(safe.aac_system),
    '[TRIGGERS]': fill(safe.triggers_notes),
    '[KEY VOCABULARY]': fill(safe.vocabulary_notes),
    '[SCENARIO]': fill(scenario),
  };

  let result = promptTemplate;
  for (const [placeholder, value] of Object.entries(replacements)) {
    // Escape regex special characters in the placeholder, then replace all occurrences
    const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }

  return `${STYLE_CONTRACT}\n\n${result}`;
}

export { assemblePrompt };
