import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('@/lib/api',()=>({api}));
import {LocalTopicGraph} from './LocalTopicGraph';
afterEach(()=>{cleanup();api.mockReset();});
it('returns to the actual parent of a directly opened topic',async()=>{
 api.mockImplementation(async(path:string)=>path==='/topics/child'?{parentIds:['parent']}:{id:'parent',name:'Parent'});
 const onSelect=vi.fn();
 render(<LocalTopicGraph topic={{id:'child',name:'Child'}} onSelect={onSelect}>{[]}</LocalTopicGraph>);
 const back=screen.getByRole('button',{name:'Về chủ đề cha'});
 await waitFor(()=>expect(back).toBeEnabled());
 fireEvent.click(back);
 await waitFor(()=>expect(onSelect).toHaveBeenCalledWith({id:'parent',name:'Parent'}));
});
it('disables the parent button for a root topic',async()=>{
 api.mockResolvedValue({parentIds:[]});
 render(<LocalTopicGraph topic={{id:'root',name:'Root'}} onSelect={vi.fn()}>{[]}</LocalTopicGraph>);
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/topics/root'));
 expect(screen.getByRole('button',{name:'Về chủ đề cha'})).toBeDisabled();
});
it('lets the user choose when a topic has multiple parents',async()=>{
 api.mockImplementation(async(path:string)=>{
  if(path==='/topics/child')return {parentIds:['a','b']};
  return {id:path.endsWith('/a')?'a':'b',name:path.endsWith('/a')?'Parent A':'Parent B'};
 });
 const onSelect=vi.fn();
 render(<LocalTopicGraph topic={{id:'child',name:'Child'}} onSelect={onSelect}>{[]}</LocalTopicGraph>);
 const back=screen.getByRole('button',{name:'Về chủ đề cha'});
 await waitFor(()=>expect(back).toBeEnabled());fireEvent.click(back);
 fireEvent.click(await screen.findByRole('button',{name:'Parent B'}));
 expect(onSelect).toHaveBeenCalledWith({id:'b',name:'Parent B'});
});
it('keeps full accessible names and opens a child from the styled graph', async () => {
 api.mockResolvedValue({parentIds:[]});
 const onSelect=vi.fn();
 const child={id:'http',name:'HTTP caching và chính sách kiểm soát bộ nhớ đệm'};
 render(<LocalTopicGraph topic={{id:'root',name:'Mạng máy tính'}} onSelect={onSelect}>{[child]}</LocalTopicGraph>);
 const node=screen.getByRole('button',{name:child.name});
 expect(node).toHaveAttribute('title',child.name);
 fireEvent.focus(node);
 fireEvent.click(node);
 expect(onSelect).toHaveBeenCalledWith(child);
 expect(screen.getByRole('button',{name:'Mạng máy tính'})).toHaveAttribute('aria-pressed','true');
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/topics/root'));
});
