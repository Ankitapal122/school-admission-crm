import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter | null = null;

  private getCredentials() {
    const user =
      process.env.SMTP_USER ||
      process.env.EMAIL_USER ||
      process.env.BREVO_SMTP_USER ||
      'adminboarding123@gmail.com';
    const pass = (
      process.env.SMTP_PASS ||
      process.env.EMAIL_PASS ||
      process.env.BREVO_API_KEY ||
      'zdvnmezemiytftec'
    ).replace(/\s+/g, '');
    const host =
      process.env.SMTP_HOST ||
      process.env.EMAIL_HOST ||
      (process.env.BREVO_API_KEY ? 'smtp-relay.brevo.com' : 'smtp.gmail.com');
    const from =
      process.env.SMTP_FROM ||
      `BoardingEdu CRM <${user}>`;
    return { user, pass, host, from };
  }

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const { user, pass, host } = this.getCredentials();
    if (!host || !user || !pass) {
      return null;
    }
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    this.transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 12000,
    });
    return this.transporter;
  }

  async sendEmail(options: { to: string; subject: string; html: string; text?: string }) {
    const { user, pass, host, from } = this.getCredentials();
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.log(
        `[DEV SMTP MOCK] To=${options.to} | Subject="${options.subject}"`,
      );
      return { delivered: false, mode: 'dev_fallback' };
    }
    try {
      const info = await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      this.logger.log(`Email sent to ${options.to} (messageId: ${info.messageId})`);
      return { delivered: true, mode: 'smtp', messageId: info.messageId };
    } catch (e: any) {
      this.logger.warn(`Primary SMTP send failed (${options.to}): ${e.message}. Trying SSL port 465 fallback...`);
      try {
        const fallbackTransporter = nodemailer.createTransport({
          host,
          port: 465,
          secure: true,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 12000,
        });
        const info = await fallbackTransporter.sendMail({
          from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        this.logger.log(`Fallback SSL 465 Email sent to ${options.to} (messageId: ${info.messageId})`);
        return { delivered: true, mode: 'smtp_465', messageId: info.messageId };
      } catch (err2: any) {
        this.logger.warn(`Fallback SMTP 465 also failed (${options.to}): ${err2.message}`);
        return { delivered: false, mode: 'smtp_error', error: err2.message };
      }
    }
  }
}
