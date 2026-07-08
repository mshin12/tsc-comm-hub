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

  return result;
}

export { assemblePrompt };
