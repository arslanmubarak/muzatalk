import React, { useEffect, useState } from 'react';
import { AuthScreen } from './client/components/AuthScreen';
import { MessengerApp } from './client/components/MessengerApp';
import { AdminDashboard } from './client/components/AdminDashboard';
import type { UserDTO } from './shared/types';

export default function App() {
  const [view, setView] = useState<'messenger' | 'admin'>(() =>
    window.location.pathname.startsWith('/web-client') ? 'messenger' : 'admin'
  );
  const [currentUser, setCurrentUser] = useState<UserDTO | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');

  useEffect(() => {
    const root = document.documentElement;
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else if (themeMode === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, [themeMode]);

  if (view === 'admin') {
    return <AdminDashboard onBackToApp={() => setView('messenger')} />;
  }

  if (!currentUser) {
    return (
      <AuthScreen
        onAuthenticated={(user) => setCurrentUser(user)}
        onOpenAdmin={() => setView('admin')}
      />
    );
  }

  return (
    <MessengerApp
      currentUser={currentUser}
      onUserUpdated={setCurrentUser}
      onLoggedOut={() => setCurrentUser(null)}
      onOpenAdmin={() => setView('admin')}
      themeMode={themeMode}
      onChangeTheme={setThemeMode}
    />
  );
}
