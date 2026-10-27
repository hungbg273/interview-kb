'use client';

import {usePathname} from 'next/navigation';
import {AuthGate} from './AuthGate';
import {NotesProvider} from './NotesProvider';
import {WorkspaceNavigationProvider} from './WorkspaceNavigation';

/** Shared across page transitions; session and note list survive client navigation. */
export function AppWorkspace({children}:{children:React.ReactNode}) {
  const path=usePathname();
  if(path === '/login') return children;
  return <WorkspaceNavigationProvider><AuthGate><NotesProvider>{children}</NotesProvider></AuthGate></WorkspaceNavigationProvider>;
}
