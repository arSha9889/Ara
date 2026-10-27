import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { AraButton } from '../../components/AraButton.jsx';
import { WorkspaceIcon as Icon } from '../../components/WorkspaceIcon.jsx';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];
const VIEWPORT_GUTTER = 12;

export function messageMenuPositionFromEvent(event) {
  if (event.type === 'contextmenu') return { x: event.clientX, y: event.clientY };

  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: bounds.left + Math.min(bounds.width / 2, 180),
    y: bounds.top + Math.min(bounds.height / 2, 32),
  };
}

function focusMenuItem(menu, offset) {
  const items = [...menu.querySelectorAll('[role^="menuitem"]')];
  const currentIndex = items.indexOf(document.activeElement);
  const nextIndex = (currentIndex + offset + items.length) % items.length;
  items[nextIndex]?.focus();
}

export function MessageContextMenu({
  contextMenu,
  onClose,
  onDelete,
  onEdit,
  onPin,
  onReact,
  onReply,
  t,
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);
  const message = contextMenu?.message;
  const isMine = Boolean(contextMenu?.isMine);
  const canEdit = Boolean(contextMenu?.canEdit);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) {
      setPosition(null);
      return;
    }

    const { width, height } = menuRef.current.getBoundingClientRect();
    setPosition({
      x: Math.max(VIEWPORT_GUTTER, Math.min(contextMenu.x, window.innerWidth - width - VIEWPORT_GUTTER)),
      y: Math.max(VIEWPORT_GUTTER, Math.min(contextMenu.y, window.innerHeight - height - VIEWPORT_GUTTER)),
    });
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu || !menuRef.current) return undefined;

    menuRef.current.querySelector('[role^="menuitem"]')?.focus();

    function closeOnOutsidePointer(event) {
      if (!menuRef.current?.contains(event.target)) onClose();
    }

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [contextMenu, onClose]);

  if (!contextMenu || !message) return null;

  function closeAndRun(action) {
    onClose();
    action();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      contextMenu.trigger?.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusMenuItem(event.currentTarget, 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusMenuItem(event.currentTarget, -1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      event.currentTarget.querySelector('[role^="menuitem"]')?.focus();
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const items = event.currentTarget.querySelectorAll('[role^="menuitem"]');
      items[items.length - 1]?.focus();
    }
  }

  return (
    <div
      aria-label={t('workspace.chatPanel.messageActions')}
      className="message-context-menu"
      onKeyDown={handleKeyDown}
      ref={menuRef}
      role="menu"
      style={{ left: position?.x ?? contextMenu.x, top: position?.y ?? contextMenu.y }}
    >
      <div aria-label={t('workspace.chatPanel.reactionsLabel')} className="message-context-menu-reactions" role="group">
        {REACTION_EMOJIS.map((emoji) => {
          const reactedByMe = message.reactions?.some((reaction) => reaction.emoji === emoji && reaction.reacted_by_me);
          return <AraButton
            aria-checked={reactedByMe}
            aria-label={`${t('workspace.chatPanel.react')}: ${emoji}`}
            className="message-context-menu-reaction"
            key={emoji}
            onClick={() => closeAndRun(() => onReact(message, emoji))}
            role="menuitemcheckbox"
            size="compact"
            type="button"
            variant="ghost"
          >{emoji}</AraButton>;
        })}
      </div>
      <div className="message-context-menu-divider" />
      <div className="message-context-menu-actions">
        <AraButton onClick={() => closeAndRun(() => onReply(message))} role="menuitem" size="compact" type="button" variant="ghost"><Icon name="reply" size={15} />{t('workspace.chatPanel.reply')}</AraButton>
        <AraButton aria-pressed={message.is_pinned} onClick={() => closeAndRun(() => onPin(message))} role="menuitem" size="compact" type="button" variant="ghost"><Icon name="pin" size={15} />{message.is_pinned ? t('workspace.chatPanel.unpin') : t('workspace.chatPanel.pin')}</AraButton>
      </div>
      {canEdit || isMine ? <>
        <div className="message-context-menu-divider" />
        <div className="message-context-menu-actions">
          {canEdit ? <AraButton onClick={() => closeAndRun(() => onEdit(message))} role="menuitem" size="compact" type="button" variant="ghost"><Icon name="edit" size={15} />{t('workspace.chatPanel.edit')}</AraButton> : null}
          {isMine ? <AraButton className="is-danger" onClick={() => closeAndRun(() => onDelete(message))} role="menuitem" size="compact" type="button" variant="ghost"><Icon name="trash" size={15} />{t('workspace.chatPanel.delete')}</AraButton> : null}
        </div>
      </> : null}
    </div>
  );
}
