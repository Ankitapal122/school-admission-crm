import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private keepAliveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super({
      transactionOptions: {
        maxWait: 15_000,
        timeout: 45_000,
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    // Keep connection warm every 3 minutes so remote PostgreSQL does not close TCP socket
    this.keepAliveTimer = setInterval(async () => {
      try {
        await this.$queryRaw`SELECT 1`;
      } catch (e) {
        // ignore background keepalive errors
      }
    }, 180000);
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    await this.$disconnect();
  }
}
