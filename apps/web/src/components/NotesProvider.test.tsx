import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/api',()=>({api}));
import {NotesProvider,useNoteList} from './NotesProvider';
afterEach(()=>{cleanup();api.mockReset();});
function Page({name}:{name:string}) {const {notes,refresh}=useNoteList();return <><p>{name}</p>{notes.map(n=><span key={n.id}>{n.title}</span>)}<button onClick={()=>void refresh()}>Refresh notes</button></>;}
it('reuses the note list across note pages and refreshes it after mutations',async()=>{
 api.mockResolvedValueOnce({items:[{id:'1',title:'First title'}]}).mockResolvedValueOnce({items:[{id:'1',title:'Updated title'}]});
 const {rerender}=render(<NotesProvider><Page key="one" name="One"/></NotesProvider>);
 await screen.findByText('First title');
 rerender(<NotesProvider><Page key="two" name="Two"/></NotesProvider>);
 expect(screen.getByText('First title')).toBeInTheDocument();
 expect(api).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Refresh notes'}));
 await screen.findByText('Updated title');
 expect(api).toHaveBeenCalledTimes(2);
});
it('deduplicates simultaneous consumers loading the sidebar list',async()=>{
 api.mockResolvedValue({items:[]});
 render(<NotesProvider><Page name="One"/><Page name="Two"/></NotesProvider>);
 await waitFor(()=>expect(api).toHaveBeenCalledTimes(1));
});
