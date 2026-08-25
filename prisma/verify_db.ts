import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const count = await prisma.product.count();
  console.log('🎉 TOTAL PRODUCTS IN DB:', count);

  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: { products: true }
      }
    }
  });

  console.log('📊 CATEGORY BREAKDOWN:');
  categories.forEach((c: any) => {
    console.log(` - ${c.name} (${c.slug}): ${c._count.products} products`);
  });

  await prisma.$disconnect();
}

check();
