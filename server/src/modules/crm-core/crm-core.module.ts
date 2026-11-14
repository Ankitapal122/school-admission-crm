import { Module } from '@nestjs/common';
import { CrmCoreController } from './crm-core.controller';
import { CrmCoreService } from './crm-core.service';
import { AuthModule } from '../auth/auth.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [AuthModule, LeadsModule],
  controllers: [CrmCoreController],
  providers: [CrmCoreService],
  exports: [CrmCoreService],
})
export class CrmCoreModule {}
