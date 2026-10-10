const { EmailService } = require('../src/email/email.service');

describe('EmailService', () => {
  it('does not report skipped delivery as success when the Resend API key is missing', async () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new EmailService(config);

    await expect(service.send({
      to: 'attendee@example.test',
      subject: 'Test',
      html: '<p>Test</p>',
    })).rejects.toThrow('RESEND_API_KEY is not configured');
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
});
