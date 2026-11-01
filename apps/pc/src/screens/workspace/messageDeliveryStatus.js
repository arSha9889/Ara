const DELIVERY_INDICATORS = {
  sent: { icon: 'check', tone: 'sent' },
  delivered: { icon: 'check-double', tone: 'delivered' },
  read: { icon: 'check-double', tone: 'read' },
};

export function messageDeliveryIndicator(deliveryStatus) {
  return DELIVERY_INDICATORS[deliveryStatus] ?? DELIVERY_INDICATORS.sent;
}
