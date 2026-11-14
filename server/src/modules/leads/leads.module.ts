import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController, MatchController, ScoringController } from './leads.controller';

@Module({
  providers: [LeadsService],
  controllers: [LeadsController, ScoringController, MatchController],
  exports: [LeadsService],
})
export class LeadsModule {}
