import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
vi.mock('next/link',()=>({default:({children,onClick,...props}:React.ComponentProps<'a'>)=><a {...props} onClick={onClick}>{children}</a>}));
import {WorkspaceNavigationProvider, WorkspaceLink, useUnsavedChanges} from './WorkspaceNavigation';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function Draft(){useUnsavedChanges(true);return <WorkspaceLink href="/notes/second">Second note</WorkspaceLink>;}
it('blocks client-side links when the user keeps an unsaved draft',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<WorkspaceNavigationProvider><Draft/></WorkspaceNavigationProvider>);
 expect(fireEvent.click(screen.getByRole('link',{name:'Second note'}))).toBe(false);
 expect(confirm).toHaveBeenCalledOnce();
});
it('allows modified clicks to open a separate tab without discarding the draft',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<WorkspaceNavigationProvider><Draft/></WorkspaceNavigationProvider>);
 screen.getByRole('link',{name:'Second note'}).addEventListener('click',event=>event.preventDefault());
 fireEvent.click(screen.getByRole('link',{name:'Second note'}),{ctrlKey:true});
 expect(confirm).not.toHaveBeenCalled();
});
