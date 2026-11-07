import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  identifier?: string;

  @IsString()
  password: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
