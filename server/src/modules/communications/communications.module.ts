import { Global, Module } from '@nestjs/common';
import { CommunicationsService } from './communications.service';
import { WhatsappBotService } from './whatsapp-bot.service';
import {
  WhatsappController,
  WhatsappBotController,
  CallsController,
  PendingQueueController,
  CommunicationsLegacyController,
  WhatsappTemplatesAliasController,
} from './communications.controller';

@Global()
@Module({
  controllers: [
    WhatsappBotController,
    WhatsappController,
    CallsController,
    PendingQueueController,
    CommunicationsLegacyController,
    WhatsappTemplatesAliasController,
  ],
  providers: [CommunicationsService, WhatsappBotService],
  exports: [CommunicationsService, WhatsappBotService],
})
export class CommunicationsModule {}
