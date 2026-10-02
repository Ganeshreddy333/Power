import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private resend: Resend | null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async send(options: EmailOptions): Promise<any> {
    try {
      const payload: any = {
        from: this.configService.get('EMAIL_FROM') || 'noreply@resend.dev',
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      if (options.replyTo) payload.reply_to = options.replyTo;

      if (!this.resend) {
        console.log('Email service disabled: RESEND_API_KEY not configured.');
        return { success: true, skipped: true, message: 'Email service disabled in local development.' };
      }

      const result = await this.resend.emails.send(payload);

      if (result.error) {
        throw new Error(`Email send error: ${result.error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendRegistrationConfirmation(
    email: string,
    firstName: string,
    confirmationLink: string,
  ): Promise<any> {
    return this.send({
      to: email,
      subject: 'Confirm Your Conference Registration',
      html: `
        <h1>Welcome, ${firstName}!</h1>
        <p>Thank you for registering for our conference.</p>
        <p>
          <a href="${confirmationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Confirm Your Registration
          </a>
        </p>
        <p>If you did not register, please ignore this email.</p>
      `,
    });
  }

  async sendAbstractSubmissionConfirmation(
    email: string,
    firstName: string,
    abstractTitle: string,
    submissionId: string,
  ): Promise<any> {
    return this.send({
      to: email,
      subject: 'Abstract Submission Received',
      html: `
        <h1>Thank You, ${firstName}!</h1>
        <p>We have received your abstract submission:</p>
        <p><strong>Title:</strong> ${abstractTitle}</p>
        <p><strong>Submission ID:</strong> ${submissionId}</p>
        <p>You will be notified about the status of your submission shortly.</p>
      `,
    });
  }

  async sendPasswordReset(
    email: string,
    firstName: string,
    resetLink: string,
  ): Promise<any> {
    return this.send({
      to: email,
      subject: 'Reset Your Password',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hi ${firstName},</p>
        <p>We received a request to reset your password. Click the link below to proceed:</p>
        <p>
          <a href="${resetLink}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p>This link will expire in 1 hour.</p>
        <p>If you did not request this, please ignore this email.</p>
      `,
    });
  }
}
