/**
 * UI State Store
 * Jotai atoms for client-side state
 */

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { Message, QASession } from '../types';

// Session ID (persisted in localStorage)
export const sessionIdAtom = atomWithStorage<string>(
  'nlp-portfolio-session-id',
  crypto.randomUUID()
);

// Current messages in chat
export const messagesAtom = atom<Message[]>([]);

// Chat sessions history
export const sessionsAtom = atomWithStorage<QASession[]>('nlp-portfolio-sessions', []);

// UI State
export const isSidebarOpenAtom = atom<boolean>(true);
export const isLoadingAtom = atom<boolean>(false);
export const searchQueryAtom = atom<string>('');

// Theme (auto/light/dark)
export const themeAtom = atomWithStorage<'auto' | 'light' | 'dark'>(
  'nlp-portfolio-theme',
  'auto'
);

// Derived atoms
export const filteredMessagesAtom = atom(get => {
  const messages = get(messagesAtom);
  const query = get(searchQueryAtom).toLowerCase();

  if (!query) return messages;

  return messages.filter(
    m =>
      m.content.toLowerCase().includes(query) ||
      m.sources?.some(s => s.content.toLowerCase().includes(query))
  );
});

// Actions
export const addMessageAtom = atom(null, (get, set, message: Omit<Message, 'id' | 'timestamp'>) => {
  const newMessage: Message = {
    ...message,
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };

  set(messagesAtom, [...get(messagesAtom), newMessage]);
  return newMessage;
});

export const updateMessageAtom = atom(
  null,
  (get, set, { id, updates }: { id: string; updates: Partial<Message> }) => {
    set(
      messagesAtom,
      get(messagesAtom).map(m => (m.id === id ? { ...m, ...updates } : m))
    );
  }
);

export const clearMessagesAtom = atom(null, (_get, set) => {
  set(messagesAtom, []);
});
