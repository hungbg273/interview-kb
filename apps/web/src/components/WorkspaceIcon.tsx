type IconName = 'graph' | 'note' | 'practice' | 'panel' | 'search' | 'folder' | 'chevron' | 'logout' | 'plus' | 'back';
const paths: Record<IconName, React.ReactNode> = {
  graph: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="10" cy="18" r="2.5"/><path d="m8.5 6.5 7 1M7 8.5l2 7M16.5 10l-5 6"/></>,
  note: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/></>,
  practice: <><path d="M9 4H5v17h14V4h-4M9 3h6v4H9zM8 12l2 2 5-4M8 18h7"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
  folder: <path d="M3 7V5h7l2 3h9v12H3z"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  logout: <><path d="M10 4H4v16h6M10 12h11m-4-4 4 4-4 4"/></>,
  back: <path d="M20 12H4m6-6-6 6 6 6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
};
export function WorkspaceIcon({ name }: { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
