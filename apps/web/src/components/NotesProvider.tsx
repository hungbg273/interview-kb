'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {api} from '@/lib/api';
export type NoteLink = {id:string;title:string};
type NotesContextValue = {notes:NoteLink[];ensure:()=>Promise<void>;refresh:()=>Promise<void>;error:string};
const NotesContext=createContext<NotesContextValue | null>(null);
export function NotesProvider({children}:{children:React.ReactNode}) {
  const [notes,setNotes]=useState<NoteLink[]>([]);
  const [error,setError]=useState('');
  const loaded=useRef(false);
  const pending=useRef<Promise<void> | null>(null);
  const refresh=useCallback(() => {
    if (pending.current) return pending.current;
    pending.current=api<{items:NoteLink[]}>('/notes').then(data=>{setNotes(data.items);loaded.current=true;setError('');})
      .catch(()=>{setError('Không tải được danh sách ghi chú.');})
      .finally(()=>{pending.current=null;});
    return pending.current;
  },[]);
  const ensure=useCallback(()=>loaded.current?Promise.resolve():refresh(),[refresh]);
  return <NotesContext.Provider value={{notes,ensure,refresh,error}}>{children}</NotesContext.Provider>;
}
export function useNoteList() {
  const context=useContext(NotesContext);
  useEffect(()=>{if(context) void context.ensure();},[context?.ensure]);
  return context ?? {notes:[],refresh:async()=>{},ensure:async()=>{},error:''};
}

export function useRefreshNotes() { return useContext(NotesContext)?.refresh ?? (async()=>{}); }
