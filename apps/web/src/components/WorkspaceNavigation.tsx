'use client';

import Link from 'next/link';
import { installHistoryGuard } from '@/lib/navigation-history';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

const NavigationContext = createContext<{register: (token: symbol) => () => void; canNavigate: () => boolean}>({
  register: (_token: symbol) => () => {},
  canNavigate: () => true,
});

export function WorkspaceNavigationProvider({children}: {children: React.ReactNode}) {
  const blockers = useRef(new Set<symbol>());
  const register = useCallback((token: symbol) => {
    blockers.current.add(token);
    return () => { blockers.current.delete(token); };
  }, []);
  const canNavigate = useCallback(() => blockers.current.size === 0 || window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi để chuyển trang?'), []);
  useEffect(() => installHistoryGuard(canNavigate),[canNavigate]);
  return <NavigationContext.Provider value={{register,canNavigate}}>{children}</NavigationContext.Provider>;
}

export function useUnsavedChanges(dirty: boolean) {
  const {register} = useContext(NavigationContext);
  const token = useRef(Symbol('draft'));
  useEffect(() => {
    if (!dirty) return;
    const unregister = register(token.current);
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload',warn);
    return () => { unregister(); window.removeEventListener('beforeunload',warn); };
  }, [dirty,register]);
}

export function WorkspaceLink({onClick, ...props}: React.ComponentProps<typeof Link>) {
  const {canNavigate} = useContext(NavigationContext);
  return <Link {...props} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self')) return;
    if (!canNavigate()) event.preventDefault();
  }} />;
}


export function useCanNavigate() { return useContext(NavigationContext).canNavigate; }
