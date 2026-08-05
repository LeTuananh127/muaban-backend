import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: createCategoryDto.slug }
    });
    if (existing) throw new BadRequestException('Slug danh mục đã tồn tại');

    return this.prisma.category.create({
      data: createCategoryDto
    });
  }

  async findAll() {
    const list = await this.prisma.category.findMany({
      include: {
        _count: {
          select: { products: true }
        }
      },
      orderBy: { name: 'asc' },
    });
    const hasOther = list.some((c) => c.name === 'Khác' || c.slug === 'khac');
    if (!hasOther) {
      try {
        const newCat = await this.prisma.category.create({
          data: { name: 'Khác', slug: 'khac' },
          include: {
            _count: {
              select: { products: true }
            }
          }
        });
        list.push(newCat);
      } catch {
        // Ignore if already created concurrently
      }
    }
    const normal = list.filter((c) => c.name !== 'Khác' && c.slug !== 'khac');
    const other = list.filter((c) => c.name === 'Khác' || c.slug === 'khac');
    normal.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return [...normal, ...other];
  }

  async findOne(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
  }

  async update(id: string, updateDto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    if (updateDto.slug && updateDto.slug !== category.slug) {
      const existingSlug = await this.prisma.category.findUnique({
        where: { slug: updateDto.slug }
      });
      if (existingSlug) throw new BadRequestException('Slug danh mục đã tồn tại');
    }

    return this.prisma.category.update({
      where: { id },
      data: updateDto,
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });
    if (!category) throw new NotFoundException('Không tìm thấy danh mục');

    if (category._count.products > 0) {
      throw new BadRequestException(`Không thể xóa danh mục đang có ${category._count.products} sản phẩm. Hãy chuyển sản phẩm sang danh mục khác trước.`);
    }

    return this.prisma.category.delete({ where: { id } });
  }
}

