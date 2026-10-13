jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

const { EmailService } = require('../src/email/email.service');
const { createTransport } = require('nodemailer');

describe('EmailService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not report skipped delivery as success when SMTP configuration is missing', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new EmailService(config);

    await expect(service.send({
      to: 'attendee@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    })).rejects.toThrow('configure SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM');
  });

  it('sends through the configured SMTP transport with attachments and Reply-To', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1' });
    createTransport.mockReturnValue({ sendMail });
    const values = {
      SMTP_HOST: 'smtp.hostinger.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'conference@example.test',
      SMTP_PASS: 'smtp-password',
      SMTP_FROM: 'conference@example.test',
    };
    const service = new EmailService({ get: (key) => values[key] });

    await expect(service.send({
      to: 'attendee@example.test',
      subject: 'Payment confirmed',
      html: '<p>Confirmed</p>',
      replyTo: 'support@example.test',
      attachments: [{ filename: 'receipt.pdf', content: 'cGRm' }],
    })).resolves.toEqual({ messageId: 'smtp-1' });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: { user: 'conference@example.test', pass: 'smtp-password' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'conference@example.test',
      to: 'attendee@example.test',
      subject: 'Payment confirmed',
      html: '<p>Confirmed</p>',
      replyTo: 'support@example.test',
      attachments: [{ filename: 'receipt.pdf', content: 'cGRm', encoding: 'base64' }],
    });
  });

  it('rejects invalid SMTP port and secure-mode configuration without creating a transport', async () => {
    const values = {
      SMTP_HOST: 'smtp.hostinger.com',
      SMTP_PORT: '70000',
      SMTP_SECURE: 'sometimes',
      SMTP_USER: 'conference@example.test',
      SMTP_PASS: 'smtp-password',
      SMTP_FROM: 'conference@example.test',
    };
    const service = new EmailService({ get: (key) => values[key] });

    await expect(service.send({
      to: 'attendee@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    })).rejects.toThrow('SMTP_PORT or SMTP_SECURE is invalid');
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('propagates SMTP delivery errors for the notification outbox to retry', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP connection failed'));
    createTransport.mockReturnValue({ sendMail });
    const values = {
      SMTP_HOST: 'smtp.hostinger.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'conference@example.test',
      SMTP_PASS: 'smtp-password',
      SMTP_FROM: 'conference@example.test',
    };
    const service = new EmailService({ get: (key) => values[key] });

    await expect(service.send({
      to: 'attendee@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    })).rejects.toThrow('SMTP connection failed');
  });

  it('escapes user-controlled values in the abstract submission confirmation', async () => {
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) });
    const send = jest.spyOn(service, 'send').mockResolvedValue({});

    await service.sendAbstractSubmissionConfirmation(
      'attendee@example.test',
      '<Ada>',
      'Clean <script>alert(1)</script> & Storage',
      'submission-"1"',
    );

    expect(send.mock.calls[0][0].html).toContain('&lt;Ada&gt;');
    expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Storage');
    expect(send.mock.calls[0][0].html).toContain('submission-&quot;1&quot;');
  });

  it('renders the brochure download link in the request confirmation', async () => {
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) });
    const send = jest.spyOn(service, 'send').mockResolvedValue({});

    await service.sendBrochureRequestConfirmation(
      'attendee@example.test',
      'Grace',
      'https://conference.example.test/brochure-2027.pdf',
    );

    expect(send.mock.calls[0][0].subject).toBe('Your Conference Brochure');
    expect(send.mock.calls[0][0].html).toContain('href="https://conference.example.test/brochure-2027.pdf"');
  });

  it.each([
    ['contact acknowledgement', (service) => service.sendContactAcknowledgement('person@example.test', '<A>', 'Help & support'), 'Thank you, &lt;A&gt;.'],
    ['registration receipt', (service) => service.sendRegistrationReceived('person@example.test', 'Ada', 'reg-1', 'Speaker'), 'Payment is not confirmed'],
    ['abstract decision', (service) => service.sendAbstractDecision('person@example.test', 'Ada', '<Storage>', 'approved'), '&lt;Storage&gt;'],
    ['payment failure', (service) => service.sendPaymentFailure('person@example.test', 'Ada', 'ORD-1'), 'not marked as paid'],
    ['checkout cancellation', (service) => service.sendPaymentCancelled('person@example.test', 'Ada', 'ORD-1'), 'cancelled before payment was confirmed'],
    ['refund confirmation', (service) => service.sendRefundConfirmation('person@example.test', 'Ada', 'ORD-1', '12.00', 'USD', true), 'partial refund'],
  ])('renders a safe text and HTML version for %s', async (_event, invoke, expectedHtml) => {
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) });
    const send = jest.spyOn(service, 'send').mockResolvedValue({});

    await invoke(service);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].html).toContain(expectedHtml);
    expect(send.mock.calls[0][0].text).toBeTruthy();
  });

  it('escapes accommodation and payment confirmation values and preserves the receipt attachment', async () => {
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) });
    const send = jest.spyOn(service, 'send').mockResolvedValue({});

    await service.sendPaymentConfirmation('person@example.test', {
      firstName: '<Ada>',
      registrationId: 'reg-1',
      acknowledgementNumber: 'ACK-1',
      receiptNumber: 'REC-1',
      provider: 'Stripe',
      amount: 'USD 149.00',
      accommodation: {
        name: '<Hotel>',
        checkIn: '2027-03-02',
        checkOut: '2027-03-04',
        nights: 2,
        total: 'USD 160.00',
      },
    }, [{ filename: 'receipt.pdf', content: 'cGRm' }]);

    expect(send.mock.calls[0][0].html).toContain('&lt;Hotel&gt;');
    expect(send.mock.calls[0][0].html).toContain('&lt;Ada&gt;');
    expect(send.mock.calls[0][0].text).toContain('Accommodation: <Hotel>');
    expect(send.mock.calls[0][0].attachments).toEqual([{ filename: 'receipt.pdf', content: 'cGRm' }]);
  });

  it.each([
    ['BROCHURE_REQUEST', 'Brochure requested'],
    ['ABSTRACT_SUBMISSION', 'Abstract submitted'],
    ['ABSTRACT_DECISION', 'Abstract decision updated'],
    ['REGISTRATION_RECEIVED', 'Registration received'],
    ['PAYMENT_CONFIRMED', 'Payment confirmed'],
    ['PAYMENT_FAILED', 'Payment failed'],
    ['PAYMENT_CANCELLED', 'Payment checkout cancelled'],
    ['REFUND_CONFIRMED', 'Refund confirmed'],
    ['CONTACT_ACKNOWLEDGEMENT', 'Contact enquiry received'],
  ])('renders a safe admin notification for %s', async (eventType, subject) => {
    const service = new EmailService({ get: jest.fn().mockReturnValue(undefined) });
    const send = jest.spyOn(service, 'send').mockResolvedValue({});

    await service.sendAdminEventNotification('admin@example.test', {
      eventType,
      submittedAt: '2026-10-13T10:00:00.000Z',
      referenceId: 'record-123',
      fields: {
        Name: '<script>alert(1)</script>',
        Email: 'user@example.test',
      },
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe('admin@example.test');
    expect(send.mock.calls[0][0].subject).toContain(subject);
    expect(send.mock.calls[0][0].html).toContain(eventType);
    expect(send.mock.calls[0][0].html).toContain('2026-10-13T10:00:00.000Z');
    expect(send.mock.calls[0][0].html).toContain('record-123');
    expect(send.mock.calls[0][0].html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(send.mock.calls[0][0].html).not.toContain('<script>');
    expect(send.mock.calls[0][0].text).toContain('Name: <script>alert(1)</script>');
  });
});
