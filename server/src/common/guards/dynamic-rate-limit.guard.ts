import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

export const RATE_LIMIT_KEY = 'crm_rate_limit_key';

export interface RateLimitRule {
  settingKey: 'lead_create_per_hour' | 'merge_per_hour' | 'bulk_import_per_hour' | 'login_per_min';
  defaultLimit: number;
  windowMs: number;
}

export const CrmRateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);

@Injectable()
export class DynamicRateLimitGuard implements CanActivate {
  private static buckets = new Map<string, number[]>();
  private static cachedConfig: { loadedAt: number; value: Record<string, any> } | null = null;

  constructor(
    private reflector: Reflector,
    @Optional() private prisma?: PrismaService,
  ) {}

  static invalidateConfig() {
    DynamicRateLimitGuard.cachedConfig = null;
  }

  private async getLimitsConfig(): Promise<Record<string, any>> {
    if (!this.prisma) return {};
    const now = Date.now();
    if (DynamicRateLimitGuard.cachedConfig && now - DynamicRateLimitGuard.cachedConfig.loadedAt < 30_000) {
      return DynamicRateLimitGuard.cachedConfig.value;
    }
    try {
      const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'rate_limits' } });
      const val = (setting?.value as Record<string, any>) || {};
      DynamicRateLimitGuard.cachedConfig = { loadedAt: now, value: val };
      return val;
    } catch {
      return {};
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const req = context.switchToHttp().getRequest();
    const actorKey = req.user?.id || req.ip || 'anon';
    const bucketKey = `${rule.settingKey}:${actorKey}`;

    const config = await this.getLimitsConfig();
    const limit = Number(config[rule.settingKey] ?? rule.defaultLimit) || rule.defaultLimit;

    const now = Date.now();
    const cutoff = now - rule.windowMs;
    const hits = (DynamicRateLimitGuard.buckets.get(bucketKey) || []).filter((ts) => ts > cutoff);

    if (hits.length >= limit) {
      throw new HttpException(
        {
          success: false,
          message: `Rate limit exceeded (${limit} requests per window) for ${rule.settingKey}.`,
          error: { code: 'RATE_LIMIT_EXCEEDED', limit, windowMs: rule.windowMs },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    hits.push(now);
    DynamicRateLimitGuard.buckets.set(bucketKey, hits);
    return true;
  }
}
