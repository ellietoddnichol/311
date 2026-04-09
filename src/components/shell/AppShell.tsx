import React, { useEffect } from 'react';
import { SidebarNav } from './SidebarNav';
import { maybeSyncCatalogInBackground } from '../../utils/catalogBackgroundSync';

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    maybeSyncCatalogInBackground();
  }, []);

  return (
    <div className="h-screen w-screen flex overflow-hidden p-0 m-0 bg-white">
      <SidebarNav />
      <main className="flex-1 min-w-0 w-full h-full overflow-hidden p-0 m-0 bg-white">
        <div className="flex-1 w-full min-w-0 h-full overflow-y-auto p-0 m-0 bg-white">
          {children}
        </div>
      </main>
    </div>
  );
}
