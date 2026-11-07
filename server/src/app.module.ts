import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { QueuesModule } from './modules/queues/queues.module';
import { CrmCoreModule } from './modules/crm-core/crm-core.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    LeadsModule,
    AdmissionsModule,
    CommissionsModule,
    SchoolsModule,
    NotificationsModule,
    QueuesModule,
    CrmCoreModule,
  ],
})
export class AppModule {}
