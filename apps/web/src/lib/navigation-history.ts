const POSITION = '__kbNavigationPosition';

/** Preserve Next.js history state while guarding same-document Back/Forward. */
export function installHistoryGuard(canNavigate: () => boolean) {
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  let current = typeof history.state?.[POSITION] === 'number' ? history.state[POSITION] : 0;
  let currentState = {...history.state, [POSITION]: current};
  let currentUrl = window.location.href;
  let restoring = false;
  replace.call(history,currentState,'');
  const pushState: History['pushState'] = function(state, unused, url) {
    current += 1;
    currentState = {...state,[POSITION]:current};
    push.call(history,currentState,unused,url);
    currentUrl = window.location.href;
  };
  const replaceState: History['replaceState'] = function(state, unused, url) {
    currentState = {...state,[POSITION]:current};
    replace.call(history,currentState,unused,url);
    currentUrl = window.location.href;
  };
  history.pushState = pushState;
  history.replaceState = replaceState;
  const onPop = (event: PopStateEvent) => {
    if (restoring) {restoring=false;event.stopImmediatePropagation();return;}
    const target=event.state?.[POSITION];
    if (canNavigate()) {
      current=typeof target === 'number' ? target : current-1;
      currentState={...event.state,[POSITION]:current};
      currentUrl=window.location.href;
      return;
    }
    event.stopImmediatePropagation();
    if (typeof target === 'number' && target !== current) {
      restoring=true;
      history.go(current-target);
    } else {
      // A history entry created before this workspace mounted has no index.
      push.call(history,currentState,'',currentUrl);
    }
  };
  window.addEventListener('popstate',onPop,true);
  return () => {
    window.removeEventListener('popstate',onPop,true);
    if(history.pushState===pushState)history.pushState=push;
    if(history.replaceState===replaceState)history.replaceState=replace;
  };
}
