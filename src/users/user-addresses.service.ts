import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export class CreateAddressDto {
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  detailAddress: string;
  isDefault?: boolean;
}

export class UpdateAddressDto {
  recipientName?: string;
  phone?: string;
  province?: string;
  district?: string;
  ward?: string;
  detailAddress?: string;
  isDefault?: boolean;
}

@Injectable()
export class UserAddressesService {
  constructor(private prisma: PrismaService) {}

  async getAddresses(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAddress(userId: string, addressId: string) {
    const address = await this.prisma.userAddress.findUnique({
      where: { id: addressId },
    });

    if (!address || address.userId !== userId) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const isDefault = dto.isDefault || false;

    return this.prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (isDefault) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      // If this is the user's first address, force it to be default
      const count = await tx.userAddress.count({ where: { userId } });
      const finalIsDefault = count === 0 ? true : isDefault;

      return tx.userAddress.create({
        data: {
          userId,
          recipientName: dto.recipientName,
          phone: dto.phone,
          phoneVerified: false, // Must be verified
          province: dto.province,
          district: dto.district,
          ward: dto.ward,
          detailAddress: dto.detailAddress,
          isDefault: finalIsDefault,
        },
      });
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.getAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      // If setting as default, unset other defaults
      if (dto.isDefault === true) {
        await tx.userAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const phoneChanged = dto.phone && dto.phone !== address.phone;
      const phoneVerified = phoneChanged ? false : undefined;

      return tx.userAddress.update({
        where: { id: addressId },
        data: {
          recipientName: dto.recipientName,
          phone: dto.phone,
          phoneVerified, // Reset verification if phone number changed
          province: dto.province,
          district: dto.district,
          ward: dto.ward,
          detailAddress: dto.detailAddress,
          isDefault: dto.isDefault,
        },
      });
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.getAddress(userId, addressId);

    await this.prisma.$transaction(async (tx) => {
      await tx.userAddress.delete({
        where: { id: addressId },
      });

      // If we deleted the default address, set another address as default
      if (address.isDefault) {
        const nextAddress = await tx.userAddress.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextAddress) {
          await tx.userAddress.update({
            where: { id: nextAddress.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { success: true };
  }

  async setDefaultAddress(userId: string, addressId: string) {
    await this.getAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.userAddress.update({
        where: { id: addressId },
        data: { isDefault: true },
      });
    });
  }

  async sendOtp(userId: string, addressId: string) {
    const address = await this.getAddress(userId, addressId);
    
    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins expiry

    await this.prisma.otpVerification.upsert({
      where: { phone: address.phone },
      update: { otp, expiresAt, createdAt: new Date() },
      create: { phone: address.phone, otp, expiresAt },
    });

    // In demo environment, we print and return the OTP directly for ease of use
    console.log(`[DEMO OTP] Phone: ${address.phone}, OTP: ${otp}`);

    return {
      message: 'Mã OTP đã được gửi (Demo: xem trong phản hồi hoặc Console log)',
      otp, // return OTP in response for demo ease
    };
  }

  async verifyOtp(userId: string, addressId: string, otp: string) {
    const address = await this.getAddress(userId, addressId);

    const verification = await this.prisma.otpVerification.findUnique({
      where: { phone: address.phone },
    });

    if (!verification) {
      throw new BadRequestException('Mã xác thực không tồn tại hoặc đã hết hạn');
    }

    if (verification.otp !== otp) {
      throw new BadRequestException('Mã OTP không chính xác');
    }

    if (new Date() > verification.expiresAt) {
      throw new BadRequestException('Mã OTP đã hết hạn');
    }

    // Mark as verified and delete OTP
    await this.prisma.$transaction([
      this.prisma.userAddress.update({
        where: { id: addressId },
        data: { phoneVerified: true },
      }),
      this.prisma.otpVerification.delete({
        where: { id: verification.id },
      }),
    ]);

    return { success: true, message: 'Xác thực số điện thoại thành công!' };
  }
}
