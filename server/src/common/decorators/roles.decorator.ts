import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PERMISSION_KEY = 'permission_key';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const RequirePermission = (permissionKey: string) =>
  SetMetadata(PERMISSION_KEY, permissionKey);
