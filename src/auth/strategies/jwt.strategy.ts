import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super-secret-key-for-auction-system-2026',
    });
  }

  async validate(payload: any) {
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch (err) {
      throw new UnauthorizedException('Phiên đăng nhập của bạn đã hết hạn hoặc không tồn tại. Vui lòng đăng nhập lại.');
    }

    if (!user) {
      throw new UnauthorizedException('Phiên đăng nhập của bạn đã hết hạn hoặc không tồn tại. Vui lòng đăng nhập lại.');
    }
    
    // Nếu user bị khoá (BANNED) thì không cho phép qua api gửi Authorization Token
    if (user.status === 'BANNED') {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa do vi phạm quy định.');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
