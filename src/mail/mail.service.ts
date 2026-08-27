import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as dns from 'dns';
import { PrismaService } from '../prisma/prisma.service';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(@Optional() private prisma?: PrismaService) {
    const user = 'letuananh1207204@gmail.com';
    const pass = 'ycidtukrduwjcbbh';

    try {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      } as any);
      this.logger.log(`SMTP Mailer initialized with user: ${user} (Port 465 Direct SSL IPv4)`);
    } catch (err) {
      this.logger.error('Failed to initialize nodemailer transporter', err);
    }
  }

  private async isEmailNotificationEnabled(toEmail: string): Promise<boolean> {
    if (!this.prisma) return true;
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: toEmail },
        select: { emailNotifications: true },
      });
      if (user && user.emailNotifications === false) {
        return false;
      }
    } catch (_) {}
    return true;
  }

  private async sendMail(to: string, subject: string, html: string, isSystemCritical: boolean = false) {
    if (!isSystemCritical) {
      const isEnabled = await this.isEmailNotificationEnabled(to);
      if (!isEnabled) {
        this.logger.log(`[EMAIL SKIPPED] User ${to} has disabled email notifications.`);
        return false;
      }
    }
    // 1. ƯU TIÊN CAO NHẤT: Brevo HTTP REST API (Port 443 HTTPS)
    //    - Gửi được tới MỌI email trên thế giới (không bị giới hạn domain)
    //    - Không bị Render firewall chặn (port 443)
    //    - Free 300 email/ngày
    //    Set BREVO_API_KEY=xkeysib-... trong Render Dashboard > Environment
    const brevoKey = (process.env.BREVO_API_KEY || '').trim();
    if (brevoKey && brevoKey.startsWith('xkeysib-')) {
      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Bazaar', email: 'letuananh1207204@gmail.com' },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });
        const data: any = await res.json();
        if (res.ok && data.messageId) {
          this.logger.log(`[Brevo HTTP API] ✅ Email sent to ${to}: ${data.messageId}`);
          return true;
        } else {
          this.logger.warn(`[Brevo HTTP API] Warning for ${to}: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error('[Brevo HTTP API] Failed to send email', err);
      }
    }

    // 2. Fallback: Resend HTTP REST API (Port 443 HTTPS)
    //    Lưu ý: Resend free tier chỉ gửi được về letuananh1207204@gmail.com
    const resendKey = (process.env.RESEND_API_KEY || '').trim();
    if (resendKey && resendKey.startsWith('re_')) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Bazaar <onboarding@resend.dev>',
            to: [to],
            subject,
            html,
          }),
        });
        const data: any = await res.json();
        if (res.ok && data.id) {
          this.logger.log(`[Resend HTTP API] ✅ Email sent to ${to}: ${data.id}`);
          return true;
        } else {
          this.logger.warn(`[Resend HTTP API] Warning for ${to}: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error('[Resend HTTP API] Failed to send email', err);
      }
    }

    // 3. Gửi qua Nodemailer SMTP Gmail (Cổng 465 SSL Direct IPv4)
    const from = '"Bazaar" <letuananh1207204@gmail.com>';

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        family: 4,
        auth: { user: 'letuananh1207204@gmail.com', pass: 'ycidtukrduwjcbbh' },
        tls: { rejectUnauthorized: false },
      } as any);
    }

    try {
      const info = await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Primary Port 465 send failed for ${to}, retrying fallback...`, error);
      try {
        const fallbackTransporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          family: 4,
          auth: { user: 'letuananh1207204@gmail.com', pass: 'ycidtukrduwjcbbh' },
          tls: { rejectUnauthorized: false },
        } as any);
        const info = await fallbackTransporter.sendMail({ from, to, subject, html });
        this.logger.log(`Fallback email sent to ${to}: ${info.messageId}`);
        return true;
      } catch (fallbackError) {
        this.logger.error(`Fallback failed to send email to ${to}`, fallbackError);
        return false;
      }
    }
  }

  async sendVerificationEmail(toEmail: string, userName: string, token: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://bazzarr.vercel.app';
    const verifyLink = `${appUrl}/verify-email?token=${token}`;
    const subject = '🔑 [Bazaar] Xác thực địa chỉ email tài khoản của bạn';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;">
        <h2 style="color: #7c3aed; text-align: center;">Chào mừng ${userName} đến với Bazaar!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản tại ứng dụng bán và mua đồ cũ bằng đấu giá Bazaar (bazaar.vn).</p>
        <p>Vui lòng bấm vào nút bên dưới để hoàn tất xác thực địa chỉ email của bạn:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background: linear-gradient(135deg, #7c3aed, #c026d3); color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Kích hoạt tài khoản</a>
        </div>
        <p style="color: #666; font-size: 13px;">Hoặc copy đường dẫn này paste vào trình duyệt: <a href="${verifyLink}">${verifyLink}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">Bazaar (bazaar.vn) - Ứng Dụng Bán & Mua Đồ Cũ Bằng Đấu Giá</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html, true);
  }

  async sendOutbidNotification(toEmail: string, userName: string, auctionTitle: string, newPrice: number, auctionId: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://bazzarr.vercel.app';
    const auctionLink = `${appUrl}/auction/${auctionId}`;
    const subject = `⚡ [Bazaar] Mức giá của bạn tại "${auctionTitle}" đã bị vượt!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fef3c7; background-color: #fffbbb; border-radius: 12px;">
        <h2 style="color: #d97706;">Thông báo vượt giá đấu!</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Vừa có người đặt mức giá thầu cao hơn bạn tại phiên đấu giá <strong>"${auctionTitle}"</strong>.</p>
        <p style="font-size: 18px; color: #dc2626;"><strong>Mức giá mới hiện tại: ${newPrice.toLocaleString('vi-VN')} đ</strong></p>
        <p>Đừng để mất cơ hội sở hữu sản phẩm này! Bấm bên dưới để ra giá mới ngay lập tức:</p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${auctionLink}" style="background-color: #d97706; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Đặt giá mới ngay</a>
        </div>
      </div>
    `;
    return this.sendMail(toEmail, subject, html);
  }

  async sendAuctionWonNotification(toEmail: string, userName: string, auctionTitle: string, winningPrice: number, orderId: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://bazzarr.vercel.app';
    const checkoutLink = `${appUrl}/checkout/${orderId}`;
    const subject = `🎉 [Bazaar] CHÚC MỪNG! Bạn đã thắng phiên đấu giá "${auctionTitle}"`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #dcfce7; background-color: #f0fdf4; border-radius: 12px;">
        <h2 style="color: #16a34a; text-align: center;">🎉 Xin chúc mừng bạn đã chiến thắng!</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Bạn đã trở thành người chiến thắng phiên đấu giá <strong>"${auctionTitle}"</strong> với mức giá thầu thành công là:</p>
        <h3 style="font-size: 24px; color: #16a34a; text-align: center;">${winningPrice.toLocaleString('vi-VN')} đ</h3>
        <p>Vui lòng tiến hành thanh toán đơn hàng để nhận sản phẩm:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${checkoutLink}" style="background-color: #16a34a; color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Thanh toán đơn hàng ngay</a>
        </div>
      </div>
    `;
    return this.sendMail(toEmail, subject, html);
  }

  async sendPhoneOtpEmail(toEmail: string, userName: string, phone: string, otp: string) {
    const subject = `📱 [Bazaar] Mã OTP xác thực số điện thoại: ${otp}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #7c3aed; text-align: center; margin-bottom: 20px;">Mã xác thực số điện thoại</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Bạn vừa yêu cầu gửi mã xác thực OTP để xác minh số điện thoại <strong>${phone}</strong> tại tài khoản Bazaar.</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #7c3aed; background: #f3e8ff; padding: 12px 24px; border-radius: 8px; font-family: monospace; display: inline-block;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Mã OTP có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">Bazaar (bazaar.vn) - Ứng Dụng Bán & Mua Đồ Cũ Bằng Đấu Giá</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html);
  }

  async sendPasswordResetEmail(toEmail: string, userName: string, token: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://bazzarr.vercel.app';
    const resetLink = `${appUrl}/reset-password?token=${token}`;
    const subject = '🔑 [Bazaar] Yêu cầu khôi phục mật khẩu tài khoản';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #7c3aed; text-align: center;">Khôi phục mật khẩu tài khoản</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Bạn nhận được email này vì hệ thống ghi nhận yêu cầu khôi phục mật khẩu từ tài khoản của bạn tại Bazaar (bazaar.vn).</p>
        <p>Vui lòng bấm vào nút bên dưới để tiến hành đổi mật khẩu mới (Liên kết này có hiệu lực trong vòng 15 phút):</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: linear-gradient(135deg, #7c3aed, #c026d3); color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Khôi phục mật khẩu</a>
        </div>
        <p style="color: #666; font-size: 13px;">Hoặc copy đường dẫn này paste vào trình duyệt: <a href="${resetLink}">${resetLink}</a></p>
        <p style="color: #ff3b30; font-size: 13px; font-weight: bold;">Lưu ý: Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này hoặc đổi mật khẩu ngay để bảo mật tài khoản.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">Bazaar (bazaar.vn) - Ứng Dụng Bán & Mua Đồ Cũ Bằng Đấu Giá</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html, true);
  }

  async sendWithdrawOtpEmail(toEmail: string, userName: string, amount: number, bankName: string, accountNo: string, otp: string) {
    const subject = `🔒 [Bazaar 2FA] Mã OTP xác thực yêu cầu rút tiền: ${otp}`;
    const formattedAmount = amount.toLocaleString('vi-VN');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 550px; margin: 0 auto; padding: 24px; border: 1px solid #e0e7ff; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="background-color: #7c3aed; color: #ffffff; font-weight: 900; padding: 4px 12px; border-radius: 6px; font-size: 18px; letter-spacing: 1px;">BAZAAR</span>
          <h2 style="color: #4338ca; margin-top: 12px; font-size: 20px;">Xác thực 2 bước rút tiền (2FA OTP)</h2>
        </div>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Hệ thống nhận được yêu cầu rút tiền từ Ví điện tử Bazaar của bạn với thông tin chi tiết:</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 16px 0; font-size: 14px; line-height: 1.6;">
          <div>💰 <strong>Số tiền yêu cầu:</strong> <span style="color: #dc2626; font-weight: bold; font-size: 16px;">${formattedAmount} VNĐ</span></div>
          <div>🏦 <strong>Ngân hàng nhận:</strong> <strong>${bankName}</strong></div>
          <div>💳 <strong>Số tài khoản:</strong> <span style="font-family: monospace; font-weight: bold;">${accountNo}</span></div>
        </div>

        <p>Để hoàn tất lệnh rút tiền an toàn, vui lòng nhập mã xác thực OTP 6 số dưới đây vào hệ thống:</p>
        
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #7c3aed; background: #f3e8ff; padding: 12px 28px; border-radius: 10px; font-family: monospace; display: inline-block; border: 2px dashed #c084fc;">${otp}</span>
        </div>

        <p style="color: #64748b; font-size: 13px; text-align: center;">⏰ Mã OTP này có hiệu lực trong vòng <strong>5 phút</strong>.</p>
        <p style="color: #ef4444; font-size: 12px; font-weight: bold; margin-top: 16px;">⚠️ CẢNH BÁO BẢO MẬT: Tuyệt đối KHÔNG cung cấp mã OTP này cho bất kỳ ai, kể cả nhân viên hỗ trợ của sàn để tránh bị chiếm đoạt tài sản.</p>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">Bazaar - Sàn TMĐT & Đấu Giá Đồ Cũ An Toàn | Hỗ trợ: 1900 8888</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html, true);
  }
}
