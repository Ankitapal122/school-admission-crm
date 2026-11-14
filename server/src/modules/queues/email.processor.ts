import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;
    const user =
      process.env.SMTP_USER ||
      process.env.EMAIL_USER ||
      process.env.BREVO_SMTP_USER ||
      '';
    const pass =
      process.env.SMTP_PASS ||
      process.env.EMAIL_PASS ||
      process.env.BREVO_API_KEY ||
      '';
    const host =
      process.env.SMTP_HOST ||
      process.env.EMAIL_HOST ||
      (process.env.BREVO_API_KEY ? 'smtp-relay.brevo.com' : user ? 'smtp.gmail.com' : '');
    if (!host || !user || !pass) {
      return null;
    }
    const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: pass.replace(/\s+/g, '') },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
    });
    return this.transporter;
  }

  async sendEmail(options: { to: string; subject: string; html: string; text?: string }) {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.log(
        `[DEV SMTP MOCK] To=${options.to} | Subject="${options.subject}" | Body="${(options.text || options.html).slice(0, 140)}"`,
      );
      return { delivered: false, mode: 'dev_fallback' };
    }
    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || 'BoardingEdu CRM <no-reply@boardingedu.com>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return { delivered: true, mode: 'smtp', messageId: info.messageId };
    } catch (e: any) {
      this.logger.warn(`SMTP send failed (${options.to}): ${e.message}`);
      return { delivered: false, mode: 'smtp_error', error: e.message };
    }
  }
}
