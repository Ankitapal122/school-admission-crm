import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;

  constructor() {
    super({
      transactionOptions: {
        maxWait: 15_000,
        timeout: 45_000,
      },
    });
  }

  async safeReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    try {
      console.warn('[PrismaService] Refreshing database connection pool...');
      await this.$connect();
      console.log('[PrismaService] Connected to PostgreSQL cleanly.');
    } catch (err: any) {
      console.error('[PrismaService] Reconnect attempt failed:', err?.message || err);
    } finally {
      this.isReconnecting = false;
    }
  }

  async executeWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        attempt++;
        const msg = String(err?.message || '');
        const isConnErr =
          msg.includes('Server has closed the connection') ||
          msg.includes('Connection pool timeout') ||
          msg.includes('Timed out fetching a new connection') ||
          msg.includes("Can't reach database server") ||
          msg.includes('connection is closed');
        if (isConnErr && attempt < maxRetries) {
          console.warn(`[PrismaService] Transient DB connection drop. Reconnecting & retrying (attempt ${attempt}/${maxRetries})...`);
          await this.safeReconnect();
          continue;
        }
        throw err;
      }
    }
    return await fn();
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

    // Keep connection warm every 15 seconds so remote PostgreSQL does not close TCP socket
    this.keepAliveTimer = setInterval(async () => {
      try {
        await this.$queryRaw`SELECT 1`;
      } catch (e: any) {
        console.warn('[PrismaService] Keepalive ping failed. Reconnecting database pool...');
        await this.safeReconnect();
      }
    }, 15000);
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }
    await this.$disconnect();
  }
}
