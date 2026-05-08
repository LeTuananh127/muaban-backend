import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Backend Smoke (e2e)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  const runId = Date.now().toString();
  const emails = {
    admin: `admin_${runId}@mail.com`,
    seller: `seller_${runId}@mail.com`,
    buyer: `buyer_${runId}@mail.com`,
  };

  let adminToken = '';
  let sellerToken = '';
  let buyerToken = '';

  let adminId = '';
  let sellerId = '';
  let buyerId = '';

  let categoryId = '';
  let productId = '';
  let auctionId = '';
  let orderId = '';
  let reportId = '';
  let adminVerificationToken = '';
  let sellerVerificationToken = '';
  let buyerVerificationToken = '';

  jest.setTimeout(120000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await prisma.$connect();
  });

  afterAll(async () => {
    // Cleanup data created in this test run
    await prisma.report.deleteMany({
      where: {
        OR: [
          { reporterId: { in: [buyerId, sellerId, adminId].filter(Boolean) } },
          { reportedUserId: { in: [buyerId, sellerId, adminId].filter(Boolean) } },
          { auctionId },
        ],
      },
    });

    await prisma.review.deleteMany({
      where: {
        OR: [
          { reviewerId: { in: [buyerId, sellerId].filter(Boolean) } },
          { revieweeId: { in: [buyerId, sellerId].filter(Boolean) } },
        ],
      },
    });

    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderId: { in: [buyerId, sellerId].filter(Boolean) } },
          { receiverId: { in: [buyerId, sellerId].filter(Boolean) } },
        ],
      },
    });

    await prisma.favorite.deleteMany({
      where: {
        OR: [{ userId: buyerId }, { auctionId }],
      },
    });

    await prisma.bid.deleteMany({ where: { auctionId } });
    await prisma.order.deleteMany({ where: { auctionId } });
    await prisma.auction.deleteMany({ where: { id: auctionId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });

    await prisma.user.deleteMany({
      where: {
        email: { in: [emails.admin, emails.seller, emails.buyer] },
      },
    });

    await app.close();
    await prisma.$disconnect();
  });

  it('should execute end-to-end flow for core modules', async () => {
    // 1) Register 3 users
    const adminRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: emails.admin,
        password: '123456',
        name: `Admin ${runId}`,
        role: 'ADMIN',
      })
      .expect(201);
    adminId = adminRegister.body.id;
    adminVerificationToken = adminRegister.body.verificationToken;

    const sellerRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: emails.seller,
        password: '123456',
        name: `Seller ${runId}`,
      })
      .expect(201);
    sellerId = sellerRegister.body.id;
    sellerVerificationToken = sellerRegister.body.verificationToken;

    const buyerRegister = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: emails.buyer,
        password: '123456',
        name: `Buyer ${runId}`,
      })
      .expect(201);
    buyerId = buyerRegister.body.id;
    buyerVerificationToken = buyerRegister.body.verificationToken;

    // 2) Verify emails before login
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: adminVerificationToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: sellerVerificationToken })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: buyerVerificationToken })
      .expect(201);

    // 3) Login all accounts
    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emails.admin, password: '123456' })
      .expect(201);
    adminToken = adminLogin.body.access_token;

    const sellerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emails.seller, password: '123456' })
      .expect(201);
    sellerToken = sellerLogin.body.access_token;

    const buyerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emails.buyer, password: '123456' })
      .expect(201);
    buyerToken = buyerLogin.body.access_token;

    // 4) Seller submits verification and Admin approves seller
    await request(app.getHttpServer())
      .patch('/users/seller-verification/submit')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        shopName: `Shop ${runId}`,
        idNumber: `ID-${runId}`,
        warehouseAddress: 'Hanoi Warehouse',
        bankAccount: '0123456789',
        phone: '0900000000',
      })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/admin/seller-verifications/${sellerId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' })
      .expect(200);

    // 5) Admin creates category
    const categoryRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `Electronics ${runId}`,
        slug: `electronics-${runId}`,
      })
      .expect(201);
    categoryId = categoryRes.body.id;

    // 6) Seller creates product + auction listing (pending approval)
    const listingRes = await request(app.getHttpServer())
      .post('/products/create-listing')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: `iPhone ${runId}`,
        description: 'Good condition',
        images: ['https://example.com/phone.jpg'],
        condition: 'Used',
        location: 'Hanoi',
        categoryId,
        startingPrice: 100000,
        reservePrice: 110000,
        buyNowPrice: 500000,
        shippingCost: 20000,
        endTime: new Date(Date.now() + 3600000).toISOString(),
      })
      .expect(201);

    productId = listingRes.body.product.id;
    auctionId = listingRes.body.auction.id;

    await request(app.getHttpServer())
      .patch(`/admin/listings/${auctionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' })
      .expect(200);

    // 7) Auctions listing + search + suggestions
    await request(app.getHttpServer()).get('/auctions').expect(200);

    const searchRes = await request(app.getHttpServer())
      .get('/auctions/search')
      .query({ q: 'iphone', page: 1, limit: 10 })
      .expect(200);
    expect(Array.isArray(searchRes.body.data)).toBe(true);

    const suggestionRes = await request(app.getHttpServer())
      .get('/auctions/search/suggestions')
      .query({ q: 'iph', limit: 5 })
      .expect(200);
    expect(Array.isArray(suggestionRes.body.data)).toBe(true);

    // 8) Buyer favorites flow
    await request(app.getHttpServer())
      .post(`/favorites/${auctionId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/favorites')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    // 9) Buyer places bid
    await request(app.getHttpServer())
      .post(`/bids/${auctionId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amount: 120000 })
      .expect(201);

    await request(app.getHttpServer()).get(`/bids/${auctionId}`).expect(200);

    // 10) Messaging flow buyer -> seller
    await request(app.getHttpServer())
      .post('/messages')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ receiverId: sellerId, content: 'Hi, I placed a bid.' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/messages/${buyerId}`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/messages/conversations')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    // 11) User profile flow
    await request(app.getHttpServer())
      .get('/users/profile/my-profile')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch('/users/profile/my-profile')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ name: `Seller Updated ${runId}` })
      .expect(200);

    // 12) Upload flow (without file should return 400)
    await request(app.getHttpServer())
      .post('/upload/image')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(400);

    // 13) End auction manually then create order
    await prisma.auction.update({
      where: { id: auctionId },
      data: {
        status: 'ENDED',
        currentWinnerId: buyerId,
        endTime: new Date(Date.now() - 1000),
      },
    });

    const createOrderRes = await request(app.getHttpServer())
      .post(`/orders/${auctionId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(201);

    orderId = createOrderRes.body.id;

    await request(app.getHttpServer())
      .get('/orders/buying')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/orders/selling')
      .set('Authorization', `Bearer ${sellerToken}`)
      .expect(200);

    // 14) Update order statuses
    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ status: 'PAID' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ status: 'SHIPPED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ status: 'DELIVERED' })
      .expect(200);

    // 15) Review flow
    await request(app.getHttpServer())
      .post('/reviews')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ revieweeId: sellerId, rating: 5, comment: 'Great seller' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/reviews/user/${sellerId}`)
      .expect(200);

    // 16) Admin management flow + report resolution
    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get('/admin/listings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const report = await prisma.report.create({
      data: {
        reason: 'Spam listing',
        reporterId: buyerId,
        reportedUserId: sellerId,
        auctionId,
      },
    });
    reportId = report.id;

    await request(app.getHttpServer())
      .get('/admin/reports')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/admin/reports/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RESOLVED' })
      .expect(200);

    // 17) Remove favorite finally
    await request(app.getHttpServer())
      .delete(`/favorites/${auctionId}`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(200);
  });
});
