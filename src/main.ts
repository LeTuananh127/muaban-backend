import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase payload limit for base64 image uploads (e.g. AI vision & document processing)
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

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
