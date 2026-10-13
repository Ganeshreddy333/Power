import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>;
}

export interface PaymentConfirmationEmail {
  firstName: string;
  registrationId: string;
  acknowledgementNumber: string;
  receiptNumber: string;
  provider: string;
  amount: string;
  orderNumber?: string;
  paymentId?: string;
  receiptUrl?: string | null;
  accommodation?: {
    name: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    total: string;
  } | null;
}

export interface AdminNotificationDetails {
  eventType: string;
  submittedAt: string;
  referenceId: string;
  fields: Record<string, string>;
}

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character] as string);

export const isEmailAddress = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null;
  private transportConfigError: string | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const rawPort = this.configService.get<string | number>('SMTP_PORT');
    const port = Number(rawPort);
    const rawSecure = this.configService.get<string | boolean>('SMTP_SECURE');
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const password = this.configService.get<string>('SMTP_PASS');
    const from = this.configService.get<string>('SMTP_FROM')?.trim();
    const missing = [
      !host && 'SMTP_HOST',
      !rawPort && 'SMTP_PORT',
      rawSecure === undefined && 'SMTP_SECURE',
      !user && 'SMTP_USER',
      !password && 'SMTP_PASS',
      !from && 'SMTP_FROM',
    ].filter(Boolean);

    if (!host || !rawPort || rawSecure === undefined || !user || !password || !from) {
      this.transportConfigError = `Email delivery is unavailable: configure ${missing.join(', ')}`;
      this.transporter = null;
      return;
    }

    const secure = rawSecure === true || rawSecure === 'true';
    const secureValueIsValid = typeof rawSecure === 'boolean' || rawSecure === 'true' || rawSecure === 'false';
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !secureValueIsValid ||
        (port === 465 && !secure) || ([25, 587, 2525].includes(port) && secure)) {
      this.transportConfigError = 'Email delivery is unavailable: SMTP_PORT or SMTP_SECURE is invalid or incompatible';
      this.transporter = null;
      return;
    }
    if (!isEmailAddress(from) || /[\r\n]/.test(host) || /[\r\n]/.test(user)) {
      this.transportConfigError = 'Email delivery is unavailable: SMTP_HOST, SMTP_USER, or SMTP_FROM is invalid';
      this.transporter = null;
      return;
    }

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });
  }

  async send(options: EmailOptions): Promise<any> {
    try {
      if (!this.transporter) {
        throw new Error(this.transportConfigError || 'Email delivery is unavailable: SMTP transport is not configured');
      }
      const recipients = Array.isArray(options.to) ? options.to : [options.to];
      if (!recipients.length || recipients.some((recipient) => !isEmailAddress(recipient))) {
        throw new Error('Email delivery is unavailable: recipient email address is invalid');
      }

      const result = await this.transporter.sendMail({
        from: this.configService.get<string>('SMTP_FROM')?.trim(),
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
        ...(options.replyTo ? { replyTo: options.replyTo } : {}),
        ...(options.attachments?.length ? {
          attachments: options.attachments.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content,
            encoding: 'base64',
          })),
        } : {}),
      });
      this.logger.log(JSON.stringify({ event: 'email.smtp.accepted', messageId: result.messageId }));
      return result;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'UNKNOWN';
      this.logger.error(JSON.stringify({ event: 'email.smtp.failed', code }));
      throw error;
    }
  }

  async sendRegistrationConfirmation(email: string, firstName: string, confirmationLink: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Confirm Your Conference Registration',
      content: `<h1>Welcome, ${escapeHtml(firstName)}!</h1><p>Please confirm your email address to complete your conference registration.</p><p><a href="${escapeHtml(confirmationLink)}">Confirm your email</a></p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Welcome, ${firstName}!\n\nPlease confirm your email address to complete your conference registration:\n${confirmationLink}\n\nIf you did not request this, you can ignore this email.`,
    });
  }

  async sendAbstractSubmissionConfirmation(email: string, firstName: string, abstractTitle: string, submissionId: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Abstract Submission Received',
      content: `<h1>Thank you, ${escapeHtml(firstName)}!</h1><p>We have received your abstract submission. This confirms receipt only; it is not an acceptance notice.</p><p><strong>Title:</strong> ${escapeHtml(abstractTitle)}</p><p><strong>Submission ID:</strong> ${escapeHtml(submissionId)}</p>`,
      text: `Thank you, ${firstName}!\n\nWe have received your abstract submission. This confirms receipt only; it is not an acceptance notice.\nTitle: ${abstractTitle}\nSubmission ID: ${submissionId}`,
    });
  }

  async sendBrochureRequestConfirmation(email: string, firstName: string, brochureUrl: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Your Conference Brochure',
      content: `<h1>Hello, ${escapeHtml(firstName)}!</h1><p>Thank you for your interest in the conference. Download the brochure using the link below.</p><p><a href="${escapeHtml(brochureUrl)}">Download the conference brochure</a></p>`,
      text: `Hello, ${firstName}!\n\nThank you for your interest in the conference. Download the brochure:\n${brochureUrl}`,
    });
  }

  async sendContactAcknowledgement(email: string, name: string, subject: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'We received your conference enquiry',
      content: `<h1>Thank you, ${escapeHtml(name)}.</h1><p>Your message has been received by the conference team.</p>${subject ? `<p><strong>Subject:</strong> ${escapeHtml(subject)}</p>` : ''}<p>We will review your enquiry and respond if a reply is needed.</p>`,
      text: `Thank you, ${name}.\n\nYour message has been received by the conference team.${subject ? `\nSubject: ${subject}` : ''}\nWe will review your enquiry and respond if a reply is needed.`,
    });
  }

  async sendRegistrationReceived(email: string, firstName: string, registrationId: string, planName: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Conference registration received',
      content: `<h1>Registration received, ${escapeHtml(firstName)}.</h1><p>Your registration details have been saved. Payment is not confirmed by this email; your place is confirmed after successful payment.</p><p><strong>Registration reference:</strong> ${escapeHtml(registrationId)}<br><strong>Registration type:</strong> ${escapeHtml(planName)}</p>`,
      text: `Registration received, ${firstName}.\n\nYour registration details have been saved. Payment is not confirmed by this email; your place is confirmed after successful payment.\nRegistration reference: ${registrationId}\nRegistration type: ${planName}`,
    });
  }

  async sendAbstractDecision(email: string, firstName: string, abstractTitle: string, status: 'approved' | 'rejected'): Promise<any> {
    const approved = status === 'approved';
    return this.sendTemplate({
      to: email,
      subject: approved ? 'Abstract review decision: approved' : 'Abstract review decision',
      content: `<h1>Abstract review update</h1><p>Hello ${escapeHtml(firstName)},</p><p>Your abstract, <strong>${escapeHtml(abstractTitle)}</strong>, has been ${approved ? 'approved' : 'not accepted'} by the conference review team.</p>${approved ? '<p>The conference team will share any next steps separately.</p>' : '<p>Thank you for contributing to the conference.</p>'}`,
      text: `Abstract review update\n\nHello ${firstName},\nYour abstract, "${abstractTitle}", has been ${approved ? 'approved' : 'not accepted'} by the conference review team.${approved ? '\nThe conference team will share any next steps separately.' : '\nThank you for contributing to the conference.'}`,
    });
  }

  async sendPaymentFailure(email: string, firstName: string, orderNumber: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Conference payment was not completed',
      content: `<h1>Payment not completed</h1><p>Hello ${escapeHtml(firstName)},</p><p>We could not confirm payment for order <strong>${escapeHtml(orderNumber)}</strong>. You may return to the conference registration page to try again. Your registration is not marked as paid.</p>`,
      text: `Payment not completed\n\nHello ${firstName},\nWe could not confirm payment for order ${orderNumber}. You may return to the conference registration page to try again. Your registration is not marked as paid.`,
    });
  }

  async sendPaymentCancelled(email: string, firstName: string, orderNumber: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Conference checkout cancelled',
      content: `<h1>Checkout cancelled</h1><p>Hello ${escapeHtml(firstName)},</p><p>Checkout for order <strong>${escapeHtml(orderNumber)}</strong> was cancelled before payment was confirmed. You can start a new registration checkout at any time.</p>`,
      text: `Checkout cancelled\n\nHello ${firstName},\nCheckout for order ${orderNumber} was cancelled before payment was confirmed. You can start a new registration checkout at any time.`,
    });
  }

  async sendRefundConfirmation(email: string, firstName: string, orderNumber: string, amount: string, currency: string, partial: boolean): Promise<any> {
    const refundType = partial ? 'partial refund' : 'refund';
    return this.sendTemplate({
      to: email,
      subject: partial ? 'Conference payment partially refunded' : 'Conference payment refunded',
      content: `<h1>${partial ? 'Partial refund confirmed' : 'Refund confirmed'}</h1><p>Hello ${escapeHtml(firstName)},</p><p>A ${refundType} for order <strong>${escapeHtml(orderNumber)}</strong> has been confirmed by the payment provider.</p><p><strong>Refunded amount:</strong> ${escapeHtml(currency)} ${escapeHtml(amount)}</p>`,
      text: `${partial ? 'Partial refund confirmed' : 'Refund confirmed'}\n\nHello ${firstName},\nA ${refundType} for order ${orderNumber} has been confirmed by the payment provider.\nRefunded amount: ${currency} ${amount}`,
    });
  }

  async sendPaymentConfirmation(
    email: string,
    details: PaymentConfirmationEmail,
    attachments: Array<{ filename: string; content: string }> = [],
  ): Promise<any> {
    const accommodation = details.accommodation;
    const accommodationHtml = accommodation
      ? `<p><strong>Accommodation:</strong> ${escapeHtml(accommodation.name)}<br><strong>Stay:</strong> ${escapeHtml(accommodation.checkIn)} to ${escapeHtml(accommodation.checkOut)} (${escapeHtml(accommodation.nights)} nights)<br><strong>Accommodation total:</strong> ${escapeHtml(accommodation.total)}</p>`
      : '';
    const accommodationText = accommodation
      ? `\nAccommodation: ${accommodation.name}\nStay: ${accommodation.checkIn} to ${accommodation.checkOut} (${accommodation.nights} nights)\nAccommodation total: ${accommodation.total}`
      : '';
    const receiptLinkHtml = details.receiptUrl
      ? `<p><a href="${escapeHtml(details.receiptUrl)}">View and download your payment receipt</a></p>`
      : '';
    return this.sendTemplate({
      to: email,
      subject: 'Conference Registration Payment Confirmed',
      content: `<h1>Registration confirmed</h1><p>Thank you, ${escapeHtml(details.firstName)}. Your payment has been verified and received.</p><p><strong>Registration ID:</strong> ${escapeHtml(details.registrationId)}<br><strong>Acknowledgement Number:</strong> ${escapeHtml(details.acknowledgementNumber)}<br><strong>Receipt Number:</strong> ${escapeHtml(details.receiptNumber)}<br><strong>Payment Provider:</strong> ${escapeHtml(details.provider)}<br><strong>Amount:</strong> ${escapeHtml(details.amount)}${details.orderNumber ? `<br><strong>Order Number:</strong> ${escapeHtml(details.orderNumber)}` : ''}${details.paymentId ? `<br><strong>Payment ID:</strong> ${escapeHtml(details.paymentId)}` : ''}</p>${accommodationHtml}${receiptLinkHtml}<p>You can present your acknowledgement number during check-in.</p>`,
      text: `Registration confirmed\n\nThank you, ${details.firstName}. Your payment has been verified and received.\nRegistration ID: ${details.registrationId}\nAcknowledgement Number: ${details.acknowledgementNumber}\nReceipt Number: ${details.receiptNumber}\nPayment Provider: ${details.provider}\nAmount: ${details.amount}${details.orderNumber ? `\nOrder Number: ${details.orderNumber}` : ''}${details.paymentId ? `\nPayment ID: ${details.paymentId}` : ''}${accommodationText}${details.receiptUrl ? `\nView and download your payment receipt: ${details.receiptUrl}` : ''}\n\nYou can present your acknowledgement number during check-in.`,
      attachments,
    });
  }

  async sendAdminEventNotification(
    email: string,
    details: AdminNotificationDetails,
  ): Promise<any> {
    const labels: Record<string, string> = {
      ABSTRACT_SUBMISSION: 'Abstract submitted',
      ABSTRACT_DECISION: 'Abstract decision updated',
      BROCHURE_REQUEST: 'Brochure requested',
      CONTACT_ACKNOWLEDGEMENT: 'Contact enquiry received',
      REGISTRATION_RECEIVED: 'Registration received',
      PAYMENT_CONFIRMED: 'Payment confirmed',
      PAYMENT_FAILED: 'Payment failed',
      PAYMENT_CANCELLED: 'Payment checkout cancelled',
      REFUND_CONFIRMED: 'Refund confirmed',
    };
    const title = labels[details.eventType] || 'Conference notification';
    const rows = Object.entries(details.fields).filter(([, value]) => value !== '');
    const fieldHtml = rows.map(([label, value]) =>
      `<tr><th align="left" style="padding:6px;border-bottom:1px solid #ddd">${escapeHtml(label)}</th><td style="padding:6px;border-bottom:1px solid #ddd">${escapeHtml(value)}</td></tr>`,
    ).join('');
    const fieldText = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

    return this.sendTemplate({
      to: email,
      subject: `[Conference] ${title}`,
      content: `<h1>${escapeHtml(title)}</h1><p><strong>Event type:</strong> ${escapeHtml(details.eventType)}<br><strong>Reference:</strong> ${escapeHtml(details.referenceId)}<br><strong>Submitted at:</strong> ${escapeHtml(details.submittedAt)}</p><table style="border-collapse:collapse;width:100%">${fieldHtml}</table>`,
      text: `${title}\n\nEvent type: ${details.eventType}\nReference: ${details.referenceId}\nSubmitted at: ${details.submittedAt}\n\n${fieldText}`,
    });
  }

  async sendPasswordReset(email: string, firstName: string, resetLink: string): Promise<any> {
    return this.sendTemplate({
      to: email,
      subject: 'Reset Your Password',
      content: `<h1>Password reset request</h1><p>Hi ${escapeHtml(firstName)},</p><p>We received a request to reset your password. Use the link below within one hour.</p><p><a href="${escapeHtml(resetLink)}">Reset your password</a></p><p>If you did not request this, please ignore this email.</p>`,
      text: `Password reset request\n\nHi ${firstName},\nWe received a request to reset your password. Use the link below within one hour:\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
    });
  }

  private sendTemplate(options: {
    to: string;
    subject: string;
    content: string;
    text: string;
    attachments?: Array<{ filename: string; content: string }>;
  }) {
    return this.send({
      to: options.to,
      subject: options.subject,
      html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title>${escapeHtml(options.subject)}</title></head><body style="margin:0;padding:24px 12px;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#17332d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px"><tr><td style="padding:28px 24px;border-bottom:4px solid #15806b"><p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:.08em;color:#15806b">RENEWABLE ENERGY CONFERENCE 2027</p></td></tr><tr><td style="padding:28px 24px;line-height:1.6;font-size:16px">${options.content}<p style="margin:32px 0 0;color:#5b6d68;font-size:13px">Renewable Energy Conference 2027</p></td></tr></table></body></html>`,
      text: options.text,
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    });
  }
}
