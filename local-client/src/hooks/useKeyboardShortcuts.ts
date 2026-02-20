// VibeSpeak keyboard shortcuts
// Centralized keyboard shortcut management

import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: () => void;
  description?: string;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow only specific shortcuts while typing (like Escape)
        const isTypingShortcut = shortcuts.find(
          (s) =>
            s.key.toLowerCase() === event.key.toLowerCase() &&
            !s.ctrl &&
            !s.shift &&
            !s.alt &&
            !s.meta
        );
        if (!isTypingShortcut || event.key !== 'Escape') {
          return;
        }
      }

      for (const shortcut of shortcuts) {
        const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase();
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const altMatch = !!shortcut.alt === event.altKey;
        const metaMatch = shortcut.meta ? event.metaKey : true;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Predefined VibeSpeak shortcuts
export const VIBESPEAK_SHORTCUTS = {
  // Navigation
  SEARCH: { key: 'k', ctrl: true, description: 'Search' },
  GOTO_HOME: { key: 'Home', ctrl: true, description: 'Go to home' },
  
  // Server navigation (Ctrl + 1-9)
  GOTO_SERVER_1: { key: '1', ctrl: true, description: 'Go to server 1' },
  GOTO_SERVER_2: { key: '2', ctrl: true, description: 'Go to server 2' },
  GOTO_SERVER_3: { key: '3', ctrl: true, description: 'Go to server 3' },
  GOTO_SERVER_4: { key: '4', ctrl: true, description: 'Go to server 4' },
  GOTO_SERVER_5: { key: '5', ctrl: true, description: 'Go to server 5' },
  GOTO_SERVER_6: { key: '6', ctrl: true, description: 'Go to server 6' },
  GOTO_SERVER_7: { key: '7', ctrl: true, description: 'Go to server 7' },
  GOTO_SERVER_8: { key: '8', ctrl: true, description: 'Go to server 8' },
  GOTO_SERVER_9: { key: '9', ctrl: true, description: 'Go to server 9' },
  
  // Channel navigation
  NEXT_CHANNEL: { key: 'ArrowDown', alt: true, description: 'Next channel' },
  PREV_CHANNEL: { key: 'ArrowUp', alt: true, description: 'Previous channel' },
  NEXT_UNREAD: { key: 'ArrowDown', shift: true, alt: true, description: 'Next unread channel' },
  PREV_UNREAD: { key: 'ArrowUp', shift: true, alt: true, description: 'Previous unread channel' },
  
  // Voice
  TOGGLE_MUTE: { key: 'm', ctrl: true, shift: true, description: 'Toggle mute' },
  TOGGLE_DEAFEN: { key: 'd', ctrl: true, shift: true, description: 'Toggle deafen' },
  
  // Messages
  MARK_READ: { key: 'Escape', description: 'Mark channel read' },
  NEW_MESSAGE: { key: 'n', ctrl: true, description: 'New message' },
  
  // UI
  TOGGLE_MEMBERS: { key: 'm', ctrl: true, description: 'Toggle member list' },
  TOGGLE_PINS: { key: 'p', ctrl: true, description: 'Toggle pinned messages' },
  CLOSE_MODAL: { key: 'Escape', description: 'Close modal' },
  
  // Settings
  OPEN_SETTINGS: { key: ',', ctrl: true, description: 'Open settings' },
};

// Help text for displaying shortcuts
export function formatShortcut(shortcut: Partial<KeyboardShortcut>): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.meta) parts.push('⌘');
  if (shortcut.key) {
    // Format key nicely
    let key = shortcut.key;
    if (key === 'ArrowUp') key = '↑';
    else if (key === 'ArrowDown') key = '↓';
    else if (key === 'ArrowLeft') key = '←';
    else if (key === 'ArrowRight') key = '→';
    else if (key.length === 1) key = key.toUpperCase();
    parts.push(key);
  }
  return parts.join(' + ');
}

export default useKeyboardShortcuts;