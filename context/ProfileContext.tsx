import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface ProfileData {
  id: number;
  name: string;
  email: string | null;
  image_path: string | null;
  movies_directory: string | null;
  tvshows_directory: string | null;
  use_global_dirs: number;
}

export interface PublicProfile {
  id: number;
  name: string;
  image_path: string | null;
  has_password: boolean;
}

interface ProfileContextType {
  authenticated: boolean;
  profile: ProfileData | null;
  loading: boolean;
  login: (profileId: number, password: string) => Promise<{ error?: string }>;
  register: (name: string, password: string) => Promise<{ error?: string }>;
  setPassword: (profileId: number, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  setProfile: (p: ProfileData | null) => void;
  fetchProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  authenticated: false,
  profile: null,
  loading: true,
  login: async () => ({}),
  register: async () => ({}),
  setPassword: async () => ({}),
  logout: async () => {},
  setProfile: () => {},
  fetchProfile: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfileState] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Check session on mount
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("Not authenticated");
        return r.json();
      })
      .then((data) => {
        if (data.profile?.id) {
          setProfileState(data.profile);
          setAuthenticated(true);
        }
      })
      .catch(() => {
        setAuthenticated(false);
        setProfileState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (profileId: number, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ profileId, password }),
      });
      const data = await res.json();
      if (data.error === "password_not_set") {
        return { error: "password_not_set" };
      }
      if (data.error) return { error: data.error };
      if (data.profile) {
        setProfileState(data.profile);
        setAuthenticated(true);
      }
      return {};
    } catch {
      return { error: "Login failed" };
    }
  }, []);

  const register = useCallback(async (name: string, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (data.error) return { error: data.error };
      if (data.profile) {
        setProfileState(data.profile);
        setAuthenticated(true);
      }
      return {};
    } catch {
      return { error: "Registration failed" };
    }
  }, []);

  const setPassword = useCallback(async (profileId: number, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ profileId, password }),
      });
      const data = await res.json();
      if (data.error) return { error: data.error };
      if (data.profile) {
        setProfileState(data.profile);
        setAuthenticated(true);
      }
      return {};
    } catch {
      return { error: "Failed to set password" };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {});
    setAuthenticated(false);
    setProfileState(null);
  }, []);

  const setProfile = (p: ProfileData | null) => {
    setProfileState(p);
  };

  const fetchProfile = useCallback(() => {
    if (!authenticated) return;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => { if (data.profile?.id) setProfileState(data.profile); })
      .catch(() => {});
  }, [authenticated]);

  return (
    <ProfileContext.Provider value={{
      authenticated, profile, loading,
      login, register, setPassword, logout,
      setProfile, fetchProfile,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

export async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...opts, credentials: "same-origin" });
  if (res.status === 401) window.location.href = "/";
  return res;
}
