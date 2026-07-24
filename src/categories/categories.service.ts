import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: createCategoryDto.slug }
    });
    if (existing) throw new BadRequestException('Category slug already exists');

    return this.prisma.category.create({
      data: createCategoryDto
    });
  }

  async findAll() {
    const list = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    const hasOther = list.some((c) => c.name === 'Khác' || c.slug === 'khac');
    if (!hasOther) {
      try {
        const newCat = await this.prisma.category.create({
          data: { name: 'Khác', slug: 'khac' },
        });
        list.push(newCat);
      } catch {
        // Ignore if already created concurrently
      }
    }
    return list;
  }

  async findOne(id: string) {
    return this.prisma.category.findUnique({ where: { id } });
  }
}
