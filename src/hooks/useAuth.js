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
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    let isMounted = true;
 
    // Resolve the current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });
 
    // Subscribe to auth changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    });
 
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);
 
  return { user, loading };
}
 
export default useAuth;