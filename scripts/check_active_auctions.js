const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

async function main() {
  const now = new Date();
  const categories = await prisma.category.findMany();
  for (const cat of categories) {
    const activeCount = await prisma.auction.count({
      where: {
        product: { categoryId: cat.id },
        status: 'ACTIVE',
        endTime: { gt: now }
      }
    });
    const totalCount = await prisma.auction.count({
      where: {
        product: { categoryId: cat.id }
      }
    });
    console.log(`Category: ${cat.name} (${cat.slug}) -> Active: ${activeCount}, Total: ${totalCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
