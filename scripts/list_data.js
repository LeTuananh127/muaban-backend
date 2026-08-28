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
  const categories = await prisma.category.findMany({
    include: {
      _count: {
        select: { products: true }
      }
    }
  });
  console.log('=== CATEGORIES IN DB ===');
  console.log(JSON.stringify(categories, null, 2));

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, sellerVerificationStatus: true }
  });
  console.log('=== USERS IN DB ===');
  console.log(JSON.stringify(users, null, 2));

  const totalProducts = await prisma.product.count();
  const totalAuctions = await prisma.auction.count();
  console.log(`Total Products: ${totalProducts}, Total Auctions: ${totalAuctions}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
