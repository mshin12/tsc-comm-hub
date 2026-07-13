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
 *   [AAC_GUIDANCE]        -> a fixed guidance block, only when
 *                            individual.uses_aac === true; empty string
 *                            otherwise (never "not specified" — see below)
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

// Scoped-down AAC support: one guidance block for any uses_aac === true
// individual, not a per-modality map (device_symbol/core_board/
// partner_assisted_scanning is an explicit later decision, out of scope
// here). {AAC_REFERENCE} is filled in below from aac_system when set, or a
// generic fallback phrase when it isn't.
const AAC_GUIDANCE_TEMPLATE = `This individual communicates {AAC_REFERENCE}. Keep these principles in mind on every turn:
- Telegraphic or short phrasing (single words, 2-3 word combinations) is fluent communication for them, not an error to correct — never point out that a message was short or incomplete.
- If you want to model richer language, do it by naturally including a slightly fuller version of what they said in your own next line — never by correcting them or asking them to "say it a different way."
- Keep your own dialogue to 1-2 short, concrete sentences. Avoid idioms, sarcasm, or figurative language unless the scenario specifically calls for it.
- Tolerate long pauses before a response. Composing a message this way takes longer than typing or speaking — a pause is not "no response." Stay in character and wait; never fill the silence by repeating yourself or prompting impatiently.`;

function buildAacGuidance(safe) {
  // Deliberately not run through the fill() helper below — an unset/false
  // value must collapse to a true empty string (nothing injected at all),
  // not the "not specified" fallback every other placeholder gets.
  if (safe.uses_aac !== true) return '';

  const aacSystem = safe.aac_system && String(safe.aac_system).trim() !== ''
    ? String(safe.aac_system).trim()
    : null;
  const reference = aacSystem ? `using their ${aacSystem}` : 'using their AAC system';

  return AAC_GUIDANCE_TEMPLATE.replace('{AAC_REFERENCE}', reference);
}

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
    '[AAC_GUIDANCE]': buildAacGuidance(safe),
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
