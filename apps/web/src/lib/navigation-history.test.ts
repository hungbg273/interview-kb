import {afterEach,expect,it,vi} from 'vitest';
import {installHistoryGuard} from './navigation-history';
let uninstall: (()=>void)|undefined;
afterEach(()=>{uninstall?.();uninstall=undefined;vi.restoreAllMocks();});
it('keeps Next.js state and restores the current entry when Back is cancelled',()=>{
 history.replaceState({__NA:true,tree:'first'},'','/notes/first');
 const canNavigate=vi.fn().mockReturnValue(false);
 uninstall=installHistoryGuard(canNavigate);
 const firstState=history.state;
 history.pushState({__NA:true,tree:'second'},'','/notes/second');
 expect(history.state).toMatchObject({__NA:true,tree:'second'});
 const go=vi.spyOn(history,'go').mockImplementation(()=>{});
 const event=new PopStateEvent('popstate',{state:firstState});
 const stop=vi.spyOn(event,'stopImmediatePropagation');
 window.dispatchEvent(event);
 expect(canNavigate).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalled();expect(go).toHaveBeenCalledWith(1);
 // The restoration event must not prompt again or reach the router.
 window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));
 expect(canNavigate).toHaveBeenCalledOnce();
});
it('allows the router to receive Back after discard is confirmed',()=>{
 history.replaceState({__NA:true},'','/notes/first');
 uninstall=installHistoryGuard(()=>true);
 const firstState=history.state;
 history.pushState({__NA:true},'','/notes/second');
 const event=new PopStateEvent('popstate',{state:firstState});
 const stop=vi.spyOn(event,'stopImmediatePropagation');
 window.dispatchEvent(event);
 expect(stop).not.toHaveBeenCalled();
});
