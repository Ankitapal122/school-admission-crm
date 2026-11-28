import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeCanonicalRole, toBlueprintRole } from '../../../common/utils/crm.utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static userCache = new Map<string, { user: any; expiresAt: number }>();

  static clearCache(userId?: string) {
    if (userId) {
      for (const key of JwtStrategy.userCache.keys()) {
        if (key.startsWith(`${userId}:`)) {
          JwtStrategy.userCache.delete(key);
        }
      }
    } else {
      JwtStrategy.userCache.clear();
    }
  }

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req?.cookies?.access_token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'super_secret_enterprise_access_token_jwt_2026_key',
    });
  }

  async validate(payload: { sub: string; email: string; role: string; family?: string }) {
    const cacheKey = `${payload.sub}:${payload.family || ''}`;
    const now = Date.now();
    const cached = JwtStrategy.userCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return cached.user;
    }

    return this.prisma.executeWithRetry(async () => {
      const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        employeeId: true,
        status: true,
        isActive: true,
        deletedAt: true,
        lockedUntil: true,
        teamId: true,
        team: { select: { id: true, name: true } },
        managerId: true,
        manager: { select: { id: true, fullName: true, email: true, phone: true } },
        isTwoFactorEnabled: true,
      },
    });

    if (
      !user ||
      user.deletedAt ||
      !user.isActive ||
      user.status === 'suspended' ||
      user.status === 'locked'
    ) {
      throw new UnauthorizedException('User account is inactive, suspended, or locked.');
    }

    if (payload.family) {
      const activeFamilySession = await this.prisma.refreshTokenSession.findFirst({
        where: {
          userId: user.id,
          family: payload.family,
          isActive: true,
          isRevoked: false,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!activeFamilySession) {
        throw new UnauthorizedException('Session has been revoked or expired. Please login again.');
      }
    }

    const canonRole = normalizeCanonicalRole(user.role);
    const resolvedUser = {
      ...user,
      teamName: user.team?.name || null,
      managerName: user.manager?.fullName || null,
      managerEmail: user.manager?.email || null,
      managerPhone: user.manager?.phone || null,
      canonicalRole: canonRole,
      blueprintRole: toBlueprintRole(user.role),
      sessionFamily: payload.family || null,
    };

    JwtStrategy.userCache.set(cacheKey, { user: resolvedUser, expiresAt: now + 45_000 });
    return resolvedUser;
    });
  }
}
