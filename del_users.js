const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const emails = ['letuananh1207204@gmail.com', 'nguyenthimy7479@gmail.com'];
    for (const email of emails) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
            await prisma.verificationToken.deleteMany({ where: { userId: user.id } });
            await prisma.userAddress.deleteMany({ where: { userId: user.id } });
            await prisma.user.delete({ where: { id: user.id } });
            console.log(`Successfully deleted user: ${email}`);
        } else {
            console.log(`User not found: ${email}`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
