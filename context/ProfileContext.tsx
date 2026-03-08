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

interface ProfileContextType {
  authenticated: boolean;
  profile: ProfileData | null;
  signIn: () => void;
  setProfile: (p: ProfileData | null) => void;
  signOut: () => void;
  switchProfile: () => void;
  fetchProfile: () => void;
  profileHeaders: () => Record<string, string>;
}

const ProfileContext = createContext<ProfileContextType>({
  authenticated: false,
  profile: null,
  signIn: () => {},
  setProfile: () => {},
  signOut: () => {},
  switchProfile: () => {},
  fetchProfile: () => {},
  profileHeaders: () => ({}),
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean>(
    () => !!localStorage.getItem("ossflix-authenticated")
  );
  const [profile, setProfileState] = useState<ProfileData | null>(() => {
    const saved = localStorage.getItem("ossflix-profile-id");
    return saved ? { id: parseInt(saved, 10) } as any : null;
  });

  const profileHeaders = useCallback((): Record<string, string> => {
    if (!profile) return {};
    return { "x-profile-id": String(profile.id) };
  }, [profile]);

  const fetchProfile = useCallback(() => {
    if (!profile?.id) return;
    fetch("/api/profile", { headers: { "x-profile-id": String(profile.id) } })
      .then((r) => r.json())
      .then((data) => { if (data?.id) setProfileState(data); })
      .catch(() => {});
  }, [profile?.id]);

  // Load full profile data on mount if we have a saved ID
  useEffect(() => {
    const savedId = localStorage.getItem("ossflix-profile-id");
    if (savedId) {
      fetch("/api/profile", { headers: { "x-profile-id": savedId } })
        .then((r) => r.json())
        .then((data) => {
          if (data?.id) {
            setProfileState(data);
            setAuthenticated(true);
            localStorage.setItem("ossflix-authenticated", "1");
          } else {
            setProfileState(null);
          }
        })
        .catch(() => setProfileState(null));
    }
  }, []);

  const signIn = () => {
    localStorage.setItem("ossflix-authenticated", "1");
    setAuthenticated(true);
  };

  const setProfile = (p: ProfileData | null) => {
    setProfileState(p);
    if (p) {
      localStorage.setItem("ossflix-profile-id", String(p.id));
    } else {
      localStorage.removeItem("ossflix-profile-id");
    }
  };

  const signOut = () => {
    localStorage.removeItem("ossflix-authenticated");
    localStorage.removeItem("ossflix-profile-id");
    setAuthenticated(false);
    setProfileState(null);
  };

  const switchProfile = () => {
    localStorage.removeItem("ossflix-profile-id");
    setProfileState(null);
  };

  return (
    <ProfileContext.Provider value={{
      authenticated, profile, signIn, setProfile,
      signOut, switchProfile, fetchProfile, profileHeaders,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function profileFetch(url: string, profileId: number, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("x-profile-id", String(profileId));
  return fetch(url, { ...options, headers });
}
