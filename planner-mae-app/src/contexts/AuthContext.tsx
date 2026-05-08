import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  email: string;
  role: 'admin' | 'user';
}

interface StoredUser {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => boolean;
  register: (email: string, password: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USERS_KEY = 'conta_mae_planner_users';
const SESSION_KEY = 'conta_mae_planner_user';
const LEGACY_USERS_KEY = 'mulher_virtuosa_users';
const LEGACY_SESSION_KEY = 'mulher_virtuosa_user';

function migratePlannerStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!localStorage.getItem(USERS_KEY) && localStorage.getItem(LEGACY_USERS_KEY)) {
      localStorage.setItem(USERS_KEY, localStorage.getItem(LEGACY_USERS_KEY)!);
      localStorage.removeItem(LEGACY_USERS_KEY);
    }
    if (!localStorage.getItem(SESSION_KEY) && localStorage.getItem(LEGACY_SESSION_KEY)) {
      localStorage.setItem(SESSION_KEY, localStorage.getItem(LEGACY_SESSION_KEY)!);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

migratePlannerStorage();

const getStoredUsers = (): StoredUser[] => {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveStoredUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem(SESSION_KEY);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  const register = (email: string, password: string): boolean => {
    const users = getStoredUsers();
    const exists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (exists) return false;

    users.push({ email, password });
    saveStoredUsers(users);

    const userData: User = { email, role: 'user' };
    setUser(userData);
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    return true;
  };

  const login = (email: string, password: string): boolean => {
    const users = getStoredUsers();
    const found = users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );
    if (!found) return false;

    const userData: User = { email: found.email, role: 'user' };
    setUser(userData);
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
    try {
      const url = new URL('../index.html', window.location.href);
      window.location.assign(url.href);
    } catch {
      window.location.assign('/index.html');
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: user !== null }}>
      {children}
    </AuthContext.Provider>
  );
};
