const { PaymentsService } = require('../src/payments/payments.service');

const paypalOrder = (overrides = {}) => ({
  id: 'order-a',
  access_token: 'token-a',
  order_number: 'ORD-1',
  final_amount: 149.01,
  gateway_amount: 14901,
  gateway_currency: 'USD',
  ...overrides,
});

describe('USD gateway orders', () => {
  it('converts valid USD totals to cents', () => {
    const service = new PaymentsService({});
    expect(service.toGatewayAmount('paypal', 166.32)).toEqual({ amount: 16632, currency: 'USD' });
    expect(service.toGatewayAmount('paypal', 149.1)).toEqual({ amount: 14910, currency: 'USD' });
    expect(service.toGatewayAmount('paypal', 0.1)).toEqual({ amount: 10, currency: 'USD' });
    expect(service.toGatewayAmount('razorpay', 149.01)).toEqual({ amount: 14901, currency: 'USD' });
    expect(() => service.toGatewayAmount('paypal', 1.005)).toThrow('valid USD amount');
  });

  it('creates Razorpay orders with USD cents and rejects a mismatched response', async () => {
    const service = new PaymentsService({});
    const originalFetch = global.fetch;
    let requestBody;
    global.fetch = jest.fn(async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ id: 'rp_order_usd', amount: 14901, currency: 'USD' }) };
    });

    try {
      await expect(service.createRazorpayOrder({
        id: 'order-a',
        registration_id: 'registration-a',
        order_number: 'ORD-1',
        gateway_amount: 14901,
      })).resolves.toEqual({ id: 'rp_order_usd' });
      expect(requestBody).toMatchObject({ amount: 14901, currency: 'USD' });

      global.fetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ id: 'rp_order_wrong_currency', amount: 14901, currency: 'INR' }),
      }));
      await expect(service.createRazorpayOrder({
        id: 'order-a',
        registration_id: 'registration-a',
        order_number: 'ORD-1',
        gateway_amount: 14901,
      })).rejects.toThrow('unexpected amount or currency');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('sends $166.32 as exactly 16632 cents and validates PayPal USD response data', async () => {
    const service = new PaymentsService({});
    const order = paypalOrder({ final_amount: 166.32, gateway_amount: 16632 });
    const paypalRequest = jest.spyOn(service, 'payPalRequest').mockImplementation(async (_path, _method, body) => ({
      id: 'pp_order_usd',
      purchase_units: body.purchase_units.map((unit) => ({ amount: unit.amount })),
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    }));

    await expect(service.attachPayPalOrder(order, { plan_name: 'Speaker' }))
      .resolves.toEqual({ id: 'pp_order_usd', url: 'https://paypal.example/approve' });
    expect(paypalRequest.mock.calls[0][2].purchase_units[0].amount)
      .toEqual({ currency_code: 'USD', value: '166.32' });
  });

  it.each([
    ['one decimal place', 14910, '149.10'],
    ['two decimal places', 14901, '149.01'],
  ])('formats PayPal amounts with %s from stored cents', async (_label, gatewayAmount, expectedValue) => {
    const service = new PaymentsService({});
    const paypalRequest = jest.spyOn(service, 'payPalRequest').mockImplementation(async (_path, _method, body) => ({
      id: 'pp_order_usd',
      purchase_units: body.purchase_units.map((unit) => ({ amount: unit.amount })),
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    }));

    await service.attachPayPalOrder(paypalOrder({ gateway_amount: gatewayAmount }), { plan_name: 'Speaker' });

    expect(paypalRequest.mock.calls[0][2].purchase_units[0].amount)
      .toEqual({ currency_code: 'USD', value: expectedValue });
  });

  it.each([
    ['currency', { currency_code: 'INR', value: '149.01' }],
    ['amount', { currency_code: 'USD', value: '149.00' }],
    ['malformed decimal amount', { currency_code: 'USD', value: '149.001' }],
  ])('rejects PayPal responses with a mismatched %s', async (_label, amount) => {
    const service = new PaymentsService({});
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      id: 'pp_order_wrong',
      purchase_units: [{ amount }],
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    });

    await expect(service.attachPayPalOrder(paypalOrder(), { plan_name: 'Speaker' }))
      .rejects.toThrow('unexpected amount or currency');
  });

  it.each([
    ['no purchase units', { id: 'pp_missing_units', purchase_units: [] }],
    ['missing amount', { id: 'pp_missing_amount', purchase_units: [{}] }],
    ['missing order ID', { purchase_units: [{ amount: { currency_code: 'USD', value: '149.01' } }] }],
  ])('rejects PayPal responses with %s', async (_label, response) => {
    const service = new PaymentsService({});
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
      ...response,
    });

    await expect(service.attachPayPalOrder(paypalOrder(), { plan_name: 'Speaker' }))
      .rejects.toThrow('unexpected amount or currency');
  });

  it('rejects a PayPal response without an approval URL', async () => {
    const service = new PaymentsService({});
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      id: 'pp_order_usd',
      purchase_units: [{ amount: { currency_code: 'USD', value: '149.01' } }],
      links: [],
    });

    await expect(service.attachPayPalOrder(paypalOrder(), { plan_name: 'Speaker' }))
      .rejects.toThrow('approval URL');
  });

  it('accepts PayPal payer-action links for buyer approval', async () => {
    const service = new PaymentsService({});
    jest.spyOn(service, 'payPalRequest').mockResolvedValue({
      id: 'pp_order_usd',
      purchase_units: [{ amount: { currency_code: 'USD', value: '149.01' } }],
      links: [{ rel: 'payer-action', href: 'https://paypal.example/approve' }],
    });

    await expect(service.attachPayPalOrder(paypalOrder(), { plan_name: 'Speaker' }))
      .resolves.toEqual({ id: 'pp_order_usd', url: 'https://paypal.example/approve' });
  });

  it('propagates PayPal API errors without treating order creation as successful', async () => {
    const service = new PaymentsService({});
    jest.spyOn(service, 'payPalRequest').mockRejectedValue(new Error('PayPal API unavailable'));

    await expect(service.attachPayPalOrder(paypalOrder(), { plan_name: 'Speaker' }))
      .rejects.toThrow('PayPal API unavailable');
  });

  it('does not request PayPal when the stored amount or currency violates the USD cents contract', async () => {
    const service = new PaymentsService({});
    const paypalRequest = jest.spyOn(service, 'payPalRequest');

    await expect(service.attachPayPalOrder(paypalOrder({ gateway_amount: 149.01 }), {}))
      .rejects.toThrow('Stored PayPal order amount or currency is invalid');
    await expect(service.attachPayPalOrder(paypalOrder({ gateway_currency: 'INR' }), {}))
      .rejects.toThrow('Stored PayPal order amount or currency is invalid');
    expect(paypalRequest).not.toHaveBeenCalled();
  });

  it('uses the live PayPal API in production mode regardless of casing or whitespace', async () => {
    const service = new PaymentsService({});
    const originalFetch = global.fetch;
    const originalMode = process.env.PAYMENT_MODE;
    process.env.PAYMENT_MODE = ' Production ';
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-access-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'pp_order' }) });

    try {
      await service.payPalRequest('/v2/checkout/orders', 'POST', {});
      expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://api-m.paypal.com/v1/oauth2/token',
        'https://api-m.paypal.com/v2/checkout/orders',
      ]);
      expect(global.fetch.mock.calls[1][1].headers.Prefer).toBe('return=representation');
    } finally {
      global.fetch = originalFetch;
      if (originalMode === undefined) delete process.env.PAYMENT_MODE;
      else process.env.PAYMENT_MODE = originalMode;
    }
  });

  it('includes coupon-adjusted fees and accommodation exactly once in the PayPal total', async () => {
    const registration = {
      id: 'registration-a',
      payment_status: 'pending',
      payment_provider: 'paypal',
      plan_key: 'speaker',
      coupon_code: 'SAVE20',
      quantity: 1,
      accommodation_option_id: 'room-a',
      accommodation_check_in: '2027-03-02',
      accommodation_check_out: '2027-03-03',
      plan_name: 'Speaker',
    };
    const savedOrders = [];
    const data = {
      list: jest.fn().mockResolvedValue([registration]),
      computeRegistrationAmount: jest.fn().mockResolvedValue({
        baseAmount: 200,
        discountAmount: 20,
        taxAmount: 9,
        finalAmount: 189,
        couponCode: 'SAVE20',
      }),
      quoteAccommodation: jest.fn().mockResolvedValue({
        optionId: 'room-a',
        name: 'Conference Hotel',
        checkIn: '2027-03-02',
        checkOut: '2027-03-03',
        nights: 1,
        pricePerNight: 77.32,
        total: 77.32,
        currency: 'USD',
      }),
      claimRegistrationCheckout: jest.fn().mockResolvedValue(true),
      reserveCoupon: jest.fn().mockResolvedValue(true),
      createOrderWithAccommodation: jest.fn(async (payload) => {
        const order = { id: 'order-a', ...payload };
        savedOrders.push(order);
        return order;
      }),
      attachProviderOrder: jest.fn(async (_orderId, providerOrderId) => ({
        ...savedOrders[0],
        status: 'PENDING',
        provider_order_id: providerOrderId,
      })),
    };
    const service = new PaymentsService(data);
    jest.spyOn(service, 'assertProviderConfigured').mockImplementation(() => {});
    const paypalRequest = jest.spyOn(service, 'payPalRequest').mockImplementation(async (_path, _method, body) => ({
      id: 'pp_order_total',
      purchase_units: body.purchase_units.map((unit) => ({ amount: unit.amount })),
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    }));

    await service.createOrder({ registrationId: registration.id, provider: 'paypal' });

    expect(savedOrders[0]).toMatchObject({
      base_amount: 277.32,
      discount_amount: 20,
      tax_amount: 9,
      final_amount: 266.32,
      gateway_amount: 26632,
      gateway_currency: 'USD',
    });
    expect(paypalRequest.mock.calls[0][2].purchase_units[0].amount)
      .toEqual({ currency_code: 'USD', value: '266.32' });
  });
});
