import type { NavigationProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import type { RootStackParamList } from '../../navigation/AppNavigator';
import { getChats } from '../chats/api/chatApi';
import { chatTitle } from '../chats/chatPresentation';
import { useI18n } from '../../localization/I18nProvider';
import { markMobileNotificationsRead } from './api/mobilePushApi';
import { parseMobilePushOpen, type MobilePushOpen } from './mobilePushOpen';
import { getPendingMobilePushOpen, subscribeToMobilePushOpen } from './pushClient';

interface Props {
  navigation: Pick<NavigationProp<RootStackParamList>, 'navigate'>;
}

export function MobilePushNavigationHandler({ navigation }: Props) {
  const { t } = useI18n();
  const handledNotificationIds = useRef(new Set<string>());
  const navigatingNotificationIds = useRef(new Set<string>());
  const chatCopy = useMemo(
    () => ({
      attachment: t('chatsAttachment'),
      directChat: t('chatsDirectFallback'),
      noMessages: t('noMessages'),
      savedMessages: t('chatsSavedMessages'),
      youPrefix: t('youPrefix'),
    }),
    [t],
  );

  const openNotification = useCallback(
    async (value: unknown) => {
      const open = parseMobilePushOpen(value);
      if (
        !open ||
        handledNotificationIds.current.has(open.notificationId) ||
        navigatingNotificationIds.current.has(open.notificationId)
      ) {
        return;
      }

      navigatingNotificationIds.current.add(open.notificationId);
      try {
        await navigateFromMobilePush(navigation, open, chatCopy);
        handledNotificationIds.current.add(open.notificationId);
        await markMobileNotificationsRead([open.notificationId]).catch(() => undefined);
      } catch {
        // Navigation is retried only when Android sends another notification tap.
      } finally {
        navigatingNotificationIds.current.delete(open.notificationId);
      }
    },
    [chatCopy, navigation],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToMobilePushOpen(value => {
      if (active) {
        openNotification(value).catch(() => undefined);
      }
    });

    getPendingMobilePushOpen().then(value => {
      if (active && value) {
        openNotification(value).catch(() => undefined);
      }
    }).catch(() => undefined);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [openNotification]);

  return null;
}

export async function navigateFromMobilePush(
  navigation: Pick<NavigationProp<RootStackParamList>, 'navigate'>,
  open: MobilePushOpen,
  chatCopy: Parameters<typeof chatTitle>[1],
): Promise<void> {
  if (open.kind === 'message') {
    const chat = (await getChats()).find(item => item.id === open.chatId);
    if (!chat) {
      throw new Error('Chat is unavailable.');
    }
    navigation.navigate('Chat', {
      chatId: chat.id,
      title: chatTitle(chat, chatCopy),
      peerUserId: chat.type === 'direct' ? chat.peer?.id : undefined,
      peerIsOnline: chat.type === 'direct' ? chat.peer?.is_online : undefined,
      peerLastSeenAt: chat.type === 'direct' ? chat.peer?.last_seen_at : undefined,
    });
    return;
  }

  if (open.kind === 'support') {
    navigation.navigate('SupportTicket', { ticketId: open.supportTicketId });
    return;
  }

  navigation.navigate('MainTabs', { screen: 'Settings' });
}
