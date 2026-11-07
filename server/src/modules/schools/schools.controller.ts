import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get()
  async getSchools(
    @Query('city') city?: string,
    @Query('board') board?: string,
    @Query('search') search?: string,
  ) {
    return this.schoolsService.findAll(city, board, search);
  }

  @Get(':id')
  async getSchool(@Param('id') id: string) {
    return this.schoolsService.findOne(id);
  }

  @Post()
  async createSchool(@Body() body: any, @Req() req: any) {
    return this.schoolsService.create(body, req.user);
  }

  @Put(':id')
  async updateSchool(@Param('id') id: string, @Body() body: any) {
    return this.schoolsService.update(id, body);
  }
}
