import { Module } from '@nestjs/common';
import { CrmCoreController } from './crm-core.controller';
import { CrmCoreService } from './crm-core.service';

@Module({
  controllers: [CrmCoreController],
  providers: [CrmCoreService],
  exports: [CrmCoreService],
})
export class CrmCoreModule {}
