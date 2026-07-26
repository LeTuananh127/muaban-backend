import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security Headers using Helmet
  app.use(
    helmet({
      crossOriginResourcePolicy: false, // Allows cross-origin image/static loading
    }),
  );

  // Cấu hình ValidationPipe để tự động validate Input DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Lọc bỏ những object keys không có trong DTO
      forbidNonWhitelisted: true, // Chặn nếu request gửi lên key thừa
      transform: true, // Tự động transform payload về object DTO
    }),
  );

  // Enable CORS securely
  app.enableCors({
    origin: true, // Allow frontend origin dynamically
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
