import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';

import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name, role } = registerDto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Default role is USER unless specified
    const createdUser = await this.usersService.create({
      email,
      name,
      password: hashedPassword,
      role: role || 'USER',
    });

    const verificationToken = randomUUID();
    await this.prisma.verificationToken.create({
      data: {
        userId: createdUser.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Send real verification email via SMTP/Mailer
    try {
      await this.mailService.sendVerificationEmail(email, name, verificationToken);
      console.log(`[VERIFICATION EMAIL SENT] to ${email} with token: ${verificationToken}`);
    } catch (err) {
      console.error('Failed to send verification email:', err);
    }

    const { password: _, ...result } = createdUser;
    return {
      ...result,
      message: 'Registered successfully. Please verify your email before logging in.',
      verificationToken,
    };
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new BadRequestException('Please verify your email before login');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const tokenRow = await this.prisma.verificationToken.findUnique({
      where: { token: verifyEmailDto.token },
    });

    if (!tokenRow || tokenRow.expiresAt < new Date()) {
      throw new BadRequestException('Verification token is invalid or expired');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRow.userId },
        data: { emailVerified: true },
      }),
      this.prisma.verificationToken.delete({
        where: { id: tokenRow.id },
      }),
    ]);

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);
    if (!user) {
      return { message: 'If your email exists, a reset token has been generated.' };
    }

    const resetToken = randomUUID();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return {
      message: 'Password reset token generated',
      resetToken,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const tokenRow = await this.prisma.passwordResetToken.findUnique({
      where: { token: resetPasswordDto.token },
    });

    if (!tokenRow || tokenRow.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or expired');
    }

    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRow.userId },
        data: { password: hashedPassword },
      }),
      this.prisma.passwordResetToken.delete({
        where: { id: tokenRow.id },
      }),
    ]);

    return { message: 'Password has been reset successfully' };
  }
}
