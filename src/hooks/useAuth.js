import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
 
/**
 * useAuth
 *
 * Tracks the current Supabase auth session and exposes the current
 * user along with a loading flag while the initial session is resolved.
 *
 * Usage:
 *   const { user, loading } = useAuth();
 *   if (loading) return <div>Loading...</div>;
 *   if (!user) return <Navigate to="/" />;
 *   // user.id is available for queries
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadRole = async (sessionUser) => {
      if (!sessionUser) {
        if (isMounted) setRole(null);
        return;
      }
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', sessionUser.id)
        .single();
      if (isMounted) setRole(data?.role ?? null);
    };

    // Resolve the current session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      await loadRole(session?.user ?? null);
      if (isMounted) setLoading(false);
    });

    // Subscribe to auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
      await loadRole(session?.user ?? null);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, role, loading };
}
 
export default useAuth;