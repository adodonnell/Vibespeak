import React, { useEffect, useCallback, useRef, useState, memo } from 'react';
import './ContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  submenu?: ContextMenuItem[];
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const MenuItem: React.FC<{
  item: ContextMenuItem;
  onClose: () => void;
  onSubmenuOpen: (id: string | null) => void;
  openSubmenu: string | null;
}> = memo(({ item, onClose, onSubmenuOpen, openSubmenu }) => {
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });
  const itemRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(() => {
    if (item.disabled || item.submenu) return;
    item.onClick?.();
    onClose();
  }, [item, onClose]);

  const handleMouseEnter = useCallback(() => {
    if (item.submenu && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setSubmenuPosition({ x: rect.right - 4, y: rect.top - 4 });
      onSubmenuOpen(item.id);
    }
  }, [item, onSubmenuOpen]);

  const handleMouseLeave = useCallback(() => {
    if (!openSubmenu || openSubmenu !== item.id) return;
    // Delay to allow mouse to enter submenu
    setTimeout(() => {
      if (itemRef.current && !itemRef.current.matches(':hover')) {
        onSubmenuOpen(null);
      }
    }, 100);
  }, [item.id, openSubmenu, onSubmenuOpen]);

  return (
    <div ref={itemRef}>
      <div
        className={`context-menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''} ${item.submenu ? 'has-submenu' : ''}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="context-menu-item-icon">{item.icon}</span>
        <span className="context-menu-item-label">{item.label}</span>
        {item.shortcut && <span className="context-menu-item-shortcut">{item.shortcut}</span>}
        {item.submenu && (
          <svg className="context-menu-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
          </svg>
        )}
      </div>
      {item.submenu && openSubmenu === item.id && (
        <div className="context-menu context-menu-submenu" style={{ left: submenuPosition.x, top: submenuPosition.y }}>
          {item.submenu.map((subItem) => (
            <MenuItem
              key={subItem.id}
              item={subItem}
              onClose={onClose}
              onSubmenuOpen={() => {}}
              openSubmenu={null}
            />
          ))}
        </div>
      )}
    </div>
  );
});

MenuItem.displayName = 'MenuItem';

export const ContextMenu: React.FC<ContextMenuProps> = memo(({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth - 8) {
        x = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight - 8) {
        y = viewportHeight - rect.height - 8;
      }

      setAdjustedPosition({ x: Math.max(8, x), y: Math.max(8, y) });
    }
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.id === '---' ? (
            <div className="context-menu-divider" />
          ) : (
            <MenuItem
              item={item}
              onClose={onClose}
              onSubmenuOpen={setOpenSubmenu}
              openSubmenu={openSubmenu}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
});

ContextMenu.displayName = 'ContextMenu';

// Icons used in context menus
export const ContextMenuIcons = {
  reply: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  ),
  delete: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  ),
  pin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
    </svg>
  ),
  unpin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" style={{ opacity: 0.5 }}/>
    </svg>
  ),
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </svg>
  ),
  link: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
    </svg>
  ),
  react: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
    </svg>
  ),
  mention: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57V12c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57V12c0-5.52-4.48-10-10-10zm0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
    </svg>
  ),
  kick: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
    </svg>
  ),
  ban: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/>
    </svg>
  ),
  mute: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    </svg>
  ),
};

export default ContextMenu;