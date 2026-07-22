import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private clients = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // Unique key per authenticated user ID or client IP
    const clientKey = req.user?.userId || req.ip || 'anonymous';
    const now = Date.now();

    if (!this.clients.has(clientKey)) {
      this.clients.set(clientKey, []);
    }

    const timestamps = this.clients.get(clientKey)!;
    // Sliding window: keep timestamps within the last 10 seconds (10,000ms)
    const windowMs = 10000;
    const maxRequests = 5;

    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxRequests) {
      throw new HttpException(
        'Bạn đang thao tác quá nhanh! Để tránh nghẽn hệ thống, vui lòng đợi 10 giây trước khi tiếp tục đặt giá.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    validTimestamps.push(now);
    this.clients.set(clientKey, validTimestamps);
    return true;
  }
}
