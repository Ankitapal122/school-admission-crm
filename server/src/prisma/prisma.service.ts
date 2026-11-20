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

  onModuleInit() {
    // Non-blocking background DB warmup so HTTP port binds in ~2s on Render (prevents port-scan timeout)
    const connectWithRetry = async () => {
      let retries = 5;
      while (retries > 0) {
        try {
          await this.$connect();
          console.log('[PrismaService] Connected to PostgreSQL cleanly.');
          break;
        } catch (err: any) {
          retries--;
          console.warn(`[PrismaService] Connect retry (${retries} left):`, err?.message || err);
          if (retries > 0) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
    };
    connectWithRetry().catch(() => {});

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
