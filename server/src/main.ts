import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Global middleware
  app.use(cookieParser());

  // Global DTO validation pipe with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS Configuration
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Global API prefix
  app.setGlobalPrefix('api');

  // Serve built React frontend (client/dist) on port 5000 as well
  const clientDistPath = join(process.cwd(), '..', 'client', 'dist');
  if (fs.existsSync(clientDistPath)) {
    app.useStaticAssets(clientDistPath);
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: any, res: any, next: any) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      const indexFile = join(clientDistPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        return res.sendFile(indexFile);
      }
      next();
    });
  }

  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`\n=============================================================`);
  console.log(`🚀 NESTJS ENTERPRISE STUDENT CRM (FULL-STACK)`);
  console.log(`🌐 Frontend + API running at: http://localhost:${port}`);
  console.log(`⚡ Vite Dev Server running at: http://localhost:5173`);
  console.log(`📡 REST API Endpoint: http://localhost:${port}/api`);
  console.log(`🐘 PostgreSQL & Prisma ORM: Ready`);
  console.log(`⚡ Redis & BullMQ Workers: Active`);
  console.log(`🔔 Socket.io Real-time Gateway: Listening`);
  console.log(`=============================================================\n`);
}
bootstrap();
