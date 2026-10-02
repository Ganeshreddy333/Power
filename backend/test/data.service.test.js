const { DataService } = require('../src/data/data.service');

describe('DataService raw-query behavior', () => {
  it('returns a public speaker profile with sessions associated by speaker ID', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{
          id: 'speaker-1',
          name: 'Dr. Example',
          bio: 'Full biography',
          is_visible: 1,
        }])
        .mockResolvedValueOnce([{
          id: 'session-1',
          title: 'Solar Futures',
          description: 'Research session',
          startTime: new Date('2027-03-03T09:00:00.000Z'),
          endTime: new Date('2027-03-03T10:00:00.000Z'),
          room: 'Main Hall',
        }]),
    };
    const service = new DataService(prisma, undefined, undefined);

    const profile = await service.getPublicSpeakerProfile('speaker-1');

    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain('`id` = ? AND `is_visible` = TRUE');
    expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe('speaker-1');
    expect(prisma.$queryRawUnsafe.mock.calls[1][0]).toContain('`_SessionToSpeaker`');
    expect(prisma.$queryRawUnsafe.mock.calls[1][1]).toBe('speaker-1');
    expect(profile.speaker.id).toBe('speaker-1');
    expect(profile.sessions[0].id).toBe('session-1');
  });

  it('does not return hidden or deleted speaker profiles', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.getPublicSpeakerProfile('speaker-hidden')).rejects.toThrow('Speaker not found');
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid conference UTC datetimes before writing site data', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.insert('site_data', {
      data_key: 'conference_start_datetime_utc',
      value: 'March 3, 2027',
    })).rejects.toThrow('must be a valid UTC ISO datetime');

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('preserves UTC ISO datetimes stored as site-data values', () => {
    const service = new DataService({}, undefined, undefined);
    const value = '2027-03-03T09:00:00.000Z';

    expect(service.normalizeValue(value, true)).toBe(value);
  });

  it('rejects conference end datetimes earlier than the configured start', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(async (_query, key) => key === 'conference_start_datetime_utc'
        ? [{ data_key: key, value: '2027-03-03T09:00:00.000Z' }]
        : []),
      $executeRawUnsafe: jest.fn(),
    };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.upsert('site_data', {
      data_key: 'conference_end_datetime_utc',
      value: '2027-03-02T09:00:00.000Z',
    }, 'data_key')).rejects.toThrow('must not precede');

    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('persists multiple site-data settings atomically and returns saved rows', async () => {
    const value = '2027-03-03T09:00:00.000Z';
    const transaction = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn(async (_query, dataKey) => [{
        id: 'start-row',
        data_key: dataKey,
        value,
      }]),
    };
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(async (callback) => callback(transaction)),
    };
    const service = new DataService(prisma, undefined, undefined);

    const result = await service.upsert('site_data', [
      { data_key: 'conference_start_datetime_utc', value, is_public: true },
      { data_key: 'conference_end_datetime_utc', value, is_public: true },
    ], 'data_key');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(transaction.$executeRawUnsafe.mock.calls[0]).toContain(value);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(value);
  });

  it('transitions order status only from an explicitly allowed prior state', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.transitionOrderStatus('order-1', ['PENDING', 'FAILED'], 'PAID')).resolves.toBe(true);

    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('status IN (?, ?)');
    expect(prisma.$executeRawUnsafe.mock.calls[0].slice(1)).toEqual(['PAID', 'order-1', 'PENDING', 'FAILED']);
  });

  it('claims checkout once for a pending registration', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.claimRegistrationCheckout('registration-1')).resolves.toBe(true);
    await expect(service.claimRegistrationCheckout('registration-1')).resolves.toBe(false);

    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("status = 'initiated'");
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("LOWER(payment_status) = 'pending'");
  });

  it('writes immutable payment audit events with parameterized values', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const service = new DataService(prisma, undefined, undefined);

    await service.recordPaymentAudit({
      orderId: 'order-1',
      actorUserId: 'admin-1',
      provider: 'razorpay',
      action: 'REFUND_INITIATED',
      previousStatus: 'PAID',
      newStatus: 'REFUND_PENDING',
      amountMinor: 1341000,
      currency: 'INR',
    });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO `payment_audit_logs`'),
      expect.any(String), 'order-1', 'admin-1', 'razorpay', 'REFUND_INITIATED', 'PAID', 'REFUND_PENDING', 1341000, 'INR', null,
    );
  });

  it('does not send duplicate paid-registration notifications', async () => {
    const transactionResults = [1, 1, 0];
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'registration-1', payment_status: 'paid' }]),
      $transaction: jest.fn(async (callback) => callback({
        $executeRawUnsafe: jest.fn(async () => transactionResults.shift()),
      })),
    };
    const service = new DataService(prisma, undefined, undefined);
    const notify = jest.spyOn(service, 'sendPaymentSuccessNotification').mockResolvedValue(null);
    const payload = { p_registration_id: 'registration-1', p_payment_status: 'paid' };

    await service.updateRegistrationPayment(payload);
    await service.updateRegistrationPayment(payload);

    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('marks a failed confirmation email retryable without changing payment state', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const service = new DataService(prisma, undefined, undefined);
    jest.spyOn(service, 'sendPaymentSuccessNotification').mockRejectedValue(new Error('email provider timeout'));

    await expect(service.deliverPaymentConfirmation('registration-1')).resolves.toEqual({ success: false, retryable: true });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("status = 'FAILED'");
    expect(prisma.$executeRawUnsafe.mock.calls[1][1]).toBe('email provider timeout');
  });

  it('prices each participant from the server-calculated plan price', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });

    const pricing = await service.computeRegistrationAmount('early-speaker', null, 3);

    expect(pricing.baseAmount).toBe(447);
    expect(pricing.taxAmount).toBe(22.35);
    expect(pricing.finalAmount).toBe(469.35);
  });

  it('locks accommodation capacity and stores an immutable order snapshot', async () => {
    const transaction = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{
          id: 'hotel-a',
          name: 'Conference Hotel',
          price_per_night: 80,
          currency: 'USD',
          minimum_nights: 1,
          maximum_nights: null,
          capacity: 3,
          allow_outside_conference_dates: true,
          is_active: 1,
        }])
        .mockResolvedValueOnce([{ booked: 2 }])
        .mockResolvedValueOnce([{ id: 'order-a', accommodation_option_id: 'hotel-a', accommodation_total: 160 }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new DataService(prisma, undefined, undefined);

    const order = await service.createOrderWithAccommodation({
      id: 'order-a',
      registration_id: 'registration-a',
      final_amount: 451.9,
      currency: 'USD',
    }, {
      optionId: 'hotel-a',
      checkIn: '2027-03-02',
      checkOut: '2027-03-04',
      expectedPricePerNight: 80,
    });

    expect(transaction.$queryRawUnsafe.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(transaction.$queryRawUnsafe.mock.calls[1][0]).toContain('`accommodation_check_in` < ?');
    expect(transaction.$queryRawUnsafe.mock.calls[1][0]).toContain('`accommodation_check_out` > ?');
    expect(transaction.$executeRawUnsafe.mock.calls[0][0]).toContain('INSERT INTO `orders`');
    expect(transaction.$executeRawUnsafe.mock.calls[0]).toContain('2027-03-02');
    expect(transaction.$executeRawUnsafe.mock.calls[0]).toContain(160);
    expect(order.accommodation_total).toBe(160);
  });

  it('rejects a room reservation when all rooms are already held for overlapping dates', async () => {
    const transaction = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{
          id: 'hotel-a',
          name: 'Conference Hotel',
          price_per_night: 80,
          currency: 'USD',
          minimum_nights: 1,
          maximum_nights: null,
          capacity: 2,
          allow_outside_conference_dates: true,
          is_active: 1,
        }])
        .mockResolvedValueOnce([{ booked: 2 }]),
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new DataService(prisma, undefined, undefined);

    await expect(service.createOrderWithAccommodation({}, {
      optionId: 'hotel-a',
      checkIn: '2027-03-02',
      checkOut: '2027-03-04',
      expectedPricePerNight: 80,
    })).rejects.toThrow('No rooms remain');
    expect(transaction.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects registration plans outside the configured date window', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'list').mockImplementation(async (_table, filters = {}) =>
      filters.data_key === 'important_dates'
        ? [{ value: JSON.stringify([{ id: 'early', endDate: '2026-08-20' }]) }]
        : [],
    );

    await expect(service.resolveRegistrationPlan('early-speaker')).rejects.toThrow('This registration period is closed');
  });

  it('rounds percentage coupons to cents instead of whole dollars', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'list').mockResolvedValue([{ code: 'SAVE7', discount_percent: 7, discount_amount: 0, max_uses: null }]);

    const coupon = await service.validateCoupon('SAVE7', 49);

    expect(coupon.discount_amount).toBe(3.43);
    expect(coupon.final_amount).toBe(45.57);
  });

  it('emails the exact order gateway currency and amount', async () => {
    const emailService = { send: jest.fn().mockResolvedValue({}) };
    const service = new DataService({}, emailService, undefined);
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{
        id: 'registration-a',
        email: 'buyer@example.test',
        payment_provider: 'razorpay',
        currency: 'USD',
        amount_usd: 156.45,
        gateway_response: { orderId: 'order-a' },
      }];
      if (table === 'orders') return [{ id: 'order-a', registration_id: 'registration-a', order_number: 'ORD-1', gateway_amount: 1341000, gateway_currency: 'INR' }];
      if (table === 'payments') return [{ provider_payment_id: 'pay-a' }];
      return [];
    });

    await service.sendPaymentSuccessNotification('registration-a', null);

    expect(emailService.send.mock.calls[0][0].html).toContain('INR 13410.00');
    expect(emailService.send.mock.calls[0][0].html).toContain('pay-a');
    expect(emailService.send.mock.calls[0][0].html).not.toContain('$156.45');
  });

  it('requires an exact paid order for receipt generation instead of picking the latest order', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{ id: 'registration-a', full_name: 'Customer A' }];
      if (table === 'orders') return [
        { id: 'old-paid-order', registration_id: 'registration-a', status: 'PAID' },
        { id: 'new-pending-order', registration_id: 'registration-a', status: 'PENDING' },
      ];
      return [];
    });

    await expect(service.generateReceipt({ registrationId: 'registration-a' })).rejects.toThrow('exact order id is required');
    await expect(service.generateReceipt({ registrationId: 'registration-a', orderId: 'new-pending-order' }))
      .rejects.toThrow('verified payment is required');
  });

  it('rejects an order receipt when its successful transaction amounts do not match', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{ id: 'registration-a', full_name: 'Customer A' }];
      if (table === 'orders') return [{
        id: 'order-a',
        registration_id: 'registration-a',
        order_number: 'ORD-A',
        provider: 'razorpay',
        provider_order_id: 'rp-order-a',
        status: 'PAID',
        final_amount: 149,
        currency: 'USD',
        gateway_amount: 1341000,
        gateway_currency: 'INR',
      }];
      if (table === 'payments') return [{
        order_id: 'order-a',
        provider: 'razorpay',
        provider_payment_id: 'pay-a',
        provider_order_id: 'rp-order-a',
        amount: 149,
        currency: 'USD',
        gateway_amount: 1340999,
        gateway_currency: 'INR',
        status: 'SUCCESS',
      }];
      return [];
    });

    await expect(service.generateReceipt({ registrationId: 'registration-a', orderId: 'order-a' }))
      .rejects.toThrow('Verified payment transaction is unavailable or inconsistent');
  });

  it('persists the validated quantity and matching total on registration', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });
    jest.spyOn(service, 'insert').mockImplementation(async (_table, payload) => payload);

    const registration = await service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      affiliation: 'Example Organization',
      country: 'India',
      plan_key: 'early-speaker',
      payment_provider: 'razorpay',
      quantity: 3,
    });

    expect(registration.quantity).toBe(3);
    expect(registration.amount_usd).toBe(469.35);
  });

  it('rejects registration without the required organization and country fields', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });
    jest.spyOn(service, 'insert').mockImplementation(async (_table, payload) => payload);

    await expect(service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      plan_key: 'early-speaker',
      payment_provider: 'razorpay',
    })).rejects.toThrow('Organization and country are required');
  });

  it('rejects invalid registration quantities', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'list').mockResolvedValue([]);

    await expect(service.computeRegistrationAmount('early-speaker', null, 1.5)).rejects.toThrow();
    await expect(service.computeRegistrationAmount('early-speaker', null, 101)).rejects.toThrow();
  });

  it('stores and returns registration intents through the database adapter', async () => {
    const record = { id: 'registration-1', email: 'test@example.com' };
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $queryRawUnsafe: jest.fn().mockResolvedValue([record]),
    };
    const service = new DataService(prisma, undefined);

    const created = await service.insert('registration_intents', {
      full_name: 'Test User',
      email: 'test@example.com',
      phone: '123',
      affiliation: 'Org',
      country: 'India',
      designation: 'Speaker',
      plan_key: 'early-speaker',
      plan_name: 'Early Speaker',
      amount_usd: 100,
      currency: 'USD',
      payment_provider: 'stripe',
      payment_status: 'pending',
      status: 'pending',
      notes: 'test',
    });

    expect(created).toEqual(record);

    const rows = await service.list('registration_intents', { email: 'test@example.com' });
    expect(rows).toEqual([record]);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
