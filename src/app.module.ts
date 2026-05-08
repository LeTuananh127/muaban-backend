import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { AuctionsModule } from './auctions/auctions.module';
import { BidsModule } from './bids/bids.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { AdminModule } from './admin/admin.module';
import { FavoritesModule } from './favorites/favorites.module';
import { OrdersModule } from './orders/orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { MessagesModule } from './messages/messages.module';
import { TasksModule } from './tasks/tasks.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, UsersModule, ProductsModule, AuctionsModule, BidsModule, AuthModule, CategoriesModule, AdminModule, FavoritesModule, OrdersModule, ReviewsModule, MessagesModule, TasksModule, UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
