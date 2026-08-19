import { useState, useEffect } from 'react';

export interface UserProfile {
  name: string;
  email: string;
  color: string;
}

const USER_STORAGE_KEY = 'gitleaf_user_profile';

const DEFAULT_COLORS = [
  '#10B981', // emerald
  '#3B82F6', // blue
  '#F05032', // git orange
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#06B6D4', // cyan
];

export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const saveUser = (name: string, email: string, color?: string) => {
    const assignedColor = color || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
    const profile: UserProfile = {
      name: name.trim(),
      email: email.trim(),
      color: assignedColor,
    };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(profile));
    setUser(profile);
  };

  const clearUser = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  return {
    user,
    saveUser,
    clearUser,
    isLoggedIn: !!user && !!user.name && !!user.email,
  };
}
