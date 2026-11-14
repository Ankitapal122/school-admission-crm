import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CrmRateLimit, DynamicRateLimitGuard } from '../../common/guards/dynamic-rate-limit.guard';
import { apiEnvelope } from '../../common/utils/crm.utils';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setRefreshCookie(res: Response, refreshToken?: string) {
    if (!refreshToken) return;
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @UseGuards(DynamicRateLimitGuard)
  @CrmRateLimit({ settingKey: 'login_per_min', defaultLimit: 25, windowMs: 60_000 })
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(
      dto,
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, (result as any).refreshToken);
    return apiEnvelope(result, undefined, result);
  }

  @Post('2fa/verify-login')
  async verify2FALogin(
    @Body() body: { temp_token?: string; tempToken?: string; otp?: string; code?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verify2FALogin(
      body.temp_token || body.tempToken || '',
      body.otp || body.code || '',
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, result.refreshToken);
    return apiEnvelope(result, '2FA verified', result);
  }

  @Post('verify-2fa')
  async verify2FALegacy(
    @Body() body: { temp_token?: string; tempToken?: string; otp?: string; code?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verify2FALogin(
      body.temp_token || body.tempToken || '',
      body.otp || body.code || '',
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, result.refreshToken);
    return apiEnvelope(result, '2FA verified', result);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken =
      dto.refreshToken || dto.refresh_token || (req as any).cookies?.refresh_token || '';
    const result = await this.authService.refreshTokens(
      rawToken,
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent'],
    );
    this.setRefreshCookie(res, result.refreshToken);
    return apiEnvelope(result, 'Token rotated', result);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('refresh_token');
    const result = await this.authService.logout(req.user.id, req.user.sessionFamily);
    return apiEnvelope(result, 'Logged out cleanly', result);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  async me(@Req() req: any) {
    const user = this.authService.sanitizeUser(req.user);
    return apiEnvelope(user, undefined, { user });
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email?: string; phone?: string; identifier?: string }) {
    const identifier = body?.identifier || body?.email || body?.phone || '';
    const result = await this.authService.forgotPassword(identifier);
    return apiEnvelope(result, result.message, result);
  }

  @Post('verify-reset-otp')
  async verifyResetOtp(@Body() body: { email?: string; phone?: string; identifier?: string; otp: string }) {
    const identifier = body?.identifier || body?.email || body?.phone || '';
    const result = await this.authService.verifyResetOtp(identifier, body.otp);
    return apiEnvelope(result, 'OTP verified', result);
  }

  @Post('verify-otp')
  async verifyResetOtpAlias(@Body() body: { email?: string; phone?: string; identifier?: string; otp: string }) {
    const identifier = body?.identifier || body?.email || body?.phone || '';
    const result = await this.authService.verifyResetOtp(identifier, body.otp);
    return apiEnvelope(result, 'OTP verified', result);
  }

  @Post('reset-password')
  async resetPassword(
    @Body()
    body: {
      email?: string;
      otp?: string;
      resetToken?: string;
      token?: string;
      newPassword: string;
    },
  ) {
    const result = await this.authService.resetPassword(body);
    return apiEnvelope(result, result.message, result);
  }

  // Legacy aliases inside /auth/* for existing client compatibility
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePasswordAlias(
    @Req() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const res = await this.authService.changeOwnPassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
      req.user.sessionFamily,
    );
    return apiEnvelope(res, 'Password changed', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  async setup2faAlias(@Req() req: any) {
    const res = await this.authService.setup2FA(req.user.id);
    return apiEnvelope(res, '2FA setup initiated', res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('setup-2fa')
  async setup2faGetAlias(@Req() req: any) {
    const res = await this.authService.setup2FA(req.user.id);
    return apiEnvelope(res, '2FA setup initiated', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('setup-2fa')
  async setup2faPostAlias(@Req() req: any) {
    const res = await this.authService.setup2FA(req.user.id);
    return apiEnvelope(res, '2FA setup initiated', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/verify-setup')
  async verify2faAlias(@Req() req: any, @Body() body: { otp?: string; code?: string }) {
    const res = await this.authService.verifySetup2FA(req.user.id, body.otp || body.code || '');
    return apiEnvelope(res, '2FA enabled', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable-2fa')
  async enable2faAlias(@Req() req: any, @Body() body: { otp?: string; code?: string }) {
    const res = await this.authService.verifySetup2FA(req.user.id, body.otp || body.code || '');
    return apiEnvelope(res, 'Two-Factor Authentication enabled', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('disable-2fa')
  async disable2faAlias(
    @Req() req: any,
    @Body() body: { password?: string; otp?: string; code?: string },
  ) {
    const res = await this.authService.disable2FA(
      req.user.id,
      body?.password || '',
      body?.otp || body?.code || '',
    );
    return apiEnvelope(res, 'Two-Factor Authentication disabled', res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('revoke-sessions')
  async revokeOtherSessionsAlias(@Req() req: any) {
    const res = await this.authService.revokeOtherSessions(req.user);
    return apiEnvelope(res, 'All other sessions revoked', res);
  }
}

@ApiTags('Security & 2FA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('security')
export class SecurityController {
  constructor(private readonly authService: AuthService) {}

  @Post('2fa/setup')
  async setup2FA(@Req() req: any) {
    const res = await this.authService.setup2FA(req.user.id);
    return apiEnvelope(res, 'Scan the QR code in Google Authenticator', res);
  }

  @Post('2fa/verify')
  async verify2FA(@Req() req: any, @Body() body: { otp?: string; code?: string }) {
    const res = await this.authService.verifySetup2FA(req.user.id, body.otp || body.code || '');
    return apiEnvelope(res, 'Two-Factor Authentication enabled', res);
  }

  @Post('2fa/disable')
  async disable2FA(
    @Req() req: any,
    @Body() body: { password: string; otp?: string; code?: string },
  ) {
    const res = await this.authService.disable2FA(
      req.user.id,
      body.password,
      body.otp || body.code || '',
    );
    return apiEnvelope(res, 'Two-Factor Authentication disabled', res);
  }

  @Post('2fa/regenerate-backup-codes')
  async regenerateBackup(@Req() req: any, @Body('password') password: string) {
    const res = await this.authService.regenerateBackupCodes(req.user.id, password);
    return apiEnvelope(res, 'Backup codes regenerated (shown once)', res);
  }

  @Roles('SUPER_ADMIN')
  @Get('password-policy')
  async getPolicy() {
    const policy = await this.authService.getPasswordPolicy();
    return apiEnvelope(policy, undefined, { policy });
  }

  @Roles('SUPER_ADMIN')
  @Put('password-policy')
  async updatePolicy(@Body() body: any, @Req() req: any) {
    const policy = await this.authService.updatePasswordPolicy(body, req.user.id);
    return apiEnvelope(policy, 'Password policy updated', { policy });
  }
}

@ApiTags('Sessions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  async list(@Req() req: any) {
    const sessions = await this.authService.listSessions(req.user);
    return apiEnvelope(sessions, undefined, { sessions });
  }

  @Delete(':id')
  async revoke(@Param('id') id: string, @Req() req: any) {
    const res = await this.authService.revokeSession(id, req.user);
    return apiEnvelope(res, 'Session revoked', res);
  }
}
