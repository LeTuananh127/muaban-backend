import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAddressesController } from './user-addresses.controller';
import { UserAddressesService } from './user-addresses.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [UsersController, UserAddressesController],
  providers: [UsersService, UserAddressesService],
  exports: [UsersService, UserAddressesService]
})
export class UsersModule {}
