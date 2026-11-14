import { Global, Module } from '@nestjs/common';
import { EmailProcessor } from './email.processor';
import { QueueEngineService } from './queue-engine.service';

@Global()
@Module({
  providers: [EmailProcessor, QueueEngineService],
  exports: [EmailProcessor, QueueEngineService],
})
export class QueuesModule {}
