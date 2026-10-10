const { PaymentsService } = require('../src/payments/payments.service');

describe('USD gateway orders', () => {
  it('creates Razorpay orders with the correct USD cents and rejects a mismatched response', async () => {
    const service = new PaymentsService({});
    expect(service.toGatewayAmount('razorpay', 149.01)).toEqual({ amount: 14901, currency: 'USD' });
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

  it('creates PayPal orders from stored USD cents and rejects a mismatched response', async () => {
    const service = new PaymentsService({});
    const order = {
      id: 'order-a',
      access_token: 'token-a',
      order_number: 'ORD-1',
      final_amount: 149.01,
      gateway_amount: 14901,
      gateway_currency: 'USD',
    };
    const paypalRequest = jest.spyOn(service, 'payPalRequest').mockImplementation(async (_path, _method, body) => ({
      id: 'pp_order_usd',
      purchase_units: body.purchase_units.map((unit) => ({ amount: unit.amount })),
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    }));

    await expect(service.attachPayPalOrder(order, { plan_name: 'Speaker' }))
      .resolves.toEqual({ id: 'pp_order_usd', url: 'https://paypal.example/approve' });
    expect(paypalRequest.mock.calls[0][2].purchase_units[0].amount)
      .toEqual({ currency_code: 'USD', value: '149.01' });

    paypalRequest.mockResolvedValue({
      id: 'pp_order_wrong_currency',
      purchase_units: [{ amount: { currency_code: 'INR', value: '149.01' } }],
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    });
    await expect(service.attachPayPalOrder(order, { plan_name: 'Speaker' }))
      .rejects.toThrow('unexpected amount or currency');
  });
});
