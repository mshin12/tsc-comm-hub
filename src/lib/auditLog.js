import { supabase } from './supabaseClient';

/**
 * Fire-and-forget write to the audit_log table (see supabase/audit_log.sql).
 * Never throws — the audit trail is a secondary concern and must not block
 * or fail the primary action it's recording.
 */
async function logAction(action, { tableName, recordId, metadata } = {}) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error } = await supabase.from('audit_log').insert({
      actor_id: user.id,
      action,
      table_name: tableName || null,
      record_id: recordId || null,
      metadata: metadata || null,
    });

    if (error) {
      console.error('Audit log write failed:', error);
    }
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

export { logAction };
