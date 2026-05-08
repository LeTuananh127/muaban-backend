import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cấu hình ValidationPipe để tự động validate Input DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Lọc bỏ những object keys không có trong DTO
      forbidNonWhitelisted: true, // Chặn nếu request gửi lên key thừa
      transform: true, // Tự động transform payload về object DTO
    }),
  );

  // Enable CORS
  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
