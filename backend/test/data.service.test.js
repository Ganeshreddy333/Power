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
    const previousAdminNotificationEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
    const transactionResults = [1, 0];
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: 'registration-1', email: 'person@example.test', full_name: 'Person', plan_name: 'Speaker' }])
        .mockResolvedValue([{ id: 'registration-1', payment_status: 'paid' }]),
      $transaction: jest.fn(async (callback) => callback({
        $executeRawUnsafe: jest.fn(async () => transactionResults.shift()),
        $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'registration-1', email: 'person@example.test', full_name: 'Person', plan_name: 'Speaker' }]),
      })),
    };
    const service = new DataService(prisma, undefined, undefined);
    const notify = jest.spyOn(service, 'dispatchQueuedEmailBestEffort').mockResolvedValue(undefined);
    const payload = { p_registration_id: 'registration-1', p_payment_status: 'paid' };

    try {
      await service.updateRegistrationPayment(payload);
      await service.updateRegistrationPayment(payload);

      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify).toHaveBeenCalledWith('PAYMENT_CONFIRMED:registration-1', 'PAYMENT_CONFIRMED');
      expect(notify).toHaveBeenCalledWith('PAYMENT_CONFIRMED:registration-1:ADMIN', 'PAYMENT_CONFIRMED');
    } finally {
      if (previousAdminNotificationEmail === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdminNotificationEmail;
    }
  });

  it('marks a failed confirmation email retryable without changing payment state', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'notification-1',
        type: 'PAYMENT_CONFIRMED',
        recipient: 'person@example.test',
        recipient_role: 'USER',
        payload: JSON.stringify({ registrationId: 'registration-1' }),
        attempts: 1,
      }]),
    };
    const service = new DataService(prisma, undefined, undefined);
    jest.spyOn(service, 'sendPaymentSuccessNotification').mockRejectedValue(new Error('email provider timeout'));

    await expect(service.deliverEmailNotification('PAYMENT_CONFIRMED:registration-1')).resolves.toEqual({ success: false, retryable: true });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("'PERMANENT_FAILURE' ELSE 'FAILED'");
    expect(prisma.$executeRawUnsafe.mock.calls[1][1]).toBe('Error');
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
    const emailService = { sendPaymentConfirmation: jest.fn().mockResolvedValue({}) };
    const service = new DataService({}, emailService, undefined);
    jest.spyOn(service, 'generateReceipt').mockResolvedValue({
      receiptNumber: 'REC-1',
      pdfBase64: 'cGRm',
    });
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{
        id: 'registration-a',
        email: 'buyer@example.test',
        full_name: 'Test Buyer',
        payment_status: 'paid',
        payment_provider: 'razorpay',
        currency: 'USD',
        amount_usd: 156.45,
        gateway_response: { orderId: 'order-a' },
      }];
      if (table === 'orders') return [{
        id: 'order-a',
        registration_id: 'registration-a',
        order_number: 'ORD-1',
        access_token: 'access-token-a',
        status: 'PAID',
        gateway_amount: 1341000,
        gateway_currency: 'INR',
      }];
      if (table === 'payments') return [{ provider_payment_id: 'pay-a', status: 'SUCCESS' }];
      return [];
    });

    await service.sendPaymentSuccessNotification('registration-a', null);

    expect(emailService.sendPaymentConfirmation).toHaveBeenCalledWith(
      'buyer@example.test',
      expect.objectContaining({
        amount: 'INR 13410.00',
        paymentId: 'pay-a',
        receiptUrl: expect.stringContaining('payment=success&order=access-token-a'),
      }),
      [
        { filename: 'receipt-REC-1.pdf', content: 'cGRm' },
      ],
    );
    expect(emailService.sendPaymentConfirmation.mock.calls[0][1].amount).not.toContain('$156.45');
  });

  it('notifies the admin about a payment only from the persisted verified provider transaction', async () => {
    const emailService = { sendAdminEventNotification: jest.fn().mockResolvedValue({}) };
    const service = new DataService({}, emailService, undefined);
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{
        id: 'registration-a',
        email: 'buyer@example.test',
        full_name: 'Test Buyer',
        plan_name: 'Speaker',
        payment_status: 'paid',
        gateway_response: { orderId: 'order-a' },
      }];
      if (table === 'orders') return [{
        id: 'order-a',
        registration_id: 'registration-a',
        order_number: 'ORD-1',
        provider: 'stripe',
        provider_order_id: 'provider-order-1',
        status: 'PAID',
        quantity: 1,
        final_amount: 149,
        currency: 'USD',
        gateway_amount: 14900,
        gateway_currency: 'USD',
        accommodation_option_id: null,
      }];
      if (table === 'payments') return [{
        provider: 'stripe',
        provider_payment_id: 'payment-1',
        provider_order_id: 'provider-order-1',
        status: 'SUCCESS',
        amount: 149,
        currency: 'USD',
        gateway_amount: 14900,
        gateway_currency: 'USD',
        created_at: '2026-10-13T10:00:00.000Z',
      }];
      return [];
    });

    await service.sendPaymentAdminNotification('registration-a', 'admin@example.test');

    expect(emailService.sendAdminEventNotification).toHaveBeenCalledWith('admin@example.test', expect.objectContaining({
      eventType: 'PAYMENT_CONFIRMED',
      submittedAt: '2026-10-13T10:00:00.000Z',
      referenceId: 'ORD-1',
      fields: expect.objectContaining({
        'Authoritative order amount': 'USD 149.00',
        'Provider-confirmed charge': 'USD 149.00',
      }),
    }));

    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{
        id: 'registration-a', payment_status: 'paid', gateway_response: { orderId: 'order-a' },
      }];
      if (table === 'orders') return [{
        id: 'order-a', registration_id: 'registration-a', provider: 'stripe', provider_order_id: 'provider-order-1',
        status: 'PAID', final_amount: 149, currency: 'USD', gateway_amount: 14900, gateway_currency: 'USD',
      }];
      if (table === 'payments') return [{
        provider: 'stripe', provider_payment_id: 'payment-1', provider_order_id: 'provider-order-1',
        status: 'SUCCESS', amount: 150, currency: 'USD', gateway_amount: 14900, gateway_currency: 'USD',
      }];
      return [];
    });
    await expect(service.sendPaymentAdminNotification('registration-a', 'admin@example.test'))
      .rejects.toThrow('verified successful payment');
    expect(emailService.sendAdminEventNotification).toHaveBeenCalledTimes(1);
  });

  it('includes the persisted accommodation snapshot in the verified payment confirmation', async () => {
    const emailService = { sendPaymentConfirmation: jest.fn().mockResolvedValue({}) };
    const service = new DataService({}, emailService, undefined);
    jest.spyOn(service, 'generateReceipt').mockResolvedValue({ receiptNumber: 'REC-2', pdfBase64: 'cGRm' });
    jest.spyOn(service, 'list').mockImplementation(async (table) => {
      if (table === 'registration_intents') return [{
        id: 'registration-a', email: 'buyer@example.test', full_name: 'Test Buyer', payment_status: 'paid',
        payment_provider: 'stripe', currency: 'USD', gateway_response: { orderId: 'order-a' },
      }];
      if (table === 'orders') return [{
        id: 'order-a', registration_id: 'registration-a', order_number: 'ORD-2', status: 'PAID',
        access_token: 'access-token-a', gateway_amount: 30900, gateway_currency: 'USD',
        accommodation_option_id: 'room-a', accommodation_name: 'Solar Hotel',
        accommodation_check_in: '2027-03-02', accommodation_check_out: '2027-03-04',
        accommodation_nights: 2, accommodation_total: 160,
      }];
      if (table === 'payments') return [{ provider_payment_id: 'pay-a', status: 'SUCCESS' }];
      return [];
    });

    await service.sendPaymentSuccessNotification('registration-a', null);

    expect(emailService.sendPaymentConfirmation.mock.calls[0][1].accommodation).toEqual({
      name: 'Solar Hotel',
      checkIn: '2027-03-02',
      checkOut: '2027-03-04',
      nights: 2,
      total: 'USD 160.00',
    });
  });

  it('queues an abstract submission acknowledgment after saving the submission', async () => {
    const service = new DataService({}, {}, undefined);
    const persist = jest.spyOn(service, 'persistPublicRecordWithNotification').mockImplementation(async (_table, payload, createNotification) => {
      const record = { ...payload, id: 'submission-1' };
      expect(createNotification(record)).toMatchObject({
        type: 'ABSTRACT_SUBMISSION',
        dedupeKey: 'ABSTRACT_SUBMISSION:submission-1',
        recipient: 'ada@example.test',
        payload: { firstName: 'Ada', abstractTitle: 'Clean Energy Storage', submissionId: 'submission-1' },
        adminPayload: {
          eventType: 'ABSTRACT_SUBMISSION',
          referenceId: 'submission-1',
          fields: {
            Name: 'Ada Lovelace',
            Email: 'ada@example.test',
            'Abstract title': 'Clean Energy Storage',
          },
        },
      });
      return { id: 'submission-1' };
    });

    await expect(service.createPublicAbstractSubmission({
      full_name: 'Ada Lovelace',
      email: 'ADA@EXAMPLE.TEST',
      phone: '1234567890',
      abstract_title: 'Clean Energy Storage',
    })).resolves.toEqual({ id: 'submission-1' });

    expect(persist).toHaveBeenCalledWith('abstract_submissions', expect.objectContaining({
      full_name: 'Ada Lovelace', email: 'ada@example.test', abstract_title: 'Clean Energy Storage',
    }), expect.any(Function));
  });

  it('queues a brochure delivery email for brochure download requests only', async () => {
    const previousFrontendUrl = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = 'https://conference.example.test';
    const service = new DataService({}, {}, undefined);
    const persist = jest.spyOn(service, 'persistPublicRecordWithNotification').mockImplementation(async (_table, payload, createNotification) => {
      const record = { ...payload, id: 'contact-1' };
      expect(createNotification(record)).toMatchObject({
        type: 'BROCHURE_REQUEST',
        dedupeKey: 'BROCHURE_REQUEST:contact-1',
        recipient: 'grace@example.test',
        payload: { firstName: 'Grace', brochureUrl: 'https://conference.example.test/brochure-2027.pdf' },
      });
      return { id: 'contact-1' };
    });

    try {
      await service.createPublicContactMessage({
        name: 'Grace Hopper',
        email: 'grace@example.test',
        subject: 'Brochure download request',
        message: 'Please send me the brochure.',
      });
    } finally {
      if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = previousFrontendUrl;
    }

    expect(persist).toHaveBeenCalledWith('contact_messages', expect.any(Object), expect.any(Function));
  });

  it('uses the persisted address for contact and registration acknowledgements', async () => {
    const service = new DataService({}, {}, undefined);
    const persisted = [];
    jest.spyOn(service, 'persistPublicRecordWithNotification').mockImplementation(async (table, payload, createNotification) => {
      const record = { ...payload, id: `${table}-1` };
      persisted.push(createNotification(record));
      return record;
    });

    await service.createPublicContactMessage({
      name: 'Grace Hopper',
      email: 'GRACE@EXAMPLE.TEST',
      subject: 'Conference question',
      message: 'Please share the schedule.',
    });
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });
    await service.createPublicRegistration({
      full_name: 'Ada Lovelace',
      email: 'ADA@EXAMPLE.TEST',
      affiliation: 'Analytical Engine Society',
      country: 'UK',
      plan_key: 'early-speaker',
      payment_provider: 'stripe',
    });

    expect(persisted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'CONTACT_ACKNOWLEDGEMENT',
        recipient: 'grace@example.test',
        payload: expect.objectContaining({ name: 'Grace Hopper', subject: 'Conference question' }),
      }),
      expect.objectContaining({
        type: 'REGISTRATION_RECEIVED',
        recipient: 'ada@example.test',
        payload: expect.objectContaining({ firstName: 'Ada', planName: 'Speaker' }),
      }),
    ]));
  });

  it('persists a public record and its notification event in one database transaction', async () => {
    const transaction = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'contact-1', name: 'Grace Hopper', email: 'grace@example.test', subject: 'Question',
      }]),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new DataService(prisma, {}, undefined);
    const dispatch = jest.spyOn(service, 'dispatchQueuedEmailBestEffort').mockResolvedValue(undefined);
    const previousAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
    try {
      const saved = await service.persistPublicRecordWithNotification(
        'contact_messages',
        { id: 'contact-1', name: 'Grace Hopper', email: 'grace@example.test', subject: 'Question', message: 'Hello' },
        (record) => ({
          type: 'CONTACT_ACKNOWLEDGEMENT',
          dedupeKey: `CONTACT_ACKNOWLEDGEMENT:${record.id}`,
          recipient: record.email,
          payload: { name: record.name, subject: record.subject },
          adminPayload: {
            eventType: 'CONTACT_ACKNOWLEDGEMENT',
            submittedAt: '2026-10-13T10:00:00.000Z',
            referenceId: String(record.id),
            fields: { Name: String(record.name), Email: String(record.email), Message: 'Hello' },
          },
        }),
      );

      expect(saved.id).toBe('contact-1');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(transaction.$executeRawUnsafe).toHaveBeenCalledTimes(3);
      expect(transaction.$executeRawUnsafe.mock.calls[1][0]).toContain('INSERT INTO `email_notifications`');
      expect(transaction.$executeRawUnsafe.mock.calls[1]).toContain('grace@example.test');
      expect(transaction.$executeRawUnsafe.mock.calls[2]).toContain('admin@example.test');
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      if (previousAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdmin;
    }
  });

  it('records email provider failures for retry instead of reporting a successful delivery', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'email-1',
        type: 'ABSTRACT_SUBMISSION',
        recipient: 'ada@example.test',
        payload: JSON.stringify({ firstName: 'Ada', abstractTitle: 'Storage', submissionId: 'submission-1' }),
        attempts: 1,
      }]),
    };
    const emailService = { sendAbstractSubmissionConfirmation: jest.fn().mockRejectedValue(new Error('SMTP unavailable')) };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('ABSTRACT_SUBMISSION:submission-1'))
      .resolves.toEqual({ success: false, retryable: true });

    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain("status` = 'SENDING'");
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("'PERMANENT_FAILURE' ELSE 'FAILED'");
    expect(prisma.$executeRawUnsafe.mock.calls[1][1]).toBe('Error');
  });

  it('sends a queued abstract confirmation and marks its outbox row sent', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'email-1',
        type: 'ABSTRACT_SUBMISSION',
        recipient: 'ada@example.test',
        payload: JSON.stringify({
          firstName: 'Ada',
          abstractTitle: 'Clean Energy Storage',
          submissionId: 'submission-1',
        }),
        attempts: 1,
      }]),
    };
    const emailService = { sendAbstractSubmissionConfirmation: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('ABSTRACT_SUBMISSION:submission-1'))
      .resolves.toEqual({ success: true, sent: true });

    expect(emailService.sendAbstractSubmissionConfirmation).toHaveBeenCalledWith(
      'ada@example.test',
      'Ada',
      'Clean Energy Storage',
      'submission-1',
    );
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("status` = 'SENT'");
  });

  it.each([
    ['CONTACT_ACKNOWLEDGEMENT', 'sendContactAcknowledgement', { name: 'Ada', subject: 'Question' }],
    ['REGISTRATION_RECEIVED', 'sendRegistrationReceived', { firstName: 'Ada', registrationId: 'reg-1', planName: 'Speaker' }],
    ['ABSTRACT_DECISION', 'sendAbstractDecision', { firstName: 'Ada', abstractTitle: 'Storage', status: 'approved' }],
    ['PAYMENT_FAILED', 'sendPaymentFailure', { firstName: 'Ada', orderNumber: 'ORD-1' }],
    ['PAYMENT_CANCELLED', 'sendPaymentCancelled', { firstName: 'Ada', orderNumber: 'ORD-1' }],
    ['REFUND_CONFIRMED', 'sendRefundConfirmation', { firstName: 'Ada', orderNumber: 'ORD-1', amount: '10.00', currency: 'USD', partial: true }],
  ])('dispatches persisted %s events through EmailService', async (type, method, payload) => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'email-1',
        type,
        recipient: 'ada@example.test',
        payload: JSON.stringify(payload),
        attempts: 1,
      }]),
    };
    const emailService = { [method]: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }) };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification(`notification:${type}`))
      .resolves.toEqual({ success: true, sent: true });
    expect(emailService[method]).toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe.mock.calls.at(-1)[0]).toContain("status` = 'SENT'");
  });

  it('marks a missing notification recipient permanently failed without calling SMTP', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'email-1', type: 'ABSTRACT_SUBMISSION', recipient: '', payload: '{}', attempts: 1,
      }]),
    };
    const emailService = { sendAbstractSubmissionConfirmation: jest.fn() };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('missing-recipient'))
      .resolves.toEqual({ success: false, retryable: false });
    expect(emailService.sendAbstractSubmissionConfirmation).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("status` = 'PERMANENT_FAILURE'");
  });

  it('does not send a notification when its outbox event is already claimed or delivered', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn(),
    };
    const emailService = { sendAbstractSubmissionConfirmation: jest.fn() };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('ABSTRACT_SUBMISSION:submission-1'))
      .resolves.toEqual({ skipped: true });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(emailService.sendAbstractSubmissionConfirmation).not.toHaveBeenCalled();
  });

  it('atomically records a payment failure transition and its notification event', async () => {
    const transaction = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'order-1',
        order_number: 'ORD-1',
        full_name: 'Ada Lovelace',
        email: 'ada@example.test',
      }]),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new DataService(prisma, {}, undefined);
    const dispatch = jest.spyOn(service, 'dispatchQueuedEmailBestEffort').mockResolvedValue(undefined);

    await expect(service.transitionOrderWithEmailNotification(
      'order-1', ['PENDING'], 'FAILED', 'PAYMENT_FAILED', 'provider-event-1',
    )).resolves.toBe(true);

    expect(transaction.$executeRawUnsafe.mock.calls[0][0]).toContain('UPDATE orders SET status = ?');
    expect(transaction.$executeRawUnsafe.mock.calls[1][0]).toContain('INSERT INTO `email_notifications`');
    expect(transaction.$executeRawUnsafe.mock.calls[1]).toContain('ada@example.test');
    expect(transaction.$executeRawUnsafe.mock.calls[1]).toContain('PAYMENT_FAILED:order-1:provider-event-1');
    expect(dispatch).toHaveBeenCalledWith('PAYMENT_FAILED:order-1:provider-event-1', 'PAYMENT_FAILED');
  });

  it('recovers missing email outbox events for persisted successful refunds', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        provider: 'stripe',
        provider_refund_id: 'refund-1',
        amount_minor: 5000,
        currency: 'USD',
        order_id: 'order-1',
        order_number: 'ORD-1',
        gateway_amount: 14900,
        full_name: 'Ada Lovelace',
        email: 'ada@example.test',
        total_refunded_minor: 5000,
      }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    const service = new DataService(prisma, {}, undefined);

    await expect(service.recoverSuccessfulRefundNotifications(20)).resolves.toBe(1);

    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain("rf.status = 'SUCCEEDED'");
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('INSERT INTO `email_notifications`');
    expect(prisma.$executeRawUnsafe.mock.calls[0]).toContain('REFUND_CONFIRMED:stripe:refund-1');
    expect(JSON.parse(prisma.$executeRawUnsafe.mock.calls[0][6])).toEqual({
      firstName: 'Ada',
      orderNumber: 'ORD-1',
      amount: '50.00',
      currency: 'USD',
      partial: true,
    });
  });

  it('recovers missing abstract notifications with independent admin delivery', async () => {
    const previousAdminNotificationEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'abstract-1',
        full_name: 'Ada Lovelace',
        email: 'ada@example.test',
        phone: '1234567890',
        affiliation: 'Analytical Engine Institute',
        country: 'UK',
        session: 'Energy storage',
        abstract_title: 'Clean Energy Storage',
        abstract_text: 'Abstract content',
        presentation_type: 'Oral',
        keywords: 'storage, energy',
        supporting_text: '',
        drive_url: '',
        website_url: '',
        status: 'pending',
        created_at: '2026-10-13T10:00:00.000Z',
      }]),
    };
    const service = new DataService(prisma, undefined, undefined);
    const insert = jest.spyOn(service, 'insertEmailNotification').mockResolvedValue(undefined);

    try {
      await expect(service.recoverMissingAbstractNotifications(20)).resolves.toBe(1);

      expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain("CONCAT('ABSTRACT_SUBMISSION:', s.id, ':ADMIN')");
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert.mock.calls[0][0]).toMatchObject({
        dedupeKey: 'ABSTRACT_SUBMISSION:abstract-1:ADMIN',
        recipientRole: 'ADMIN',
        recipient: 'admin@example.test',
        payload: {
          eventType: 'ABSTRACT_SUBMISSION',
          referenceId: 'abstract-1',
          fields: {
            Name: 'Ada Lovelace',
            Email: 'ada@example.test',
            'Abstract title': 'Clean Energy Storage',
          },
        },
      });
    } finally {
      if (previousAdminNotificationEmail === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdminNotificationEmail;
    }
  });

  it('queues an abstract decision only when the persisted review state changes', async () => {
    const existing = {
      id: 'abstract-1', full_name: 'Ada Lovelace', email: 'ada@example.test',
      abstract_title: 'Storage', status: 'pending',
    };
    const transaction = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([{ ...existing, status: 'approved' }]),
    };
    const prisma = { $transaction: jest.fn(async (callback) => callback(transaction)) };
    const service = new DataService(prisma, {}, undefined);
    const dispatch = jest.spyOn(service, 'dispatchQueuedEmailBestEffort').mockResolvedValue(undefined);

    const updated = await service.updateAbstractSubmission('abstract-1', { status: 'approved' });

    expect(updated.status).toBe('approved');
    expect(transaction.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(transaction.$executeRawUnsafe.mock.calls[1][0]).toContain('INSERT INTO `email_notifications`');
    expect(transaction.$executeRawUnsafe.mock.calls[1]).toContain('ABSTRACT_DECISION');
    expect(transaction.$executeRawUnsafe.mock.calls[1]).toContain('ada@example.test');
    expect(transaction.$executeRawUnsafe.mock.calls[2][0]).toContain('INSERT INTO `email_notifications`');
    expect(transaction.$executeRawUnsafe.mock.calls[2]).toContain('ABSTRACT_DECISION');
    expect(dispatch).toHaveBeenCalledWith(expect.stringMatching(/^ABSTRACT_DECISION:abstract-1:/), 'ABSTRACT_DECISION');
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
    jest.spyOn(service, 'persistPublicRecordWithNotification').mockImplementation(async (_table, payload) => payload);

    const registration = await service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      affiliation: 'Example Organization',
      country: 'India',
      plan_key: 'early-speaker',
      payment_provider: 'razorpay',
      quantity: 3,
    });

    expect(registration.quantity).toBe(3);
    expect(registration.amount_usd).toBe(469.35);
  });

  it('rejects registration phone and WhatsApp numbers that are not exactly 10 digits', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });
    jest.spyOn(service, 'insert').mockImplementation(async (_table, payload) => payload);

    await expect(service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      phone: '12345',
      whatsapp: '1234567890',
      affiliation: 'Example Organization',
      country: 'India',
      plan_key: 'early-speaker',
      payment_provider: 'razorpay',
    })).rejects.toThrow('Phone and WhatsApp numbers must contain exactly 10 digits');

    await expect(service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      whatsapp: '12345678901',
      affiliation: 'Example Organization',
      country: 'India',
      plan_key: 'early-speaker',
      payment_provider: 'razorpay',
    })).rejects.toThrow('Phone and WhatsApp numbers must contain exactly 10 digits');
  });

  it('preserves optional registration phone numbers for existing checkout clients', async () => {
    const service = new DataService({}, undefined, undefined);
    jest.spyOn(service, 'resolveRegistrationPlan').mockResolvedValue({ amount: 149, label: 'Speaker' });
    jest.spyOn(service, 'persistPublicRecordWithNotification').mockImplementation(async (_table, payload) => payload);

    const registration = await service.createPublicRegistration({
      full_name: 'Test User',
      email: 'test@example.com',
      phone: 'Not provided',
      affiliation: 'Example Organization',
      country: 'India',
      plan_key: 'early-speaker',
      payment_provider: 'paypal',
    });

    expect(registration.phone).toBe('Not provided');
  });

  it('rejects contact messages and abstract submissions without a 10-digit phone number', async () => {
    const service = new DataService({}, {}, undefined);
    jest.spyOn(service, 'insert').mockResolvedValue({ id: 'submission-1' });

    await expect(service.createPublicContactMessage({
      name: 'Grace Hopper',
      email: 'grace@example.test',
      phone: '12345',
      subject: 'Question',
      message: 'Please contact me.',
    })).rejects.toThrow('A valid 10-digit phone number is required');

    await expect(service.createPublicAbstractSubmission({
      full_name: 'Ada Lovelace',
      email: 'ada@example.test',
      phone: '12345',
      abstract_title: 'Clean Energy Storage',
    })).rejects.toThrow('A valid 10-digit phone number is required');
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

  it('queues separate user and admin notifications with stable recipient-specific dedupe keys', () => {
    const previousAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
    try {
      const service = new DataService({}, undefined, undefined);
      const user = {
        type: 'CONTACT_ACKNOWLEDGEMENT',
        dedupeKey: 'CONTACT_ACKNOWLEDGEMENT:contact-1',
        recipient: 'user@example.test',
        payload: { name: 'User' },
      };
      const adminDetails = {
        eventType: 'CONTACT_ACKNOWLEDGEMENT',
        submittedAt: '2026-10-13T10:00:00.000Z',
        referenceId: 'contact-1',
        fields: { Name: 'User', Message: 'Help' },
      };

      const first = service.notificationPair(user, adminDetails);
      const duplicate = service.notificationPair(user, adminDetails);

      expect(first.map((notification) => [notification.recipientRole || 'USER', notification.dedupeKey])).toEqual([
        ['USER', 'CONTACT_ACKNOWLEDGEMENT:contact-1'],
        ['ADMIN', 'CONTACT_ACKNOWLEDGEMENT:contact-1:ADMIN'],
      ]);
      expect(duplicate.map((notification) => notification.dedupeKey)).toEqual(first.map((notification) => notification.dedupeKey));
      expect(first[1].recipient).toBe('admin@example.test');
    } finally {
      if (previousAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdmin;
    }
  });

  it('still queues the admin copy when the persisted user recipient is invalid', () => {
    const previousAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
    process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
    try {
      const service = new DataService({}, undefined, undefined);
      const paired = service.notificationPair({
        type: 'PAYMENT_FAILED',
        dedupeKey: 'PAYMENT_FAILED:order-1',
        recipient: '',
        payload: {},
      }, {
        eventType: 'PAYMENT_FAILED',
        submittedAt: '2026-10-13T10:00:00.000Z',
        referenceId: 'order-1',
        fields: { Status: 'FAILED' },
      });

      expect(paired).toHaveLength(2);
      expect(paired[0].recipient).toBe('');
      expect(paired[1].recipientRole).toBe('ADMIN');
    } finally {
      if (previousAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdmin;
    }
  });

  it('retains an admin notification until ADMIN_NOTIFICATION_EMAIL is configured', async () => {
    const previousAdmin = process.env.ADMIN_NOTIFICATION_EMAIL;
    delete process.env.ADMIN_NOTIFICATION_EMAIL;
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const service = new DataService(prisma, undefined, undefined);
    const paired = service.notificationPair({
      type: 'CONTACT_ACKNOWLEDGEMENT',
      dedupeKey: 'CONTACT_ACKNOWLEDGEMENT:contact-2',
      recipient: 'user@example.test',
      payload: {},
    }, {
      eventType: 'CONTACT_ACKNOWLEDGEMENT',
      submittedAt: '2026-10-13T10:00:00.000Z',
      referenceId: 'contact-2',
      fields: { Name: 'User' },
    });

    try {
      await service.insertEmailNotification(paired[1]);
      expect(prisma.$executeRawUnsafe.mock.calls[0][7]).toBe('FAILED');
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('DATE_ADD(NOW(3), INTERVAL 5 MINUTE)');
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).not.toContain("IF(? = 'FAILED'");
      expect(prisma.$executeRawUnsafe.mock.calls[0]).toHaveLength(9);
      expect(prisma.$executeRawUnsafe.mock.calls[0]).toContain('ADMIN_NOTIFICATION_EMAIL_UNAVAILABLE');

      process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@example.test';
      await service.retryFailedEmailNotifications();

      expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("`recipient_role` = 'ADMIN'");
      expect(prisma.$executeRawUnsafe.mock.calls[1]).toContain('admin@example.test');
    } finally {
      if (previousAdmin === undefined) delete process.env.ADMIN_NOTIFICATION_EMAIL;
      else process.env.ADMIN_NOTIFICATION_EMAIL = previousAdmin;
    }
  });

  it('does not compare bound status strings with SQL literals when queuing email', async () => {
    const prisma = { $executeRawUnsafe: jest.fn().mockResolvedValue(1) };
    const service = new DataService(prisma, undefined, undefined);

    await service.insertEmailNotification({
      type: 'CONTACT_ACKNOWLEDGEMENT',
      dedupeKey: 'CONTACT_ACKNOWLEDGEMENT:contact-collation',
      recipient: 'user@example.test',
      payload: {},
    });

    const [query] = prisma.$executeRawUnsafe.mock.calls[0];
    expect(query).toContain('NOW(3))');
    expect(query).not.toContain("IF(? = 'FAILED'");
    expect(prisma.$executeRawUnsafe.mock.calls[0]).toHaveLength(9);
  });

  it('retries a failed user delivery independently from an already deliverable admin copy', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn(async (_query, key) => [{
        id: key,
        type: 'BROCHURE_REQUEST',
        recipient: key.endsWith(':ADMIN') ? 'admin@example.test' : 'user@example.test',
        recipient_role: key.endsWith(':ADMIN') ? 'ADMIN' : 'USER',
        payload: JSON.stringify(key.endsWith(':ADMIN')
          ? { eventType: 'BROCHURE_REQUEST', submittedAt: '2026-10-13T10:00:00.000Z', referenceId: 'contact-1', fields: { Name: 'Person' } }
          : { firstName: 'Person', brochureUrl: 'https://example.test/brochure.pdf' }),
        attempts: 1,
      }]),
    };
    const emailService = {
      sendBrochureRequestConfirmation: jest.fn().mockRejectedValue(new Error('temporary SMTP failure')),
      sendAdminEventNotification: jest.fn().mockResolvedValue({ messageId: 'admin-message' }),
    };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('BROCHURE_REQUEST:contact-1'))
      .resolves.toEqual({ success: false, retryable: true });
    await expect(service.deliverEmailNotification('BROCHURE_REQUEST:contact-1:ADMIN'))
      .resolves.toEqual({ success: true, sent: true });

    expect(emailService.sendBrochureRequestConfirmation).toHaveBeenCalledTimes(1);
    expect(emailService.sendAdminEventNotification).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("ELSE 'FAILED'");
    expect(prisma.$executeRawUnsafe.mock.calls[3][0]).toContain("SET `status` = 'SENT'");
  });

  it('marks a missing persisted recipient permanently failed without calling SMTP', async () => {
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: 'notification-1',
        type: 'CONTACT_ACKNOWLEDGEMENT',
        recipient: '',
        recipient_role: 'USER',
        payload: '{}',
        attempts: 1,
      }]),
    };
    const emailService = { sendContactAcknowledgement: jest.fn() };
    const service = new DataService(prisma, emailService, undefined);

    await expect(service.deliverEmailNotification('CONTACT_ACKNOWLEDGEMENT:contact-1'))
      .resolves.toEqual({ success: false, retryable: false });
    expect(prisma.$executeRawUnsafe.mock.calls[1][0]).toContain("'PERMANENT_FAILURE'");
    expect(emailService.sendContactAcknowledgement).not.toHaveBeenCalled();
  });
});
