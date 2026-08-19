import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { createRealtimeConnection } from '../../shared/api/webSocketClient.js';
import { getChat } from '../../features/chats/api/chatApi.js';
import { CallOverlay } from '../../features/chats/components/CallOverlay.jsx';
import { useDirectCall } from '../../features/chats/hooks/useDirectCall.js';
import { useAppFeedback } from './AppFeedbackProvider.jsx';
import { useI18n } from './I18nProvider.jsx';
import { useNotifications } from './NotificationsProvider.jsx';
import { useSession } from './SessionProvider.jsx';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { t } = useI18n();
  const { session } = useSession();
  const { incomingCall, consumeIncomingCall } = useNotifications();
  const { notify } = useAppFeedback();
  const [socket, setSocket] = useState(null);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const reconnectTimerRef = useRef(null);
  const callSignalHandlerRef = useRef(null);
  const activeChatRequestRef = useRef(0);

  const reportError = useCallback((message) => {
    if (message) notify({ kind: 'error', title: t('calls.title'), message });
  }, [notify, t]);

  const call = useDirectCall({
    accessToken: session.accessToken,
    currentUserId: session.user?.id,
    socket,
    t,
    onError: reportError,
  });
  callSignalHandlerRef.current = call.handleSignal;

  const loadActiveChat = useCallback(async (chatId) => {
    if (!chatId || !session.accessToken) return;
    const requestId = activeChatRequestRef.current + 1;
    activeChatRequestRef.current = requestId;
    try {
      const chat = await getChat(session.accessToken, chatId);
      if (activeChatRequestRef.current === requestId) setActiveChat(chat);
    } catch {
      if (activeChatRequestRef.current === requestId) setActiveChat(null);
    }
  }, [session.accessToken]);

  const startCall = useCallback(async (chat) => {
    if (!chat?.id || !chat.peer) return;
    setActiveChat(chat);
    await call.startCall({ chatId: chat.id, peer: chat.peer });
  }, [call]);

  useEffect(() => {
    if (!session.accessToken) call.endCall();
  }, [call.endCall, session.accessToken]);

  useEffect(() => {
    if (!session.accessToken) {
      setSocket(null);
      setIsSocketConnected(false);
      setActiveChat(null);
      return undefined;
    }

    let isActive = true;
    let currentSocket = null;
    let reconnectAttempts = 0;

    function connect() {
      currentSocket = createRealtimeConnection(session.accessToken);
      setSocket(currentSocket);
      currentSocket.addEventListener('open', () => {
        reconnectAttempts = 0;
        setIsSocketConnected(true);
      });
      currentSocket.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.event?.startsWith('call.')) {
            void callSignalHandlerRef.current?.(payload);
          }
        } catch {
          // An invalid realtime payload must not break the call signaling channel.
        }
      });
      currentSocket.addEventListener('close', () => {
        setIsSocketConnected(false);
        if (!isActive) return;
        reconnectAttempts += 1;
        reconnectTimerRef.current = window.setTimeout(connect, Math.min(1000 * reconnectAttempts, 5000));
      });
    }

    connect();
    return () => {
      isActive = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      currentSocket?.close();
      setSocket(null);
      setIsSocketConnected(false);
    };
  }, [session.accessToken]);

  useEffect(() => {
    if (!incomingCall?.chat_id || !call.canSignalCall) return;
    void loadActiveChat(incomingCall.chat_id).finally(() => {
      void call.handleSignal(incomingCall);
      consumeIncomingCall(incomingCall.call_id);
    });
  }, [call.canSignalCall, call.handleSignal, consumeIncomingCall, incomingCall, loadActiveChat]);

  useEffect(() => {
    if (call.callState === 'idle') setActiveChat(null);
  }, [call.callState]);

  return (
    <CallContext.Provider value={{ call: { ...call, canSignalCall: isSocketConnected && call.canSignalCall }, startCall, activeChat }}>
      {children}
      <CallOverlay call={call} peer={activeChat?.peer} chatId={activeChat?.id} t={t} />
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used inside CallProvider');
  return context;
}
