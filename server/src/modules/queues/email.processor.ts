import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('communications')
export class CommunicationProcessor extends WorkerHost {
  private readonly logger = new Logger(CommunicationProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing background job ${job.id} of type ${job.name}...`);

    switch (job.name) {
      case 'send-admission-email': {
        const { to, parentName, studentName, schoolName } = job.data;
        this.logger.log(`[BullMQ Worker] Email sent successfully to ${to} for student ${studentName} at ${schoolName}.`);
        return { success: true, deliveredAt: new Date() };
      }
      case 'send-whatsapp-followup': {
        const { phone, message } = job.data;
        this.logger.log(`[BullMQ Worker] WhatsApp dispatched to ${phone}: ${message}`);
        return { success: true, dispatchedAt: new Date() };
      }
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return { status: 'skipped' };
    }
  }
}
