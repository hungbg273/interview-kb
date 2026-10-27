import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const {api,push} = vi.hoisted(()=>({api:vi.fn(),push:vi.fn()}));
vi.mock('@/lib/api',()=>({api}));
vi.mock('next/navigation',()=>({useRouter:()=>({push})}));
import {NoteTopicGraph} from './NoteTopicGraph';
afterEach(()=>{cleanup();api.mockReset();push.mockReset();vi.restoreAllMocks();});
it('guards unsaved editor content before navigating from the local graph',async()=>{
 api.mockResolvedValue([{id:'child',name:'Child'}]);
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<NoteTopicGraph topics={[{id:'root',name:'Root'}]} hasUnsavedChanges />);
 fireEvent.click(await screen.findByRole('button',{name:'Child'}));
 expect(confirm).toHaveBeenCalled();expect(push).not.toHaveBeenCalled();
 confirm.mockReturnValue(true);
 fireEvent.click(screen.getByRole('button',{name:'Child'}));
 expect(push).toHaveBeenCalledWith('/?topicId=child');
});
it('updates the graph when a note belongs to a different selected topic',async()=>{
 api.mockImplementation(async(path:string)=>path.includes('first')?[{id:'a',name:'A'}]:[{id:'b',name:'B'}]);
 render(<NoteTopicGraph topics={[{id:'first',name:'First'},{id:'second',name:'Second'}]} />);
 expect(await screen.findByRole('button',{name:'A'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Chủ đề trong đồ thị'),{target:{value:'second'}});
 expect(await screen.findByRole('button',{name:'B'})).toBeInTheDocument();
 await waitFor(()=>expect(screen.queryByRole('button',{name:'A'})).not.toBeInTheDocument());
});
it('confirms before returning to a parent when the note has unsaved changes',async()=>{
 api.mockImplementation(async(path:string)=>{
  if(path==='/topics/child')return {parentIds:['parent']};
  if(path==='/topics/parent')return {id:'parent',name:'Parent'};
  return [];
 });
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<NoteTopicGraph topics={[{id:'child',name:'Child'}]} hasUnsavedChanges/>);
 const back=screen.getByRole('button',{name:'Về chủ đề cha'});
 await waitFor(()=>expect(back).toBeEnabled());fireEvent.click(back);
 await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());
 expect(push).not.toHaveBeenCalled();
});
