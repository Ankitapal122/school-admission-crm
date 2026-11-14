import { Global, Module } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import {
  WhatsappController,
  CallsController,
  PendingQueueController,
  CommunicationsLegacyController,
  WhatsappTemplatesAliasController,
} from './communications.controller';

@Global()
@Module({
  controllers: [
    WhatsappController,
    CallsController,
    PendingQueueController,
    CommunicationsLegacyController,
    WhatsappTemplatesAliasController,
  ],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
