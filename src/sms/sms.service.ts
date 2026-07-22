import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: Twilio | null = null;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (accountSid && authToken) {
      try {
        this.twilioClient = new Twilio(accountSid, authToken);
        this.logger.log('Twilio SMS Client initialized.');
      } catch (error) {
        this.logger.error('Failed to initialize Twilio client', error);
      }
    }
  }

  async sendSmsOtp(phone: string, otp: string): Promise<boolean> {
    const formattedPhone = this.formatPhone(phone);
    const body = `[AuctionHub] Ma OTP xac thuc so dien thoai cua ban la: ${otp}. Ma co hieu luc trong 5 phut.`;

    // 1. Ưu tiên gửi qua SpeedSMS.vn nếu có SPEEDSMS_ACCESS_TOKEN
    const speedSmsToken = process.env.SPEEDSMS_ACCESS_TOKEN || '0roKgxr7lx8gm6ZkVfkQOxiZ-BZ9TOhf';
    if (speedSmsToken) {
      try {
        const rawPhone = phone.replace(/\D/g, '');
        const authHeader = 'Basic ' + Buffer.from(`${speedSmsToken}:x`).toString('base64');
        const res = await fetch('https://api.speedsms.vn/index.php/sms/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            to: [rawPhone],
            content: body,
            sms_type: 2,
            sender: '',
          }),
        });

        const data: any = await res.json();
        if (data && data.status === 'success') {
          this.logger.log(`SpeedSMS OTP sent successfully to ${rawPhone}`);
          return true;
        } else {
          this.logger.warn(`SpeedSMS response warning: ${JSON.stringify(data)}`);
        }
      } catch (err) {
        this.logger.error('Failed to send SpeedSMS OTP', err);
      }
    }

    // 2. Dự phòng gửi qua Twilio
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (this.twilioClient && fromNumber) {
      try {
        const message = await this.twilioClient.messages.create({
          body,
          from: fromNumber,
          to: formattedPhone,
        });
        this.logger.log(`Twilio SMS sent successfully to ${formattedPhone}. SID: ${message.sid}`);
        return true;
      } catch (error) {
        this.logger.error(`Failed to send Twilio SMS to ${formattedPhone}`, error);
      }
    }

    this.logger.log(`[SMS OTP LOG] Phone: ${phone}, OTP: ${otp}`);
    return false;
  }

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '84' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }
}
