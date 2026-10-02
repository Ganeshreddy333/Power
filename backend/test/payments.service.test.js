const { createHmac } = require('node:crypto');
const { BadRequestException } = require('@nestjs/common');
const { PaymentsService } = require('../src/payments/payments.service');

const order = (overrides = {}) => ({
  id: 'order-a',
  registration_id: 'registration-a',
  access_token: 'token-a',
  provider: 'stripe',
  provider_order_id: 'cs_a',
  status: 'PENDING',
  final_amount: 149,
  gateway_amount: 14900,
  currency: 'USD',
  gateway_currency: 'USD',
  ...overrides,
});

const signedStripeEvent = (payload) => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest('hex');
  return { rawBody, headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` } };
};

describe('PaymentsService gateway settlement checks', () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'unit-test-webhook-secret';
    process.env.RAZORPAY_KEY_ID = 'unit-test-key';
    process.env.RAZORPAY_KEY_SECRET = 'unit-test-secret';
    process.env.PAYPAL_WEBHOOK_ID = 'unit-test-webhook-id';
    process.env.PAYPAL_CLIENT_ID = 'unit-test-client-id';
    process.env.PAYPAL_CLIENT_SECRET = 'unit-test-client-secret';
  });

  it('sanitizes raw provider errors before returning them to checkout', () => {
    const service = new PaymentsService({});
    const sanitized = service.sanitize(new BadRequestException('provider key leaked'), 'We could not start your payment.');

    expect(sanitized.getStatus()).toBe(502);
    expect(sanitized.message).toBe('We could not start your payment.');
  });

  it('quotes accommodation on top of registration without discounting the room', async () => {
    const data = {
      computeRegistrationAmount: jest.fn().mockResolvedValue({
        baseAmount: 298,
        discountAmount: 20,
        taxAmount: 13.9,
        finalAmount: 291.9,
        currency: 'USD',
      }),
      quoteAccommodation: jest.fn().mockResolvedValue({
        optionId: 'room-a',
        name: 'Conference Hotel',
        checkIn: '2027-03-02',
        checkOut: '2027-03-04',
        nights: 2,
        pricePerNight: 80,
        total: 160,
        currency: 'USD',
      }),
    };
    const service = new PaymentsService(data);

    await expect(service.quoteRegistration({
      planKey: 'early-speaker',
      couponCode: 'SAVE20',
      quantity: 2,
      amount: 1,
      accommodationOptionId: 'room-a',
      accommodationCheckIn: '2027-03-02',
      accommodationCheckOut: '2027-03-04',
    })).resolves.toEqual({
      accommodation: expect.objectContaining({ total: 160, nights: 2 }),
      amount: { base: 458, discount: 20, tax: 13.9, final: 451.9, currency: 'USD' },
    });
    expect(data.quoteAccommodation).toHaveBeenCalledWith('room-a', '2027-03-02', '2027-03-04');
    expect(data.computeRegistrationAmount).toHaveBeenCalledWith('early-speaker', 'SAVE20', 2);
  });

  it('rejects a repeated order request for the same registration before gateway creation', async () => {
    const registration = { id: 'registration-a', payment_status: 'pending', payment_provider: 'razorpay', plan_key: 'early-speaker', coupon_code: null };
    const data = {
      list: jest.fn().mockResolvedValue([registration]),
      computeRegistrationAmount: jest.fn().mockResolvedValue({ finalAmount: 149, couponCode: null }),
      claimRegistrationCheckout: jest.fn().mockResolvedValue(false),
      reserveCoupon: jest.fn(),
    };
    const service = new PaymentsService(data);

    await expect(service.createOrder({ registrationId: registration.id, provider: 'razorpay' })).rejects.toThrow('already been started');

    expect(data.reserveCoupon).not.toHaveBeenCalled();
  });

  it('reconciles a captured Razorpay payment against the stored amount and order', async () => {
    const storedOrder = order({ provider: 'razorpay', provider_order_id: 'rp_order_a', gateway_currency: 'INR', gateway_amount: 1341000 });
    const payments = [];
    let status = 'PENDING';
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.id) return [{ ...storedOrder, status }];
        if (table === 'payments' && filters.provider_payment_id) return payments.filter((payment) => payment.provider_payment_id === filters.provider_payment_id);
        if (table === 'registration_intents') return [{ payment_status: status === 'PAID' ? 'paid' : 'pending' }];
        return [];
      }),
      insert: jest.fn(async (_table, payment) => { payments.push(payment); return payment; }),
      transitionOrderStatus: jest.fn(async (_id, from, to) => {
        if (from.includes(status)) { status = to; return true; }
        return false;
      }),
      updateRegistrationPayment: jest.fn(),
      recordPaymentAudit: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'fetchRazorpayOrderPayments').mockResolvedValue([
      { id: 'rp_pay_a', order_id: 'rp_order_a', amount: 1341000, currency: 'INR', status: 'captured', method: 'upi' },
    ]);

    await expect(service.reconcileOrder(storedOrder.id, 'admin-a')).resolves.toMatchObject({ status: 'PAID', providerReference: 'rp_pay_a' });

    expect(data.recordPaymentAudit).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'admin-a', action: 'PAYMENT_RECONCILED' }));
  });

  it('releases the registration claim when a provider rejects order creation', async () => {
    const registration = { id: 'registration-a', payment_status: 'pending', payment_provider: 'paypal', plan_key: 'early-speaker', coupon_code: null };
    const gatewayOrder = { id: 'order-a', registration_id: registration.id, order_number: 'ORD-1', coupon_code: null };
    const data = {
      list: jest.fn().mockResolvedValue([registration]),
      computeRegistrationAmount: jest.fn().mockResolvedValue({ finalAmount: 149, couponCode: null }),
      claimRegistrationCheckout: jest.fn().mockResolvedValue(true),
      insert: jest.fn().mockResolvedValue(gatewayOrder),
      update: jest.fn(),
      releaseRegistrationCheckoutClaim: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'attachPayPalOrder').mockRejectedValue(new Error('provider unavailable'));

    await expect(service.createOrder({ registrationId: registration.id, provider: 'paypal' })).rejects.toThrow();

    expect(data.releaseRegistrationCheckoutClaim).toHaveBeenCalledWith(registration.id);
  });

  it('releases the registration claim after a buyer cancels checkout', async () => {
    const pendingOrder = order({ access_token: 'token-a', coupon_code: null });
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.access_token === 'token-a' ? [pendingOrder] : []),
      transitionOrderStatus: jest.fn().mockResolvedValue(true),
      releaseRegistrationCheckoutClaim: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.cancelOrder('token-a');

    expect(data.releaseRegistrationCheckoutClaim).toHaveBeenCalledWith(pendingOrder.registration_id);
  });

  it('releases checkout claims when stale open orders are cancelled', async () => {
    const staleOrder = order({ coupon_code: null });
    const data = {
      findStaleOpenOrders: jest.fn().mockResolvedValue([staleOrder]),
      transitionOrderStatus: jest.fn().mockResolvedValue(true),
      releaseRegistrationCheckoutClaim: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.cleanupStaleOrders();

    expect(data.releaseRegistrationCheckoutClaim).toHaveBeenCalledWith(staleOrder.registration_id);
  });

  it('records the authenticated admin before requesting a refund', async () => {
    const paidOrder = order({ provider: 'razorpay', status: 'PAID', gateway_currency: 'INR', gateway_amount: 1341000 });
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.id) return [paidOrder];
        if (table === 'payments' && filters.status === 'SUCCESS') return [{ provider_payment_id: 'pay-a' }];
        return [];
      }),
      claimOrderRefund: jest.fn().mockResolvedValue(true),
      recordPaymentAudit: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'refundRazorpay').mockResolvedValue({ id: 'refund-a', amount: 1341000, currency: 'INR', status: 'processed' });
    jest.spyOn(service, 'recordRefund').mockResolvedValue({ status: 'REFUNDED' });

    await service.initiateRefund(paidOrder.id, 'admin-user-1');

    expect(data.recordPaymentAudit).toHaveBeenCalledWith(expect.objectContaining({
      orderId: paidOrder.id,
      actorUserId: 'admin-user-1',
      action: 'REFUND_INITIATED',
      previousStatus: 'PAID',
      newStatus: 'REFUND_PENDING',
      amountMinor: 1341000,
      currency: 'INR',
    }));
  });

  it('rejects sandbox Razorpay credentials in production mode', () => {
    const keys = ['NODE_ENV', 'PAYMENT_MODE', 'FRONTEND_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      NODE_ENV: 'production',
      PAYMENT_MODE: 'production',
      FRONTEND_URL: 'https://conference.example.test',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'test-secret',
      RAZORPAY_WEBHOOK_SECRET: 'test-webhook-secret',
    });

    try {
      const service = new PaymentsService({});
      expect(() => service.assertProviderConfigured('razorpay')).toThrow('key mode does not match');
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });

  it('blocks live Razorpay credentials from local sandbox checkout', () => {
    const keys = ['NODE_ENV', 'PAYMENT_MODE', 'FRONTEND_URL', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    Object.assign(process.env, {
      NODE_ENV: 'development',
      PAYMENT_MODE: 'sandbox',
      FRONTEND_URL: 'http://localhost:3000',
      RAZORPAY_KEY_ID: 'rzp_live_key',
      RAZORPAY_KEY_SECRET: 'live-secret',
    });

    try {
      const service = new PaymentsService({});
      expect(() => service.assertProviderConfigured('razorpay')).toThrow('key mode does not match');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('does not settle an unpaid Stripe checkout session', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => {
        if (filters.id) return [order()];
        return [];
      }),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);
    const settle = jest.spyOn(service, 'markOrderPaid');
    const payload = {
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_a', metadata: { order_id: 'order-a' }, payment_status: 'unpaid', amount_total: 14900, currency: 'usd' } },
    };
    const signed = signedStripeEvent(payload);

    await service.handleWebhook('stripe', signed.rawBody, signed.headers, payload);

    expect(settle).not.toHaveBeenCalled();
    expect(data.insert).not.toHaveBeenCalled();
  });

  it('binds an early Stripe webhook before the gateway order ID is persisted', async () => {
    const pendingOrder = order({ provider_order_id: null });
    const data = { list: jest.fn(async (_table, filters = {}) => filters.id ? [pendingOrder] : []) };
    const service = new PaymentsService(data);
    const settle = jest.spyOn(service, 'markOrderPaid').mockResolvedValue(true);
    const payload = {
      id: 'evt_early',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_a', metadata: { order_id: 'order-a' }, payment_status: 'paid', amount_total: 14900, currency: 'usd', payment_intent: 'pi_a' } },
    };
    const signed = signedStripeEvent(payload);

    await service.handleWebhook('stripe', signed.rawBody, signed.headers, payload);

    expect(settle).toHaveBeenCalledWith(pendingOrder, expect.objectContaining({ providerOrderId: 'cs_a' }));
  });

  it('does not settle a Stripe session with a mismatched amount or currency', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.id ? [order()] : []),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);
    const settle = jest.spyOn(service, 'markOrderPaid');
    const payload = {
      id: 'evt_mismatch',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_a', metadata: { order_id: 'order-a' }, payment_status: 'paid', amount_total: 100, currency: 'inr' } },
    };
    const signed = signedStripeEvent(payload);

    await expect(service.handleWebhook('stripe', signed.rawBody, signed.headers, payload)).rejects.toThrow();

    expect(settle).not.toHaveBeenCalled();
    expect(data.insert).not.toHaveBeenCalled();
  });

  it('does not treat Razorpay authorization as captured payment', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.provider_order_id ? [order({ provider: 'razorpay', provider_order_id: 'rp_order_a', gateway_currency: 'INR', gateway_amount: 1341000 })] : []),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'fetchRazorpayPayment').mockResolvedValue({ id: 'rp_pay_a', amount: 1341000, currency: 'INR', status: 'authorized' });
    const settle = jest.spyOn(service, 'markOrderPaid');
    const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('rp_order_a|rp_pay_a').digest('hex');

    await expect(service.verifyRazorpayPayment({ razorpay_order_id: 'rp_order_a', razorpay_payment_id: 'rp_pay_a', razorpay_signature: signature })).rejects.toThrow();

    expect(settle).not.toHaveBeenCalled();
  });

  it('rejects a Razorpay payment fetched under a different provider order ID', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.provider_order_id ? [order({ provider: 'razorpay', provider_order_id: 'rp_order_a', gateway_currency: 'INR', gateway_amount: 1341000 })] : []),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'fetchRazorpayPayment').mockResolvedValue({ id: 'rp_pay_a', order_id: 'rp_order_other', amount: 1341000, currency: 'INR', status: 'captured' });
    const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update('rp_order_a|rp_pay_a').digest('hex');
    const settle = jest.spyOn(service, 'markOrderPaid');

    await expect(service.verifyRazorpayPayment({ razorpay_order_id: 'rp_order_a', razorpay_payment_id: 'rp_pay_a', razorpay_signature: signature })).rejects.toThrow('different Razorpay order');

    expect(settle).not.toHaveBeenCalled();
  });

  it('does not mutate an order when Razorpay verification has an invalid signature', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.provider_order_id ? [order({ provider: 'razorpay', provider_order_id: 'rp_order_a' })] : []),
      insert: jest.fn(),
      update: jest.fn(),
      transitionOrderStatus: jest.fn(),
    };
    const service = new PaymentsService(data);

    await expect(service.verifyRazorpayPayment({
      razorpay_order_id: 'rp_order_a',
      razorpay_payment_id: 'rp_pay_a',
      razorpay_signature: 'invalid',
    })).rejects.toThrow('Payment verification failed');

    expect(data.insert).not.toHaveBeenCalled();
    expect(data.transitionOrderStatus).not.toHaveBeenCalled();
  });

  it('settles a Razorpay webhook only after raw-body HMAC and provider transaction verification, idempotently', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'unit-test-razorpay-webhook';
    const razorpayOrder = order({
      provider: 'razorpay',
      provider_order_id: 'rp_order_a',
      gateway_currency: 'INR',
      gateway_amount: 1341000,
    });
    const payments = [];
    let registrationPaymentStatus = 'pending';
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.provider_order_id === 'rp_order_a') return [razorpayOrder];
        if (table === 'orders' && filters.id === razorpayOrder.id) return [razorpayOrder];
        if (table === 'payments') return payments.filter((payment) => Object.entries(filters).every(([key, value]) => payment[key] === value));
        if (table === 'registration_intents') return [{ id: razorpayOrder.registration_id, payment_status: registrationPaymentStatus }];
        return [];
      }),
      insert: jest.fn(async (_table, payload) => {
        const payment = { id: 'payment-a', ...payload };
        payments.push(payment);
        return payment;
      }),
      transitionOrderStatus: jest.fn(async (_id, allowed, next) => {
        if (!allowed.includes(razorpayOrder.status)) return false;
        razorpayOrder.status = next;
        return true;
      }),
      updateRegistrationPayment: jest.fn(async (payload) => { registrationPaymentStatus = payload.p_payment_status; }),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'fetchRazorpayPayment').mockResolvedValue({
      id: 'rp_pay_a',
      order_id: 'rp_order_a',
      amount: 1341000,
      currency: 'INR',
      status: 'captured',
      method: 'upi',
    });
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'rp_pay_a',
            order_id: 'rp_order_a',
            amount: 1341000,
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const headers = { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt-rp-a' };

    await service.handleWebhook('razorpay', rawBody, headers, payload);
    await service.handleWebhook('razorpay', rawBody, headers, payload);

    expect(razorpayOrder.status).toBe('PAID');
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider_payment_id: 'rp_pay_a',
      provider_order_id: 'rp_order_a',
      gateway_amount: 1341000,
      gateway_currency: 'INR',
      status: 'SUCCESS',
    });
  });

  it('rejects an invalid Razorpay webhook signature before any provider or database mutation', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'unit-test-razorpay-webhook';
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay-a', order_id: 'rp_order_a' } } } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const data = {
      list: jest.fn(),
      insert: jest.fn(),
      transitionOrderStatus: jest.fn(),
    };
    const service = new PaymentsService(data);
    const providerFetch = jest.spyOn(service, 'fetchRazorpayPayment');

    await expect(service.handleWebhook('razorpay', rawBody, { 'x-razorpay-signature': 'invalid' }, payload))
      .rejects.toThrow('Invalid Razorpay webhook signature');

    expect(data.list).not.toHaveBeenCalled();
    expect(data.insert).not.toHaveBeenCalled();
    expect(data.transitionOrderStatus).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('does not let a Razorpay failure webhook mutate an order from another provider', async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'unit-test-razorpay-webhook';
    const payload = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay-a', order_id: 'shared-id' } } } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.provider_order_id ? [order({ provider: 'stripe', provider_order_id: 'shared-id' })] : []),
      insert: jest.fn(),
      update: jest.fn(),
      transitionOrderStatus: jest.fn(),
    };
    const service = new PaymentsService(data);

    await expect(service.handleWebhook('razorpay', rawBody, { 'x-razorpay-signature': signature }, payload)).rejects.toThrow('does not own this order');

    expect(data.insert).not.toHaveBeenCalled();
    expect(data.transitionOrderStatus).not.toHaveBeenCalled();
  });

  it('does not attach a provider payment already owned by another order', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => {
        if (filters.id === 'order-b') return [order({ id: 'order-b', registration_id: 'registration-b' })];
        if (filters.provider_payment_id === 'pay-a') return [{ id: 'payment-a', order_id: 'order-a', provider_payment_id: 'pay-a' }];
        return [];
      }),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);

    await expect(service.markOrderPaid(order({ id: 'order-b', registration_id: 'registration-b' }), { provider: 'stripe', providerPaymentId: 'pay-a' })).rejects.toThrow();

    expect(data.insert).not.toHaveBeenCalled();
    expect(data.update).not.toHaveBeenCalled();
  });

  it('does not move a refunded order back to paid', async () => {
    const refunded = order({ status: 'REFUNDED' });
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.id ? [refunded] : []),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.markOrderPaid(refunded, { provider: 'stripe', providerPaymentId: 'pay-new' });

    expect(data.insert).not.toHaveBeenCalled();
    expect(data.update).not.toHaveBeenCalled();
  });

  it('captures only the PayPal order bound to the checkout access token', async () => {
    const data = { list: jest.fn().mockResolvedValue([order({ provider: 'paypal', provider_order_id: 'pp_a' })]) };
    const service = new PaymentsService(data);
    const request = jest.spyOn(service, 'payPalRequest');

    await expect(service.capturePayPalOrder('token-a', 'pp_other')).rejects.toThrow('does not match');

    expect(request).not.toHaveBeenCalled();
  });

  it('records a PayPal capture only when amount and currency match the order', async () => {
    const paypalOrder = order({ provider: 'paypal', provider_order_id: 'pp_a' });
    const data = { list: jest.fn().mockResolvedValue([paypalOrder]) };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      id: 'pp_a',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'order-a', payments: { captures: [{ id: 'cap_a', status: 'COMPLETED', amount: { value: '149.00', currency_code: 'USD' } }] } }],
    });
    const settle = jest.spyOn(service, 'markOrderPaid').mockResolvedValue(true);

    await expect(service.capturePayPalOrder('token-a', 'pp_a')).resolves.toMatchObject({ status: 'PAID' });

    expect(settle).toHaveBeenCalledWith(paypalOrder, expect.objectContaining({ providerPaymentId: 'cap_a' }));
  });

  it('does not settle PayPal captures with a mismatched amount', async () => {
    const paypalOrder = order({ provider: 'paypal', provider_order_id: 'pp_a' });
    const data = { list: jest.fn().mockResolvedValue([paypalOrder]) };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      id: 'pp_a',
      status: 'COMPLETED',
      purchase_units: [{ custom_id: 'order-a', payments: { captures: [{ id: 'cap_a', status: 'COMPLETED', amount: { value: '1.00', currency_code: 'USD' } }] } }],
    });
    const settle = jest.spyOn(service, 'markOrderPaid');

    await expect(service.capturePayPalOrder('token-a', 'pp_a')).rejects.toThrow('amount or currency');

    expect(settle).not.toHaveBeenCalled();
  });

  it('recovers a completed PayPal capture after a lost capture response', async () => {
    const paypalOrder = order({ provider: 'paypal', provider_order_id: 'pp_a' });
    const data = { list: jest.fn().mockResolvedValue([paypalOrder]) };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'payPalRequest')
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce({
        id: 'pp_a',
        status: 'COMPLETED',
        purchase_units: [{ custom_id: 'order-a', payments: { captures: [{ id: 'cap_a', status: 'COMPLETED', amount: { value: '149.00', currency_code: 'USD' } }] } }],
      });
    const settle = jest.spyOn(service, 'markOrderPaid').mockResolvedValue(true);

    await expect(service.capturePayPalOrder('token-a', 'pp_a')).resolves.toMatchObject({ status: 'PAID' });

    expect(settle).toHaveBeenCalledTimes(1);
  });

  it('does not settle a PayPal webhook capture with a mismatched amount', async () => {
    const data = {
      list: jest.fn(async (_table, filters = {}) => filters.id ? [order({ provider: 'paypal', provider_order_id: 'pp_a' })] : []),
      insert: jest.fn(),
      update: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({ verification_status: 'SUCCESS' });
    const settle = jest.spyOn(service, 'markOrderPaid');
    const payload = {
      id: 'evt_paypal_mismatch',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: 'cap_a',
        custom_id: 'order-a',
        status: 'COMPLETED',
        amount: { value: '1.00', currency_code: 'USD' },
        supplementary_data: { related_ids: { order_id: 'pp_a' } },
      },
    };

    await expect(service.handleWebhook('paypal', Buffer.from(JSON.stringify(payload)), {}, payload)).rejects.toThrow('amount or currency');

    expect(settle).not.toHaveBeenCalled();
  });

  it('correlates Stripe refund webhooks through the original payment when metadata is absent', async () => {
    const stripeOrder = order();
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'payments' && filters.provider_payment_id === 'pi_a') return [{ id: 'payment-a', order_id: stripeOrder.id, provider: 'stripe', provider_payment_id: 'pi_a', status: 'SUCCESS' }];
        if (table === 'orders' && filters.id === stripeOrder.id) return [stripeOrder];
        return [];
      }),
      insert: jest.fn(async (_table, payload) => payload),
      update: jest.fn(),
      recordPaymentAudit: jest.fn(),
    };
    const service = new PaymentsService(data);
    const payload = {
      id: 'evt_stripe_refund',
      type: 'refund.updated',
      data: { object: { id: 're_a', object: 'refund', payment_intent: 'pi_a', amount: 14900, currency: 'usd', status: 'succeeded' } },
    };
    const signed = signedStripeEvent(payload);

    await service.handleWebhook('stripe', signed.rawBody, signed.headers, payload);

    expect(data.insert).toHaveBeenCalledWith('refunds', expect.objectContaining({ order_id: stripeOrder.id, provider_refund_id: 're_a', provider_payment_id: 'pi_a' }));
  });

  it('correlates PayPal refund webhooks through the original capture ID', async () => {
    const paypalOrder = order({ provider: 'paypal', provider_order_id: 'pp_a' });
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'payments' && filters.provider_payment_id === 'cap_a') return [{ id: 'payment-a', order_id: paypalOrder.id, provider: 'paypal', provider_payment_id: 'cap_a', status: 'SUCCESS' }];
        if (table === 'orders' && filters.id === paypalOrder.id) return [paypalOrder];
        return [];
      }),
      insert: jest.fn(async (_table, payload) => payload),
      update: jest.fn(),
      recordPaymentAudit: jest.fn(),
      releaseOrderRefundClaim: jest.fn(),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({ verification_status: 'SUCCESS' });
    const payload = {
      id: 'evt_paypal_refund',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id: 'refund-pa',
        status: 'COMPLETED',
        amount: { value: '149.00', currency_code: 'USD' },
        supplementary_data: { related_ids: { capture_id: 'cap_a' } },
      },
    };

    await service.handleWebhook('paypal', Buffer.from(JSON.stringify(payload)), {}, payload);

    expect(data.insert).toHaveBeenCalledWith('refunds', expect.objectContaining({ order_id: paypalOrder.id, provider_refund_id: 'refund-pa', provider_payment_id: 'cap_a' }));
  });

  it('records a provider refund separately from the original payment', async () => {
    const paidOrder = order({ status: 'PAID' });
    const refunds = [];
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.id) return [paidOrder];
        if (table === 'payments' && (filters.order_id === paidOrder.id || filters.provider_payment_id === 'pay-a')) return [{ id: 'payment-a', order_id: paidOrder.id, provider_payment_id: 'pay-a', status: 'SUCCESS' }];
        if (table === 'refunds') return refunds.filter((refund) => Object.entries(filters).every(([key, value]) => refund[key] === value));
        return [];
      }),
      insert: jest.fn(async (_table, payload) => {
        const refund = { id: 'refund-row', ...payload };
        refunds.push(refund);
        return refund;
      }),
      update: jest.fn(),
      updateRegistrationPayment: jest.fn(),
      recordPaymentAudit: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.recordRefund(paidOrder, {
      refundId: 'refund-a',
      providerPaymentId: 'pay-a',
      amountMinor: 14900,
      currency: 'USD',
      status: 'SUCCEEDED',
    });

    expect(data.insert).toHaveBeenCalledWith('refunds', expect.objectContaining({
      order_id: paidOrder.id,
      provider_refund_id: 'refund-a',
      provider_payment_id: 'pay-a',
      amount_minor: 14900,
      currency: 'USD',
      status: 'SUCCEEDED',
    }));
    expect(data.update).toHaveBeenCalledWith('orders', paidOrder.id, { status: 'REFUNDED' });
  });

  it('advances a pending refund to succeeded without creating a second refund', async () => {
    const paidOrder = order({ status: 'PAID' });
    const refunds = [];
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.id) return [paidOrder];
        if (table === 'payments' && filters.provider_payment_id === 'pay-a') return [{ id: 'payment-a', order_id: paidOrder.id, provider_payment_id: 'pay-a', status: 'SUCCESS' }];
        if (table === 'refunds') return refunds.filter((refund) => Object.entries(filters).every(([key, value]) => refund[key] === value));
        return [];
      }),
      insert: jest.fn(async (_table, payload) => {
        const refund = { id: `refund-row-${refunds.length + 1}`, ...payload };
        refunds.push(refund);
        return refund;
      }),
      update: jest.fn(async (table, id, payload) => {
        const row = table === 'refunds' ? refunds.find((refund) => refund.id === id) : table === 'orders' ? paidOrder : {};
        Object.assign(row, payload);
        return row;
      }),
      updateRegistrationPayment: jest.fn(),
      releaseOrderRefundClaim: jest.fn(),
      recordPaymentAudit: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.recordRefund(paidOrder, { refundId: 'refund-a', providerPaymentId: 'pay-a', amountMinor: 14900, currency: 'USD', status: 'PENDING', eventId: 'evt-created' });
    await service.recordRefund(paidOrder, { refundId: 'refund-a', providerPaymentId: 'pay-a', amountMinor: 14900, currency: 'USD', status: 'SUCCEEDED', eventId: 'evt-processed' });

    expect(refunds).toHaveLength(1);
    expect(refunds[0].status).toBe('SUCCEEDED');
    expect(paidOrder.status).toBe('REFUNDED');
  });

  it('repairs order state when a completed refund event is replayed after a database failure', async () => {
    const pendingOrder = order({ status: 'REFUND_PENDING' });
    const refund = { id: 'refund-row', order_id: pendingOrder.id, provider: 'stripe', provider_refund_id: 'refund-a', provider_payment_id: 'pay-a', amount_minor: 14900, currency: 'USD', status: 'SUCCEEDED' };
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.id) return [pendingOrder];
        if (table === 'payments' && filters.provider_payment_id === 'pay-a') return [{ id: 'payment-a', order_id: pendingOrder.id, provider_payment_id: 'pay-a', status: 'SUCCESS' }];
        if (table === 'refunds') return Object.entries(filters).every(([key, value]) => refund[key] === value) ? [refund] : [];
        return [];
      }),
      insert: jest.fn(),
      update: jest.fn(),
      recordPaymentAudit: jest.fn(),
    };
    const service = new PaymentsService(data);

    await service.recordRefund(pendingOrder, { refundId: 'refund-a', providerPaymentId: 'pay-a', amountMinor: 14900, currency: 'USD', status: 'SUCCEEDED' });

    expect(data.insert).not.toHaveBeenCalled();
    expect(data.update).toHaveBeenCalledWith('orders', pendingOrder.id, { status: 'REFUNDED' });
    expect(data.update).toHaveBeenCalledWith('registration_intents', pendingOrder.registration_id, { payment_status: 'refunded', status: 'refunded' });
  });

  it('reports paid only when the exact database transaction matches the order and gateway charge', async () => {
    const paidOrder = order({
      provider: 'razorpay',
      provider_order_id: 'rp_order_a',
      status: 'PAID',
      gateway_amount: 1341000,
      gateway_currency: 'INR',
    });
    const transaction = {
      order_id: paidOrder.id,
      provider: 'razorpay',
      provider_payment_id: 'rp_pay_a',
      provider_order_id: 'rp_order_a',
      amount: paidOrder.final_amount,
      currency: 'USD',
      gateway_amount: 1341000,
      gateway_currency: 'INR',
      status: 'SUCCESS',
    };
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders' && filters.access_token === 'token-a') return [paidOrder];
        if (table === 'payments' && filters.order_id === paidOrder.id) return [transaction];
        if (table === 'registration_intents') return [{ id: paidOrder.registration_id, full_name: 'Customer A' }];
        return [];
      }),
    };
    const service = new PaymentsService(data);

    await expect(service.getStatus('token-a')).resolves.toMatchObject({
      status: 'PAID',
      paid: true,
      gatewayPaymentId: 'rp_pay_a',
      gatewayAmount: 1341000,
      gatewayCurrency: 'INR',
    });

    transaction.gateway_amount = 1340999;
    await expect(service.getStatus('token-a')).rejects.toThrow('Verified payment transaction is unavailable or inconsistent');
  });

  it('isolates two signed Razorpay payments, transactions, statuses, and receipts by customer', async () => {
    const orderA = order({ id: 'order-a', registration_id: 'registration-a', access_token: 'token-a', provider_order_id: 'rp-order-a', status: 'PENDING', provider: 'razorpay', gateway_amount: 1341000, gateway_currency: 'INR' });
    const orderB = order({ id: 'order-b', registration_id: 'registration-b', access_token: 'token-b', provider_order_id: 'rp-order-b', status: 'PENDING', provider: 'razorpay', gateway_amount: 894000, gateway_currency: 'INR', final_amount: 99 });
    const orders = [orderA, orderB];
    const registrations = [
      { id: 'registration-a', payment_status: 'pending', full_name: 'Customer A' },
      { id: 'registration-b', payment_status: 'pending', full_name: 'Customer B' },
    ];
    const transactions = [];
    const data = {
      list: jest.fn(async (table, filters = {}) => {
        if (table === 'orders') return orders.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (table === 'payments') return transactions.filter((payment) => Object.entries(filters).every(([key, value]) => payment[key] === value));
        if (table === 'registration_intents') return registrations.filter((registration) => Object.entries(filters).every(([key, value]) => registration[key] === value));
        return [];
      }),
      insert: jest.fn(async (_table, payload) => {
        const transaction = { id: `payment-${transactions.length + 1}`, ...payload };
        transactions.push(transaction);
        return transaction;
      }),
      transitionOrderStatus: jest.fn(async (id, allowed, next) => {
        const target = orders.find((row) => row.id === id);
        if (!target || !allowed.includes(target.status)) return false;
        target.status = next;
        return true;
      }),
      updateRegistrationPayment: jest.fn(async (payload) => {
        const registration = registrations.find((row) => row.id === payload.p_registration_id);
        if (registration) Object.assign(registration, { payment_status: payload.p_payment_status });
      }),
      getReceipt: jest.fn(async (registrationId, orderId) => ({ registrationId, orderId })),
    };
    const service = new PaymentsService(data);
    const verifiedPayments = {
      'pay-a': { id: 'pay-a', order_id: 'rp-order-a', amount: 1341000, currency: 'INR', status: 'captured', method: 'upi' },
      'pay-b': { id: 'pay-b', order_id: 'rp-order-b', amount: 894000, currency: 'INR', status: 'captured', method: 'card' },
    };
    jest.spyOn(service, 'fetchRazorpayPayment').mockImplementation(async (paymentId) => verifiedPayments[paymentId]);

    for (const [razorpayOrderId, razorpayPaymentId] of [['rp-order-a', 'pay-a'], ['rp-order-b', 'pay-b']]) {
      const razorpaySignature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
      await service.verifyRazorpayPayment({ razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature });
    }

    await expect(service.getStatus('token-a')).resolves.toMatchObject({ paid: true, gatewayPaymentId: 'pay-a', registrationId: 'registration-a' });
    await expect(service.getStatus('token-b')).resolves.toMatchObject({ paid: true, gatewayPaymentId: 'pay-b', registrationId: 'registration-b' });
    await expect(service.getReceiptByToken('token-a')).resolves.toEqual({ registrationId: 'registration-a', orderId: 'order-a' });
    await expect(service.getReceiptByToken('token-b')).resolves.toEqual({ registrationId: 'registration-b', orderId: 'order-b' });

    expect(transactions).toHaveLength(2);
    expect(transactions.map((payment) => [payment.order_id, payment.provider_payment_id, payment.gateway_amount, payment.gateway_currency])).toEqual([
      ['order-a', 'pay-a', 1341000, 'INR'],
      ['order-b', 'pay-b', 894000, 'INR'],
    ]);
    expect(data.getReceipt.mock.calls).toEqual([
      ['registration-a', 'order-a'],
      ['registration-b', 'order-b'],
    ]);
  });
});
