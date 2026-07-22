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
        this.logger.log(`Twilio SMS Client initialized (Account SID: ${accountSid})`);
      } catch (error) {
        this.logger.error('Failed to initialize Twilio client', error);
      }
    } else {
      this.logger.warn('Twilio credentials not set in environment variables.');
    }
  }

  async sendSmsOtp(phone: string, otp: string): Promise<boolean> {
    const formattedPhone = this.formatPhone(phone);
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const body = `[AuctionHub] Ma OTP xac thuc so dien thoai cua ban la: ${otp}. Ma co hieu luc trong 5 phut.`;

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
        return false;
      }
    } else {
      this.logger.log(`[REAL OTP LOG] To: ${formattedPhone}, Body: ${body}`);
      return false;
    }
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
