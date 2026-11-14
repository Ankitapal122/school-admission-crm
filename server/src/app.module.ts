import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { QueuesModule } from './modules/queues/queues.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LeadsModule } from './modules/leads/leads.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CrmCoreModule } from './modules/crm-core/crm-core.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueuesModule,
    NotificationsModule,
    AuthModule,
    CommunicationsModule,
    DashboardModule,
    LeadsModule,
    SchoolsModule,
    AdmissionsModule,
    CommissionsModule,
    ReportsModule,
    CrmCoreModule,
  ],
})
export class AppModule {}
