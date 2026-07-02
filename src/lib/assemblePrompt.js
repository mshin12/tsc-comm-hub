/**
 * assemblePrompt
 *
 * Fills a prompt template's placeholders with values from an individual's
 * record. Any field that is null, undefined, or an empty/whitespace-only
 * string is replaced with 'not specified'.
 *
 * Supported placeholders -> individual fields:
 *   [NAME]                -> full_name
 *   [INTERESTS]           -> interests
 *   [GOAL]                -> goals
 *   [COMMUNICATION_LEVEL]  -> communication_tier
 *   [AAC_SYSTEM]          -> aac_system
 *   [TRIGGERS]            -> triggers_notes
 *
 * @param {string} promptTemplate - Template string containing placeholders.
 * @param {object} individual - Individual record with the fields above.
 * @returns {string} The template with all placeholders replaced.
 */
function assemblePrompt(promptTemplate, individual) {
  const safe = individual || {};
 
  const fill = (value) => {
    if (value === null || value === undefined) return 'not specified';
    const trimmed = String(value).trim();
    return trimmed === '' ? 'not specified' : trimmed;
  };
 
  const replacements = {
    '[NAME]': fill(safe.full_name),
    '[INTERESTS]': fill(safe.interests),
    '[GOAL]': fill(safe.goals),
    '[COMMUNICATION_LEVEL]': fill(safe.communication_tier),
    '[AAC_SYSTEM]': fill(safe.aac_system),
    '[TRIGGERS]': fill(safe.triggers_notes),
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