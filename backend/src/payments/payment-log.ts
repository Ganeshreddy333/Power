import { Logger } from '@nestjs/common';

// Structured payment logging with a fixed event vocabulary (checklist #25).
// Secrets and cardholder data must never be logged, so payloads are shallow-scrubbed.
export type PaymentEvent =
  | 'ORDER_CREATED'
  | 'ORDER_REUSED'
  | 'CREATE_ORDER_REQUESTED'
  | 'RAZORPAY_ORDER_CREATED'
  | 'STRIPE_SESSION_CREATED'
  | 'PAYPAL_ORDER_CREATED'
  | 'PROVIDER_ORDER_FAILED'
  | 'CHECKOUT_STARTED'
  | 'PAYMENT_VERIFICATION_STARTED'
  | 'PAYMENT_VERIFICATION_SUCCESS'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'WEBHOOK_RECEIVED'
  | 'WEBHOOK_DUPLICATE'
  | 'ORDER_MARKED_PAID'
  | 'ORDER_CANCELLED'
  | 'ORDERS_SWEPT'
  | 'PAYMENT_FAILED_RECORDED'
  | 'REFUND_INITIATED'
  | 'REFUND_RECORDED';

const REDACT = /secret|password|signature|token|key|cvv|card|authorization|email|phone|contact|customer|full.?name/i;

function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACT.test(key)) {
      clean[key] = '[redacted]';
    } else if (value && typeof value === 'object') {
      clean[key] = '[object]';
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function logPaymentEvent(logger: Logger, event: PaymentEvent, meta: Record<string, unknown> = {}) {
  logger.log(`${event} ${JSON.stringify(scrub(meta))}`);
}
