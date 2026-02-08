import { createContext, useContext, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/lib/router";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

let clearBYOKFunction: (() => void) | null = null;
export const registerBYOKClear = (clearFn: () => void) => {
  clearBYOKFunction = clearFn;
};

type BasicUser = { id: string; email?: string | null };

interface AuthContextType {
  user: BasicUser | null;
  loading: boolean;
  signUp: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const provisionedUsers = useRef<Set<string>>(new Set());

  const bypassUser = useMemo<BasicUser | null>(() => {
    const devBypassEmail = process.env.NEXT_PUBLIC_DEV_BYPASS_EMAIL as string | undefined;
    const isDevEnvironment = process.env.NODE_ENV !== "production";
    if (supabaseUser || !isDevEnvironment || !devBypassEmail) return null;
    // Deterministic ID ensures downstream hooks can rely on a stable identifier.
    return { id: `dev-bypass-${devBypassEmail}`, email: devBypassEmail };
  }, [supabaseUser]);

  useEffect(() => {
    let isMounted = true;

    const ensureProfileAndRole = async (userToProvision: User) => {
      if (provisionedUsers.current.has(userToProvision.id)) {
        return;
      }

      provisionedUsers.current.add(userToProvision.id);
      const { error } = await supabase.rpc("ensure_profile_and_role", {
        _user_id: userToProvision.id,
        _email: userToProvision.email ?? null,
      });

      if (error) {
        console.error("Failed to provision profile and role", error);
        provisionedUsers.current.delete(userToProvision.id);
      }
    };

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!isMounted) return;

        if (error) {
          console.error("Failed to get Supabase session", error);
          setSupabaseUser(null);
          setLoading(false);
          return;
        }

        const nextUser = data.session?.user ?? null;
        setSupabaseUser(nextUser);
        setLoading(false);

        if (nextUser) {
          await ensureProfileAndRole(nextUser);
        }
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        console.error("Unexpected session bootstrap error", error);
        setSupabaseUser(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setSupabaseUser(nextUser);
      setLoading(false);

      if (nextUser) {
        void ensureProfileAndRole(nextUser);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const mappedUser: BasicUser | null = supabaseUser
    ? { id: supabaseUser.id, email: supabaseUser.email ?? null }
    : bypassUser;

  const signUp = async () => {
    navigate("/auth");
  };

  const signIn = async () => {
    navigate("/auth");
  };

  const signOut = async () => {
    if (clearBYOKFunction) {
      clearBYOKFunction();
    }
    if (supabaseUser) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    }
    navigate("/");
  };

  return <AuthContext.Provider value={{ user: mappedUser, loading, signUp, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

