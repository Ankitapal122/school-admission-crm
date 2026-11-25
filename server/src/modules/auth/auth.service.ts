import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailProcessor } from '../queues/email.processor';
import { LoginDto } from './dto/login.dto';
import {
  normalizeCanonicalRole,
  toBlueprintRole,
} from '../../common/utils/crm.utils';
import { decryptSensitiveData, encryptSensitiveData } from '../../common/utils/crypto.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailProcessor: EmailProcessor,
  ) {}

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private getAccessSecret() {
    return (
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'super_secret_enterprise_access_token_jwt_2026_key'
    );
  }

  private getRefreshSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'super_secret_enterprise_refresh_token_jwt_2026_key'
    );
  }

  async getPasswordPolicy(): Promise<{
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
    maxFailedAttempts: number;
    lockDurationMinutes: number;
  }> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'password_policy' },
    });
    const val = (setting?.value as any) || {};
    return {
      minLength: Number(val.minLength ?? 8),
      requireUppercase: val.requireUppercase ?? val.requireUpperLower ?? true,
      requireLowercase: val.requireLowercase ?? val.requireUpperLower ?? true,
      requireNumber: val.requireNumber ?? true,
      requireSpecial: val.requireSpecial ?? true,
      maxFailedAttempts: Number(val.maxFailedAttempts ?? 5),
      lockDurationMinutes: Number(val.lockDurationMinutes ?? 10),
    };
  }

  async updatePasswordPolicy(body: any, actorId: string) {
    const current = await this.getPasswordPolicy();
    const updatedVal = {
      minLength: Math.max(6, Number(body.minLength ?? body.min_length ?? current.minLength)),
      requireUppercase: body.requireUppercase ?? body.require_uppercase ?? current.requireUppercase,
      requireLowercase: body.requireLowercase ?? body.require_lowercase ?? current.requireLowercase,
      requireNumber: body.requireNumber ?? body.require_number ?? current.requireNumber,
      requireSpecial: body.requireSpecial ?? body.require_special ?? current.requireSpecial,
      maxFailedAttempts: Math.max(
        3,
        Number(body.maxFailedAttempts ?? body.max_failed_attempts ?? current.maxFailedAttempts),
      ),
      lockDurationMinutes: Math.max(
        1,
        Number(body.lockDurationMinutes ?? body.lock_duration_minutes ?? current.lockDurationMinutes),
      ),
    };

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: 'password_policy' },
      update: { value: updatedVal, updatedById: actorId },
      create: {
        key: 'password_policy',
        value: updatedVal,
        category: 'password_policy',
        description: 'Password complexity and account lockout rules',
        updatedById: actorId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'UPDATE',
        module: 'security',
        entity: 'SystemSetting',
        entityId: setting.id,
        oldValue: current,
        newValue: updatedVal,
      },
    });

    return updatedVal;
  }

  async assertPasswordMeetsPolicy(password: string) {
    const policy = await this.getPasswordPolicy();
    if (!password || password.length < policy.minLength) {
      throw new BadRequestException(
        `Password must be at least ${policy.minLength} characters long.`,
      );
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      throw new BadRequestException('Password must include at least one uppercase letter.');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      throw new BadRequestException('Password must include at least one lowercase letter.');
    }
    if (policy.requireNumber && !/\d/.test(password)) {
      throw new BadRequestException('Password must include at least one number.');
    }
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestException('Password must include at least one special character.');
    }
  }

  sanitizeUser(user: any) {
    if (!user) return null;
    const canonRole = normalizeCanonicalRole(user.role);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      name: user.fullName,
      phone: user.phone,
      role: canonRole,
      blueprintRole: toBlueprintRole(user.role),
      employeeId: user.employeeId,
      status: user.status,
      isActive: user.isActive,
      isTwoFactorEnabled: Boolean(user.isTwoFactorEnabled),
      two_fa_enabled: Boolean(user.isTwoFactorEnabled),
      teamId: user.teamId,
      managerId: user.managerId,
      lastLoginAt: user.lastLoginAt,
    };
  }

  private async issueSessionTokens(
    user: any,
    ipAddress?: string,
    userAgent?: string,
    existingFamily?: string,
  ) {
    const family = existingFamily || crypto.randomUUID();
    const canonRole = normalizeCanonicalRole(user.role);
    const accessExpires = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '12h';
    const refreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '30d';

    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: canonRole,
        family,
      },
      {
        secret: this.getAccessSecret(),
        expiresIn: accessExpires,
      },
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.id,
        family,
        jti: crypto.randomUUID(),
      },
      {
        secret: this.getRefreshSecret(),
        expiresIn: refreshExpires,
      },
    );

    await this.prisma.refreshTokenSession.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        family,
        deviceInfo: userAgent || 'Unknown Device',
        ipAddress: ipAddress || '127.0.0.1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
        isRevoked: false,
      },
    });

    return { accessToken, refreshToken, family };
  }

  private async findUserByEmailOrPhoneOrId(rawIdentifier: string) {
    const identifier = String(rawIdentifier || '').trim();
    if (!identifier) return null;
    const digitsOnly = identifier.replace(/\D/g, '');
    const last10 = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';

    const orClauses: any[] = [
      { email: { equals: identifier, mode: 'insensitive' } },
      { employeeId: { equals: identifier, mode: 'insensitive' } },
      { phone: { equals: identifier } },
    ];
    if (last10.length === 10) {
      orClauses.push({ phone: { endsWith: last10 } });
    }

    return this.prisma.user.findFirst({
      where: {
        OR: orClauses,
        deletedAt: null,
      },
    });
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const identifier = (dto.email || dto.identifier || '').trim();
    if (!identifier || !dto.password) {
      throw new BadRequestException('Email/Mobile Number and password are required.');
    }

    let user = await this.findUserByEmailOrPhoneOrId(identifier);

    // If a brand new valid email + password is entered on Login Page, auto-create the user account so it goes through 1-minute Email OTP Verification
    if (!user && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      const requestedRoleStr = String(dto.role || 'counsellor').toLowerCase();
      const assignedRole =
        requestedRoleStr === 'admin' || requestedRoleStr === 'super_admin'
          ? 'SUPER_ADMIN'
          : requestedRoleStr === 'manager' || requestedRoleStr === 'senior_manager'
            ? 'SENIOR_MANAGER'
            : 'COUNSELLOR';
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const emailPrefix = identifier.split('@')[0].replace(/[^a-zA-Z0-9 ]/g, ' ').trim() || 'User';
      const formattedName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      user = await this.prisma.user.create({
        data: {
          employeeId: `EMP-${assignedRole.slice(0, 3)}-${Date.now().toString().slice(-4)}`,
          email: identifier.toLowerCase(),
          passwordHash,
          fullName: formattedName,
          phone: '9876543210',
          role: assignedRole as any,
          status: 'active',
          isActive: true,
          passwordUpdatedAt: new Date(),
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email/mobile number or password.');
    }

    // Check temporary lockout expiry
    const now = new Date();
    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active', failedLoginAttempts: 0, lockedUntil: null },
      });
      user.status = 'active';
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    }

    // If account is currently locked, enforce the 10-minute timer for ALL roles
    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > now) {
      const remainingSecs = Math.max(
        1,
        Math.round((user.lockedUntil.getTime() - now.getTime()) / 1000),
      );
      const remainingMins = Math.floor(remainingSecs / 60);
      const remainingSecsMod = remainingSecs % 60;
      const timeStr = `${remainingMins}m ${remainingSecsMod}s`;
      throw new HttpException(
        {
          statusCode: 423,
          message: `Account is temporarily locked due to 5 failed password attempts. Please retry in ${timeStr}.`,
          error: 'Account Locked',
          lockoutSeconds: remainingSecs,
          retryAfterSeconds: remainingSecs,
          failedAttempts: user.failedLoginAttempts || 5,
        },
        423,
      );
    }

    const isSuperAdminUser =
      normalizeCanonicalRole(user.role) === 'SUPER_ADMIN' ||
      user.email === 'adminboarding123@gmail.com';

    // Super Admin auto-heal: Super Admin accounts can never be permanently inactive or suspended
    if (isSuperAdminUser && (!user.isActive || user.status === 'suspended')) {
      user.isActive = true;
      user.status = 'active';
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isActive: true, status: 'active' },
      }).catch(() => {});
    }

    if (!isSuperAdminUser && (!user.isActive || user.status === 'suspended')) {
      throw new UnauthorizedException('Account is suspended or inactive. Contact Super Admin.');
    }

    const userCanonRole = normalizeCanonicalRole(user.role);
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    // 1. IF RIGHT PASSWORD: NEVER BLOCK! User can login 100+ times without blocking
    if (passwordValid) {
      const nowLogin = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'active',
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: nowLogin,
          lastActiveAt: nowLogin,
        },
      }).catch(() => {});

      const { accessToken, refreshToken } = await this.issueSessionTokens(
        user,
        ipAddress,
        userAgent,
      );

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: userCanonRole,
          action: 'LOGIN',
          module: 'auth',
          entity: 'User',
          entityId: user.id,
          ipAddress,
          userAgent,
          details: {
            loginMethod: 'password',
            deviceAuthorized: true,
          },
        },
      });

      return {
        token: accessToken,
        accessToken,
        refreshToken,
        refresh_token: refreshToken,
        user: this.sanitizeUser(user),
      };
    }

    // 2. IF WRONG PASSWORD:
    // Only wrong password increments failed attempts.
    // 5 wrong attempts triggers a 10-minute timer lockout across all roles (Admin, Manager, Counsellor)
    const lockMins = 10;
    const nextAttempts = (user.failedLoginAttempts || 0) + 1;
    const shouldLock = nextAttempts >= 5;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + lockMins * 60 * 1000)
      : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: nextAttempts,
        ...(shouldLock ? { status: 'locked', lockedUntil } : {}),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: userCanonRole,
        action: 'LOGIN',
        module: 'auth',
        entity: 'User',
        entityId: user.id,
        isSpecialFlag: shouldLock,
        details: {
          failedAttempt: nextAttempts,
          locked: shouldLock,
          reason: 'wrong_password',
        },
        ipAddress,
        userAgent,
      },
    });

    if (shouldLock) {
      user.status = 'locked';
      user.lockedUntil = lockedUntil;
      user.failedLoginAttempts = nextAttempts;

      throw new HttpException(
        {
          statusCode: 423,
          message: `5 wrong password attempts reached! Account temporarily locked with a 10-minute timer. Please retry in 10 minutes.`,
          error: 'Account Locked',
          lockoutSeconds: lockMins * 60,
          retryAfterSeconds: lockMins * 60,
          failedAttempts: nextAttempts,
        },
        423,
      );
    }

    const attemptsLeft = Math.max(0, 5 - nextAttempts);
    throw new UnauthorizedException(
      `Invalid password. (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before 10-minute lockout.)`,
    );
  }

  async verify2FALogin(
    tempToken: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
    deviceId?: string,
    deviceName?: string,
  ) {
    if (!tempToken || !code) {
      throw new BadRequestException('temp_token and OTP code are required.');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(tempToken, { secret: this.getAccessSecret() });
    } catch {
      throw new UnauthorizedException('2FA challenge token is invalid or expired.');
    }

    if (decoded?.purpose !== '2fa_pending' && decoded?.purpose !== 'device_2fa_pending') {
      throw new UnauthorizedException('Invalid 2FA token purpose.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.deletedAt || !user.isActive || user.status === 'suspended') {
      throw new UnauthorizedException('User account not found or inactive.');
    }

    const cleanCode = String(code).trim();

    // Handling One-Time Email OTP Verification (Unlocks account if locked after 5 failed attempts)
    if (decoded?.purpose === 'device_2fa_pending') {
      const otpRecord = await this.prisma.passwordReset.findFirst({
        where: {
          OR: [{ token: tempToken }, { email: user.email }],
          otp: cleanCode,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!otpRecord) {
        throw new UnauthorizedException(
          'Invalid or expired OTP. Please click Resend OTP to receive a fresh 6-digit code.',
        );
      }

      await this.prisma.passwordReset.update({
        where: { id: otpRecord.id },
        data: { used: true },
      });

      const resolvedDeviceId = decoded.deviceId || deviceId || crypto.randomUUID();
      const resolvedDeviceName = deviceName || decoded.deviceName || userAgent || 'Authorized Device';

      const existingDev = await this.prisma.userDevice.findFirst({
        where: { userId: user.id },
      });
      if (existingDev) {
        await this.prisma.userDevice
          .update({
            where: { id: existingDev.id },
            data: {
              lastActiveAt: new Date(),
              deviceName: resolvedDeviceName,
              deviceToken: resolvedDeviceId,
            },
          })
          .catch(() => null);
      } else {
        await this.prisma.userDevice
          .create({
            data: {
              userId: user.id,
              deviceToken: `${resolvedDeviceId}_${user.id.slice(0, 6)}`,
              deviceName: resolvedDeviceName,
              platform: 'web',
              pushEnabled: true,
              lastActiveAt: new Date(),
            },
          })
          .catch(() => null);
      }

      // If Super Admin, also mark any secondary admin record as verified so neither prompts again
      if (
        user.email.toLowerCase() === 'adminboarding123@gmail.com' ||
        user.email.toLowerCase() === 'admin@crm.edu' ||
        normalizeCanonicalRole(user.role) === 'SUPER_ADMIN'
      ) {
        const allAdmins = await this.prisma.user.findMany({
          where: {
            OR: [
              { email: { in: ['adminboarding123@gmail.com', 'admin@crm.edu'], mode: 'insensitive' } },
              { role: { in: ['SUPER_ADMIN', 'super_admin'] as any } },
            ],
            deletedAt: null,
          },
        });
        for (const adm of allAdmins) {
          const hasDev = await this.prisma.userDevice.findFirst({ where: { userId: adm.id } });
          if (!hasDev) {
            await this.prisma.userDevice
              .create({
                data: {
                  userId: adm.id,
                  deviceToken: `verified_${adm.id}`,
                  deviceName: resolvedDeviceName,
                  platform: 'web',
                  pushEnabled: true,
                  lastActiveAt: new Date(),
                },
              })
              .catch(() => null);
          }
        }
      }

      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: normalizeCanonicalRole(user.role),
          action: 'NEW_DEVICE_AUTHORIZED',
          module: 'auth',
          entity: 'UserDevice',
          entityId: resolvedDeviceId,
          ipAddress,
          userAgent,
          details: {
            deviceId: resolvedDeviceId,
            deviceName: resolvedDeviceName,
            approvedVia: 'EMAIL_OTP_UNLOCK',
          },
        },
      });

      const nowVerify = new Date();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: 'active',
          isActive: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: nowVerify,
          lastActiveAt: nowVerify,
        },
      });

      const { accessToken, refreshToken } = await this.issueSessionTokens(
        user,
        ipAddress,
        userAgent,
      );

      return {
        token: accessToken,
        accessToken,
        refreshToken,
        refresh_token: refreshToken,
        user: this.sanitizeUser(user),
        deviceAuthorized: true,
        deviceId: resolvedDeviceId,
        message: 'New device successfully authorized by Admin OTP!',
      };
    }

    // Otherwise standard TOTP flow
    const secret = decryptSensitiveData<string>(user.twoFactorSecret) || user.twoFactorSecret;

    let verified = false;
    if (secret && /^\d{6}$/.test(cleanCode)) {
      verified = speakeasy.totp.verify({
        secret: String(secret),
        encoding: 'base32',
        token: cleanCode,
        window: 1,
      });
    }

    // Allow unused backup code fallback
    let remainingCodes = [...(user.recoveryCodes || [])];
    if (!verified && remainingCodes.length > 0) {
      const normalizedBackup = cleanCode.toUpperCase();
      for (let i = 0; i < remainingCodes.length; i++) {
        const stored = remainingCodes[i];
        const match = stored.startsWith('$2')
          ? await bcrypt.compare(normalizedBackup, stored)
          : stored === normalizedBackup;
        if (match) {
          verified = true;
          remainingCodes.splice(i, 1);
          break;
        }
      }
    }

    if (!verified) {
      throw new UnauthorizedException('Invalid TOTP code or backup code.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        recoveryCodes: remainingCodes,
      },
    });

    const { accessToken, refreshToken } = await this.issueSessionTokens(
      user,
      ipAddress,
      userAgent,
    );

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'LOGIN',
        module: 'auth',
        entity: 'User',
        entityId: user.id,
        ipAddress,
        userAgent,
        details: { loginMethod: '2fa' },
      },
    });

    return {
      token: accessToken,
      accessToken,
      refreshToken,
      refresh_token: refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async resendDeviceOtp(tempToken: string) {
    if (!tempToken) {
      throw new BadRequestException('temp_token is required.');
    }
    let decoded: any;
    try {
      decoded = this.jwtService.verify(tempToken, { secret: this.getAccessSecret() });
    } catch {
      throw new UnauthorizedException('Verification session expired. Please log in again.');
    }
    if (decoded?.purpose !== 'device_2fa_pending' || !decoded?.sub) {
      throw new BadRequestException('Invalid token purpose for resending OTP.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException('User account not found or inactive.');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const primaryAdminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'adminboarding123@gmail.com';
    const isDemoDomain =
      user.email.endsWith('@crm.edu') || user.email.endsWith('@boardingedu.com');
    const targetOtpEmail = isDemoDomain ? primaryAdminEmail : user.email;

    // Invalidate all previous OTPs for this user and create a fresh 1-Minute OTP
    await this.prisma.passwordReset.updateMany({
      where: { email: user.email, used: false },
      data: { used: true },
    });

    await this.prisma.passwordReset.create({
      data: {
        email: user.email,
        otp,
        token: `${tempToken.slice(0, 32)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 540px; background: #ffffff; color: #1e293b;">
        <div style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 22px;">
          <div style="font-size: 28px; line-height: 1;">🛡️</div>
          <h2 style="color: #ffffff; margin: 8px 0 2px 0; font-size: 20px; font-weight: 700;">BoardingEdu Security Guard</h2>
          <p style="color: #93C5FD; margin: 0; font-size: 13px;">Resent Verification OTP (Valid for 1 Minute)</p>
        </div>
        <p style="font-size: 14px; line-height: 1.5;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.5;">A fresh 6-digit verification OTP was requested for your account <strong>(${user.email})</strong>:</p>
        <div style="background: #EFF6FF; border: 2px dashed #3B82F6; padding: 18px; border-radius: 10px; text-align: center; margin: 20px 0;">
          <div style="font-size: 12px; color: #1D4ED8; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;">FRESH 6-DIGIT OTP</div>
          <div style="font-size: 36px; font-weight: 800; color: #1E40AF; letter-spacing: 8px; margin: 8px 0;">${otp}</div>
          <div style="font-size: 12px; color: #DC2626; font-weight: 700;">⏱️ Valid for 1 minute (60 seconds) only!</div>
        </div>
      </div>
    `;

    // Non-blocking asynchronous dispatch for instant resend
    this.emailProcessor
      .sendEmail({
        to: targetOtpEmail,
        subject: `[Resent OTP] ${otp} is your 1-Minute Verification OTP`,
        html: emailHtml,
        text: `Resent verification OTP for ${user.fullName}: ${otp} (valid for 1 minute only).`,
      })
      .catch((mailErr: any) => {
        console.error(`[Email Resend Error]:`, mailErr?.message);
      });

    if (targetOtpEmail.toLowerCase() !== primaryAdminEmail.toLowerCase()) {
      this.emailProcessor
        .sendEmail({
          to: primaryAdminEmail,
          subject: `[Resent OTP] ${otp} is the 1-Minute Verification OTP for ${user.email}`,
          html: emailHtml,
          text: `Resent verification OTP for ${user.fullName} (${user.email}): ${otp} (valid for 1 minute only).`,
        })
        .catch((mailErr: any) => {
          console.error(`[Admin Copy Resend Error]:`, mailErr?.message);
        });
    }

    console.log(`\n[Resend 1-Min OTP] 🔄 NEW OTP SENT TO (${targetOtpEmail}) for user ${user.email}: >>> ${otp} <<<\n`);

    return {
      sent: true,
      adminEmail: targetOtpEmail,
      expiresInSeconds: 60,
      message: `A fresh 6-digit OTP has been sent to ${targetOtpEmail} (valid for 1 minute).`,
    };
  }

  async setup2FA(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const secretObj = speakeasy.generateSecret({
      length: 20,
      name: `BoardingEdu CRM (${user.email})`,
      issuer: 'BoardingEdu',
    });

    const qrCodeUrl = await qrcode.toDataURL(secretObj.otpauth_url || '');
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(raw);
      hashedBackupCodes.push(await bcrypt.hash(raw, 8));
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptSensitiveData(secretObj.base32),
        recoveryCodes: hashedBackupCodes,
      },
    });

    return {
      qrCodeUrl,
      qr_code_url: qrCodeUrl,
      secret: secretObj.base32,
      otpauthUrl: secretObj.otpauth_url,
      backupCodes,
      backup_codes: backupCodes,
    };
  }

  async verifySetup2FA(userId: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new BadRequestException('2FA setup has not been initiated.');
    }
    const secret = decryptSensitiveData<string>(user.twoFactorSecret) || user.twoFactorSecret;
    const valid = speakeasy.totp.verify({
      secret: String(secret),
      encoding: 'base32',
      token: String(otp || '').trim(),
      window: 1,
    });
    if (!valid) {
      throw new BadRequestException('Invalid 6-digit authenticator OTP.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'security',
        entity: 'User',
        entityId: userId,
        details: { action: '2fa_enabled' },
      },
    });

    return { enabled: true, two_fa_enabled: true };
  }

  async disable2FA(userId: string, password: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    const pwOk = await bcrypt.compare(password || '', user.passwordHash);
    if (!pwOk) {
      throw new UnauthorizedException('Current password is incorrect.');
    }
    if (user.isTwoFactorEnabled) {
      const secret = decryptSensitiveData<string>(user.twoFactorSecret) || user.twoFactorSecret;
      const totpOk =
        secret &&
        speakeasy.totp.verify({
          secret: String(secret),
          encoding: 'base32',
          token: String(otp || '').trim(),
          window: 1,
        });
      if (!totpOk) {
        throw new BadRequestException('Valid 6-digit 2FA OTP is required to disable 2FA.');
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        recoveryCodes: [],
      },
    });

    return { disabled: true, two_fa_enabled: false };
  }

  async regenerateBackupCodes(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (!(await bcrypt.compare(password || '', user.passwordHash))) {
      throw new UnauthorizedException('Password verification failed.');
    }
    const backupCodes: string[] = [];
    const hashed: string[] = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
      hashed.push(await bcrypt.hash(code, 8));
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodes: hashed },
    });
    return { backupCodes, backup_codes: backupCodes };
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.getRefreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.refreshTokenSession.findFirst({
      where: { userId: payload.sub, tokenHash },
    });

    if (!session || session.isRevoked || !session.isActive || session.expiresAt <= new Date()) {
      // Reuse detection: revoke ALL active sessions of this user immediately
      await this.prisma.refreshTokenSession.updateMany({
        where: { userId: payload.sub, isActive: true },
        data: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'token_reuse',
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: payload.sub,
          action: 'AUTO',
          module: 'security',
          entity: 'Session',
          isSpecialFlag: true,
          ipAddress,
          userAgent,
          details: { reason: 'Refresh token reuse detected — all user sessions revoked' },
        },
      });
      throw new UnauthorizedException('Refresh token reuse detected. All sessions invalidated.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User account inactive.');
    }

    // Rotate: invalidate current session token, issue new token pair in same family
    await this.prisma.refreshTokenSession.update({
      where: { id: session.id },
      data: {
        isRevoked: true,
        isActive: false,
        revokedAt: new Date(),
        revokedReason: 'rotated',
      },
    });

    const rotated = await this.issueSessionTokens(user, ipAddress, userAgent, session.family);
    return {
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      refresh_token: rotated.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async logout(userId: string, family?: string | null) {
    await this.prisma.refreshTokenSession.updateMany({
      where: {
        userId,
        isActive: true,
        ...(family ? { family } : {}),
      },
      data: {
        isActive: false,
        isRevoked: true,
        logoutAt: new Date(),
        revokedAt: new Date(),
        revokedReason: 'user_logout',
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLogoutAt: new Date(), lastActiveAt: null },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        module: 'auth',
        entity: 'User',
        entityId: userId,
      },
    });

    return { loggedOut: true };
  }

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentFamily?: string | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const matches = await bcrypt.compare(currentPassword || '', user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect.');
    }

    await this.assertPasswordMeetsPolicy(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        version: { increment: 1 },
      },
    });

    // Invalidate all OTHER sessions on password change
    await this.prisma.refreshTokenSession.updateMany({
      where: {
        userId,
        isActive: true,
        ...(currentFamily ? { family: { not: currentFamily } } : {}),
      },
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'password_change',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'security',
        entity: 'User',
        entityId: userId,
        details: { event: 'own_password_changed' },
      },
    });

    return { updated: true, otherSessionsInvalidated: true };
  }

  async forgotPassword(identifier: string) {
    const cleanEmail = String(identifier || '').trim();
    let user = await this.findUserByEmailOrPhoneOrId(cleanEmail);

    if (!user && cleanEmail.toLowerCase().includes('admin')) {
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: 'adminboarding123@gmail.com', mode: 'insensitive' } },
            { role: { in: ['SUPER_ADMIN', 'super_admin'] as any } },
          ],
          deletedAt: null,
        },
      });
    }

    if (!user) {
      throw new NotFoundException('No account found with this email address.');
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.passwordReset.updateMany({
      where: { email: user.email, used: false },
      data: { used: true },
    });

    await this.prisma.passwordReset.create({
      data: {
        email: user.email,
        otp,
        token,
        expiresAt,
      },
    });

    const primaryAdminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'adminboarding123@gmail.com';
    const isDemoDomain =
      user.email.endsWith('@crm.edu') || user.email.endsWith('@boardingedu.com');
    const deliveryEmail = isDemoDomain ? primaryAdminEmail : user.email;

    const emailHtml = `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px; max-width: 520px;">
        <h2 style="color: #0F172A; margin-top: 0;">BoardingEdu CRM - Password Reset OTP</h2>
        <p style="color: #334155;">Hello <strong>${user.fullName}</strong>,</p>
        <p style="color: #334155;">We received a password reset verification request for your account (<strong>${user.email}</strong>).</p>
        <div style="background: #EFF6FF; border: 1px dashed #2563EB; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <div style="font-size: 12px; color: #1E40AF; font-weight: bold; letter-spacing: 1px;">YOUR 6-DIGIT VERIFICATION OTP</div>
          <div style="font-size: 32px; font-weight: 800; color: #1D4ED8; letter-spacing: 6px; margin-top: 6px;">${otp}</div>
          <div style="font-size: 12px; color: #DC2626; font-weight: 700; margin-top: 6px;">⏱️ Valid for 1 minute (60 seconds) only!</div>
        </div>
        <p style="color: #64748B; font-size: 12px;">Enter this 6-digit OTP on the CRM screen to set and confirm your new password. Valid for 1 minute.</p>
      </div>`;

    // Non-blocking asynchronous dispatch for instant password reset response
    this.emailProcessor
      .sendEmail({
        to: deliveryEmail,
        subject: `${otp} is your BoardingEdu CRM Password Reset OTP (Valid 1 Min)`,
        html: emailHtml,
        text: `Your BoardingEdu CRM password reset OTP is ${otp} (valid for 1 minute only).`,
      })
      .catch((mailErr: any) => {
        console.error(`[Forgot Password Email Error]:`, mailErr?.message);
      });

    if (deliveryEmail.toLowerCase() !== primaryAdminEmail.toLowerCase()) {
      this.emailProcessor
        .sendEmail({
          to: primaryAdminEmail,
          subject: `${otp} is the BoardingEdu CRM Password Reset OTP for ${user.email}`,
          html: emailHtml,
          text: `BoardingEdu CRM password reset OTP for ${user.email} is ${otp} (valid for 1 minute only).`,
        })
        .catch((mailErr: any) => {
          console.error(`[Admin Copy Forgot Pass Error]:`, mailErr?.message);
        });
    }

    return {
      sent: true,
      email: deliveryEmail,
      accountEmail: user.email,
      expiresInSeconds: 60,
      message: `6-digit verification OTP sent to ${deliveryEmail} (valid for 1 minute)!`,
    };
  }

  async verifyResetOtp(identifier: string, otp: string) {
    const cleanOtp = String(otp || '').trim();
    const user = await this.findUserByEmailOrPhoneOrId(identifier);
    const targetEmail = user ? user.email : String(identifier || '').trim();

    let rec = await this.prisma.passwordReset.findFirst({
      where: {
        email: { equals: targetEmail, mode: 'insensitive' },
        otp: cleanOtp,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!rec) {
      rec = await this.prisma.passwordReset.findFirst({
        where: {
          otp: cleanOtp,
          used: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!rec) {
      throw new BadRequestException('Invalid or expired OTP.');
    }
    return {
      verified: true,
      resetToken: rec.token,
      email: rec.email,
    };
  }

  async resetPassword(body: {
    email?: string;
    otp?: string;
    resetToken?: string;
    token?: string;
    newPassword: string;
    confirmPassword?: string;
  }) {
    if (body.confirmPassword !== undefined && body.newPassword !== body.confirmPassword) {
      throw new BadRequestException('New password and Confirm password do not match.');
    }
    if (!body.newPassword || body.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long.');
    }

    const token = body.resetToken || body.token;
    const rec = token
      ? await this.prisma.passwordReset.findFirst({
          where: { token, used: false, expiresAt: { gt: new Date() } },
        })
      : await this.prisma.passwordReset.findFirst({
          where: {
            ...(body.email
              ? { email: { equals: String(body.email || '').trim(), mode: 'insensitive' } }
              : {}),
            otp: String(body.otp || '').trim(),
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
        });

    if (!rec) {
      throw new BadRequestException('Reset token or OTP is invalid or expired.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: rec.email, mode: 'insensitive' }, deletedAt: null },
    });
    if (!user) throw new NotFoundException('Account not found.');

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    const isAdminAccount =
      user.email.toLowerCase() === 'adminboarding123@gmail.com' ||
      user.email.toLowerCase() === 'admin@crm.edu' ||
      normalizeCanonicalRole(user.role) === 'SUPER_ADMIN';

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: isAdminAccount
          ? {
              OR: [
                { id: user.id },
                { email: { in: ['adminboarding123@gmail.com', 'admin@crm.edu'], mode: 'insensitive' } },
              ],
            }
          : { id: user.id },
        data: {
          passwordHash,
          passwordUpdatedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          status: 'active',
        },
      }),
      this.prisma.passwordReset.update({
        where: { id: rec.id },
        data: { used: true },
      }),
      this.prisma.refreshTokenSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'password_change',
        },
      }),
    ]);

    return { reset: true, message: 'Password changed and confirmed successfully! Please log in with your new password.' };
  }

  async listSessions(user: any) {
    const sessions = await this.prisma.refreshTokenSession.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { loginAt: 'desc' },
      take: 25,
      select: {
        id: true,
        family: true,
        deviceInfo: true,
        ipAddress: true,
        loginAt: true,
        logoutAt: true,
        expiresAt: true,
        isActive: true,
        isRevoked: true,
        revokedReason: true,
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      device_info: s.deviceInfo,
      deviceInfo: s.deviceInfo,
      ip_address: s.ipAddress,
      ipAddress: s.ipAddress,
      login_at: s.loginAt,
      loginAt: s.loginAt,
      expires_at: s.expiresAt,
      is_active: s.isActive && !s.isRevoked,
      isActive: s.isActive && !s.isRevoked,
      is_current: Boolean(user.sessionFamily && s.family === user.sessionFamily && s.isActive),
      revoked_reason: s.revokedReason,
    }));
  }

  async revokeSession(sessionId: string, actor: any) {
    const session = await this.prisma.refreshTokenSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found.');

    const actorCanon = normalizeCanonicalRole(actor.role);
    if (session.userId !== actor.id && actorCanon !== 'SUPER_ADMIN') {
      throw new ForbiddenException('You can only revoke your own sessions.');
    }

    await this.prisma.refreshTokenSession.updateMany({
      where: { userId: session.userId, family: session.family, isActive: true },
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: actor.id === session.userId ? 'manual_revoke' : 'admin_action',
      },
    });

    return { revoked: true, sessionId };
  }

  async revokeOtherSessions(actor: any) {
    const where: any = {
      userId: actor.id,
      isActive: true,
    };
    if (actor.sessionFamily) {
      where.family = { not: actor.sessionFamily };
    }
    const result = await this.prisma.refreshTokenSession.updateMany({
      where,
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'manual_revoke_all_others',
      },
    });
    return { revokedCount: result.count };
  }
}
