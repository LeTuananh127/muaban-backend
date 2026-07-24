import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || 'letuananh1207204@gmail.com';
    const pass = process.env.SMTP_PASS || 'ycidtukrduwjcbbh';

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`SMTP Mailer initialized with user: ${user}`);
    } else {
      this.logger.warn('SMTP credentials (SMTP_USER / SMTP_PASS) not provided. Email notifications will be logged to console.');
    }
  }

  private async sendMail(to: string, subject: string, html: string) {
    const from = process.env.SMTP_FROM || '"AuctionHub" <letuananh1207204@gmail.com>';
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({ from, to, subject, html });
        this.logger.log(`Email sent to ${to}: ${info.messageId}`);
        return true;
      } catch (error) {
        this.logger.error(`Failed to send email to ${to}`, error);
        return false;
      }
    } else {
      this.logger.log(`[MOCK EMAIL SENT]\nTo: ${to}\nSubject: ${subject}\nBody: ${html.substring(0, 150)}...`);
      return true;
    }
  }

  async sendVerificationEmail(toEmail: string, userName: string, token: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://muabandocuui.vercel.app';
    const verifyLink = `${appUrl}/verify-email?token=${token}`;
    const subject = '🔑 [AuctionHub] Xác thực địa chỉ email tài khoản của bạn';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;">
        <h2 style="color: #7c3aed; text-align: center;">Chào mừng ${userName} đến với AuctionHub!</h2>
        <p>Cảm ơn bạn đã đăng ký tài khoản tại nền tảng đấu giá trực tuyến AuctionHub.</p>
        <p>Vui lòng bấm vào nút bên dưới để hoàn tất xác thực địa chỉ email của bạn:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyLink}" style="background: linear-gradient(135deg, #7c3aed, #c026d3); color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Kích hoạt tài khoản</a>
        </div>
        <p style="color: #666; font-size: 13px;">Hoặc copy đường dẫn này paste vào trình duyệt: <a href="${verifyLink}">${verifyLink}</a></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">AuctionHub - Sàn Đấu Giá Trực Tuyến Hàng Đầu</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html);
  }

  async sendOutbidNotification(toEmail: string, userName: string, auctionTitle: string, newPrice: number, auctionId: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://muabandocuui.vercel.app';
    const auctionLink = `${appUrl}/auction/${auctionId}`;
    const subject = `⚡ [AuctionHub] Mức giá của bạn tại "${auctionTitle}" đã bị vượt!`;
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
    const appUrl = process.env.FRONTEND_URL || 'https://muabandocuui.vercel.app';
    const checkoutLink = `${appUrl}/checkout/${orderId}`;
    const subject = `🎉 [AuctionHub] CHÚC MỪNG! Bạn đã thắng phiên đấu giá "${auctionTitle}"`;
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
    const subject = `📱 [AuctionHub] Mã OTP xác thực số điện thoại: ${otp}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #7c3aed; text-align: center; margin-bottom: 20px;">Mã xác thực số điện thoại</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Bạn vừa yêu cầu gửi mã xác thực OTP để xác minh số điện thoại <strong>${phone}</strong> tại tài khoản AuctionHub.</p>
        <div style="text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #7c3aed; background: #f3e8ff; padding: 12px 24px; border-radius: 8px; font-family: monospace; display: inline-block;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 13px; text-align: center;">Mã OTP có hiệu lực trong 5 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">AuctionHub - Sàn Đấu Giá Trực Tuyến Hàng Đầu</p>
      </div>
    `;
    return this.sendMail(toEmail, subject, html);
  }
}
