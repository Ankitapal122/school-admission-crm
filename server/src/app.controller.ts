import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'BoardingEdu Enterprise CRM',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('api/health')
  getApiHealth() {
    return this.getHealth();
  }

  @Get('ping')
  getPing() {
    return { pong: true };
  }

  @Get()
  getRoot() {
    return {
      status: 'ok',
      service: 'BoardingEdu Enterprise CRM API',
      version: '3.0.0',
      docs: '/api/docs',
      health: '/api/health',
    };
  }
}
