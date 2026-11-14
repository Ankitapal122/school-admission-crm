import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCanonicalRole, toBlueprintRole } from '../utils/crm.utils';

@Injectable()
export class RolesGuard implements CanActivate {
  private static permCache: {
    loadedAt: number;
    map: Map<string, boolean>;
  } | null = null;

  constructor(
    private reflector: Reflector,
    @Optional() private prisma?: PrismaService,
  ) {}

  static invalidateCache() {
    RolesGuard.permCache = null;
  }

  private async getPermissionMap(): Promise<Map<string, boolean> | null> {
    if (!this.prisma) return null;
    const now = Date.now();
    if (RolesGuard.permCache && now - RolesGuard.permCache.loadedAt < 30_000) {
      return RolesGuard.permCache.map;
    }
    try {
      const rows = await this.prisma.rolePermission.findMany();
      if (!rows.length) return null;
      const map = new Map<string, boolean>();
      for (const r of rows) {
        map.set(`${r.role}:${r.permissionKey}`, r.allowed);
      }
      RolesGuard.permCache = { loadedAt: now, map };
      return map;
    } catch {
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPerm = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length && !requiredPerm) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user;
    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    const userCanonicalRole = normalizeCanonicalRole(user.role);
    const userBlueprintRole = toBlueprintRole(user.role);

    if (requiredRoles?.length) {
      const allowedCanon = requiredRoles.map((r) => normalizeCanonicalRole(r));
      if (!allowedCanon.includes(userCanonicalRole)) {
        throw new ForbiddenException('Insufficient role permissions for this operation.');
      }
    }

    if (requiredPerm) {
      const permMap = await this.getPermissionMap();
      if (permMap && permMap.size > 0) {
        const key = `${userBlueprintRole}:${requiredPerm}`;
        if (permMap.has(key) && permMap.get(key) === false) {
          throw new ForbiddenException(`Role lacks permission "${requiredPerm}".`);
        }
      }
    }

    return true;
  }
}
