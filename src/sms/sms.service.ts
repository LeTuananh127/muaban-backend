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
    const body = `[Bazaar] Ma OTP xac thuc so dien thoai cua ban la: ${otp}. Ma co hieu luc trong 5 phut.`;

    // 0. Ưu tiên cao nhất: Brevo Transactional SMS API (nếu có BREVO_API_KEY)
    const brevoKey = (process.env.BREVO_API_KEY || '').trim();
    if (brevoKey && brevoKey.startsWith('xkeysib-')) {
      try {
        let brevoPhone = phone.replace(/\D/g, '');
        if (brevoPhone.startsWith('0')) {
          brevoPhone = '84' + brevoPhone.substring(1);
        }
        if (!brevoPhone.startsWith('+')) {
          brevoPhone = '+' + brevoPhone;
        }

        const smsRes = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: 'Bazaar',
            recipient: brevoPhone,
            content: body,
            type: 'transactional',
          }),
        });

        const smsData: any = await smsRes.json();
        if (smsRes.ok && (smsData.messageId || smsData.reference)) {
          this.logger.log(`[Brevo SMS] ✅ Transactional SMS sent to ${brevoPhone}: ${smsData.messageId || smsData.reference}`);
          return true;
        } else {
          this.logger.warn(`[Brevo SMS Warning] ${JSON.stringify(smsData)}`);
        }
      } catch (err) {
        this.logger.error('[Brevo SMS Error] Failed to send Transactional SMS', err);
      }
    }

    // 0. Ưu tiên gửi qua Zalo ZNS API nếu có ZALO_ZNS_ACCESS_TOKEN và ZALO_ZNS_TEMPLATE_ID
    const zaloToken = process.env.ZALO_ZNS_ACCESS_TOKEN;
    const zaloTemplateId = process.env.ZALO_ZNS_TEMPLATE_ID;
    if (zaloToken && zaloTemplateId) {
      try {
        let zaloPhone = phone.replace(/\D/g, '');
        if (zaloPhone.startsWith('0')) {
          zaloPhone = '84' + zaloPhone.substring(1);
        }
        const trackingId = `otp_${Date.now()}`;
        const res = await fetch('https://business.openapi.zalo.me/message/template', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': zaloToken,
          },
          body: JSON.stringify({
            phone: zaloPhone,
            template_id: zaloTemplateId,
            template_data: {
              otp,
              code: otp,
              pin_code: otp,
            },
            tracking_id: trackingId,
          }),
        });

        const data: any = await res.json();
        if (data && data.error === 0) {
          this.logger.log(`Zalo ZNS OTP sent successfully to ${zaloPhone}. MsgID: ${data.data?.msg_id}`);
          return true;
        } else {
          this.logger.warn(`Zalo ZNS error (${data?.error}): ${data?.message}`);
        }
      } catch (err) {
        this.logger.error('Failed to send Zalo ZNS OTP', err);
      }
    }

    // 1. Gửi qua SpeedSMS.vn 2FA API
    const speedSmsToken = process.env.SPEEDSMS_ACCESS_TOKEN || '0roKgxr7lx8gm6ZkVfkQOxiZ-BZ9TOhf';
    const speedSmsAppId = process.env.SPEEDSMS_APP_ID || 'sM3M-XXxWl7AnmFB6yMHDYHtrrKgEfKv';
    if (speedSmsToken && speedSmsAppId) {
      try {
        const rawPhone = phone.replace(/\D/g, '');
        const authHeader = 'Basic ' + Buffer.from(`${speedSmsToken}:x`).toString('base64');
        const res = await fetch('https://api.speedsms.vn/index.php/pin/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({
            to: rawPhone,
            content: `Ma so xac nhan cua ban la: ${otp}`,
            app_id: speedSmsAppId,
          }),
        });

        const data: any = await res.json();
        if (data && (data.status === 'success' || data.code === '00')) {
          this.logger.log(`SpeedSMS 2FA OTP sent successfully to ${rawPhone}`);
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
