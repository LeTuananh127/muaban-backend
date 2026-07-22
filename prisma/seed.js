"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('Starting database seeding...');
    console.log('Clearing existing data...');
    await prisma.bid.deleteMany();
    await prisma.favorite.deleteMany();
    await prisma.report.deleteMany();
    await prisma.message.deleteMany();
    await prisma.review.deleteMany();
    await prisma.walletHold.deleteMany();
    await prisma.walletTransaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.refundRequest.deleteMany();
    await prisma.order.deleteMany();
    await prisma.withdrawRequest.deleteMany();
    await prisma.auction.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    const passwordHash = await bcrypt.hash('Password123', 10);
    console.log('Creating users...');
    const admin = await prisma.user.create({
        data: {
            email: 'admin@email.com',
            password: passwordHash,
            name: 'Quản trị viên',
            role: client_1.Role.ADMIN,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
        },
    });
    const seller1 = await prisma.user.create({
        data: {
            email: 'seller1@email.com',
            password: passwordHash,
            name: 'Nguyễn Văn A',
            avatar: 'https://i.pravatar.cc/150?img=11',
            phone: '0912345678',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
            sellerVerificationStatus: client_1.SellerVerificationStatus.APPROVED,
            shopName: 'A-Store Điện Tử',
            bankAccount: 'Vietcombank - 1023456789 - NGUYEN VAN A',
            warehouseAddress: '123 Đường Cầu Giấy, Cầu Giấy, Hà Nội',
            rating: 4.8,
            totalReviews: 24,
        },
    });
    const seller2 = await prisma.user.create({
        data: {
            email: 'seller2@email.com',
            password: passwordHash,
            name: 'Trần Thị B',
            avatar: 'https://i.pravatar.cc/150?img=20',
            phone: '0987654321',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
            sellerVerificationStatus: client_1.SellerVerificationStatus.APPROVED,
            shopName: 'B-Fashion & Accessories',
            bankAccount: 'Techcombank - 19023456789012 - TRAN THI B',
            warehouseAddress: '456 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội',
            rating: 4.9,
            totalReviews: 18,
        },
    });
    const seller3 = await prisma.user.create({
        data: {
            email: 'seller3@email.com',
            password: passwordHash,
            name: 'Lê Minh C',
            avatar: 'https://i.pravatar.cc/150?img=33',
            phone: '0901234567',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
            sellerVerificationStatus: client_1.SellerVerificationStatus.APPROVED,
            shopName: 'C-Camera & Audio',
            bankAccount: 'MB Bank - 0901234567 - LE MINH C',
            warehouseAddress: '789 Đường Lê Lợi, Quận 1, TP. Hồ Chí Minh',
            rating: 4.6,
            totalReviews: 12,
        },
    });
    const buyer1 = await prisma.user.create({
        data: {
            email: 'buyer1@email.com',
            password: passwordHash,
            name: 'Phạm Minh Đức',
            avatar: 'https://i.pravatar.cc/150?img=12',
            phone: '0934567890',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
        },
    });
    const buyer2 = await prisma.user.create({
        data: {
            email: 'buyer2@email.com',
            password: passwordHash,
            name: 'Hoàng Lan Anh',
            avatar: 'https://i.pravatar.cc/150?img=47',
            phone: '0945678901',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
        },
    });
    const buyer3 = await prisma.user.create({
        data: {
            email: 'buyer3@email.com',
            password: passwordHash,
            name: 'Vũ Quốc Anh',
            avatar: 'https://i.pravatar.cc/150?img=59',
            phone: '0956789012',
            role: client_1.Role.USER,
            status: client_1.UserStatus.ACTIVE,
            emailVerified: true,
        },
    });
    console.log('Creating wallets for users...');
    const users = [admin, seller1, seller2, seller3, buyer1, buyer2, buyer3];
    for (const u of users) {
        const isBuyer = u.email.startsWith('buyer');
        await prisma.wallet.create({
            data: {
                userId: u.id,
                balance: isBuyer ? 100000000 : 5000000,
            },
        });
    }
    console.log('Creating categories...');
    const catPhone = await prisma.category.create({
        data: { name: 'Điện thoại & Phụ kiện', slug: 'dien-thoai-phu-kien' },
    });
    const catLaptop = await prisma.category.create({
        data: { name: 'Máy tính & Laptop', slug: 'may-tinh-laptop' },
    });
    const catCamera = await prisma.category.create({
        data: { name: 'Máy ảnh & Máy quay', slug: 'may-anh-may-quay' },
    });
    const catAudio = await prisma.category.create({
        data: { name: 'Âm thanh & Loa', slug: 'am-thanh-loa' },
    });
    const catWatch = await prisma.category.create({
        data: { name: 'Đồng hồ & Trang sức', slug: 'dong-ho-trang-suc' },
    });
    const catBook = await prisma.category.create({
        data: { name: 'Sách & Truyện tranh', slug: 'sach-truyen-tranh' },
    });
    const catFashion = await prisma.category.create({
        data: { name: 'Thời trang & Giày dép', slug: 'thoi-trang-giay-dep' },
    });
    const now = new Date();
    const past = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const future = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const createAuctionData = async (config) => {
        const product = await prisma.product.create({
            data: {
                title: config.title,
                description: config.description,
                images: config.images,
                condition: config.condition,
                location: config.location,
                status: config.status === client_1.AuctionStatus.ENDED ? client_1.ProductStatus.SOLD : client_1.ProductStatus.IN_AUCTION,
                ownerId: config.seller.id,
                categoryId: config.category.id,
            },
        });
        const auction = await prisma.auction.create({
            data: {
                productId: product.id,
                startingPrice: config.startingPrice,
                currentPrice: config.currentPrice,
                bidIncrement: config.bidIncrement,
                startTime: config.startTime,
                endTime: config.endTime,
                status: config.status,
                views: config.views,
                currentWinnerId: config.bids && config.bids.length > 0 ? config.bids[config.bids.length - 1].buyer.id : null,
            },
        });
        if (config.bids) {
            for (const b of config.bids) {
                await prisma.bid.create({
                    data: {
                        auctionId: auction.id,
                        userId: b.buyer.id,
                        amount: b.amount,
                        createdAt: b.time,
                    },
                });
            }
        }
        return auction;
    };
    console.log('Seeding products & auctions...');
    await createAuctionData({
        title: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên - Nguyên Hộp',
        description: 'Bản chính hãng VN/A mua tại Thế Giới Di Động. Máy đẹp 99% không tì vết, pin còn 98%. Phụ kiện cáp zin chưa dùng kèm hộp.',
        images: [
            'https://images.unsplash.com/photo-1696446702193-e0b7d0de773b?w=800&q=80',
            'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'Hà Nội',
        category: catPhone,
        seller: seller1,
        startingPrice: 22000000,
        currentPrice: 24500000,
        bidIncrement: 500000,
        startTime: past(1),
        endTime: future(2),
        status: client_1.AuctionStatus.ACTIVE,
        views: 125,
        bids: [
            { buyer: buyer1, amount: 22500000, time: past(0.8) },
            { buyer: buyer2, amount: 23000000, time: past(0.5) },
            { buyer: buyer1, amount: 23500000, time: past(0.3) },
            { buyer: buyer3, amount: 24500000, time: past(0.1) },
        ],
    });
    await createAuctionData({
        title: 'Samsung Galaxy S24 Ultra 512GB - Likenew 99%',
        description: 'Màu xám Titanium thời thượng. Hàng chính hãng SSVN còn bảo hành 11 tháng. Kèm ốp lưng Spigen xịn.',
        images: [
            'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'TP. Hồ Chí Minh',
        category: catPhone,
        seller: seller1,
        startingPrice: 20000000,
        currentPrice: 21200000,
        bidIncrement: 300000,
        startTime: past(2),
        endTime: future(1),
        status: client_1.AuctionStatus.ACTIVE,
        views: 89,
        bids: [
            { buyer: buyer2, amount: 20300000, time: past(1.5) },
            { buyer: buyer3, amount: 20900000, time: past(1.0) },
            { buyer: buyer2, amount: 21200000, time: past(0.2) },
        ],
    });
    await createAuctionData({
        title: 'Google Pixel 8 Pro 128GB Quốc Tế',
        description: 'Máy trần, màu Obsidian sang trọng. Trải nghiệm Android gốc mượt mà, camera đỉnh cao. Màn hình không trầy xước.',
        images: [
            'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Đà Nẵng',
        category: catPhone,
        seller: seller1,
        startingPrice: 12000000,
        currentPrice: 13500000,
        bidIncrement: 200000,
        startTime: past(4),
        endTime: past(1),
        status: client_1.AuctionStatus.ENDED,
        views: 210,
        bids: [
            { buyer: buyer1, amount: 12200000, time: past(3.5) },
            { buyer: buyer3, amount: 12800000, time: past(3.0) },
            { buyer: buyer1, amount: 13500000, time: past(1.2) },
        ],
    });
    await createAuctionData({
        title: 'MacBook Pro M3 14 inch 2024 (8CPU/10GPU/16GB/512GB)',
        description: 'Màu Space Gray, mới mua 3 tháng, sạc 15 lần, dung lượng pin 100%. Máy không một vết xước dăm. Bảo hành Apple Care dài hạn.',
        images: [
            'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80',
            'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'Hà Nội',
        category: catLaptop,
        seller: seller1,
        startingPrice: 34000000,
        currentPrice: 36000000,
        bidIncrement: 500000,
        startTime: past(1),
        endTime: future(3),
        status: client_1.AuctionStatus.ACTIVE,
        views: 180,
        bids: [
            { buyer: buyer2, amount: 34500000, time: past(0.8) },
            { buyer: buyer3, amount: 35000000, time: past(0.5) },
            { buyer: buyer2, amount: 36000000, time: past(0.1) },
        ],
    });
    await createAuctionData({
        title: 'Dell XPS 13 Plus 9320 Core i7-1260P/16GB/512GB OLED Touch',
        description: 'Thiết kế đột phá với thanh Touch Bar ẩn. Màn hình OLED 3.5K siêu nét. Máy nhập khẩu Mỹ, nguyên bản 100%.',
        images: [
            'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Hải Phòng',
        category: catLaptop,
        seller: seller3,
        startingPrice: 18000000,
        currentPrice: 19500000,
        bidIncrement: 300000,
        startTime: past(2),
        endTime: future(1),
        status: client_1.AuctionStatus.ACTIVE,
        views: 74,
        bids: [
            { buyer: buyer1, amount: 18300000, time: past(1.2) },
            { buyer: buyer3, amount: 19500000, time: past(0.4) },
        ],
    });
    await createAuctionData({
        title: 'Sony Alpha A7 IV Body - Chính Hãng Likenew',
        description: 'Máy chụp khoảng 3k shot. Ngoại hình hoàn hảo như mới đập hộp. Đầy đủ phụ kiện pin sạc dây đeo zin. Sensor sạch sẽ không bụi xước.',
        images: [
            'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80',
            'https://images.unsplash.com/photo-1606988991744-e875a46725e9?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'TP. Hồ Chí Minh',
        category: catCamera,
        seller: seller3,
        startingPrice: 42000000,
        currentPrice: 43500000,
        bidIncrement: 500000,
        startTime: past(1),
        endTime: future(2),
        status: client_1.AuctionStatus.ACTIVE,
        views: 140,
        bids: [
            { buyer: buyer1, amount: 42500000, time: past(0.8) },
            { buyer: buyer2, amount: 43500000, time: past(0.2) },
        ],
    });
    await createAuctionData({
        title: 'Ống kính Canon RF 50mm f/1.2 L USM',
        description: 'Hàng xách tay Nhật, kính trong veo không mốc rễ. Ngoại hình đẹp xuất sắc. Đủ cáp trước sau và hood zin.',
        images: [
            'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Hà Nội',
        category: catCamera,
        seller: seller3,
        startingPrice: 32000000,
        currentPrice: 34000000,
        bidIncrement: 500000,
        startTime: past(5),
        endTime: past(2),
        status: client_1.AuctionStatus.ENDED,
        views: 95,
        bids: [
            { buyer: buyer2, amount: 32500000, time: past(4.0) },
            { buyer: buyer3, amount: 33500000, time: past(3.0) },
            { buyer: buyer2, amount: 34000000, time: past(2.2) },
        ],
    });
    await createAuctionData({
        title: 'Tai nghe chống ồn Sony WH-1000XM5 Fullbox',
        description: 'Màu bạc cực kỳ thời trang. Mới khui hộp nghe thử vài lần. Hàng chính hãng Sony Việt Nam bảo hành 10 tháng.',
        images: [
            'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'Cần Thơ',
        category: catAudio,
        seller: seller3,
        startingPrice: 5000000,
        currentPrice: 5600000,
        bidIncrement: 100000,
        startTime: past(1),
        endTime: future(1.5),
        status: client_1.AuctionStatus.ACTIVE,
        views: 65,
        bids: [
            { buyer: buyer1, amount: 5100000, time: past(0.8) },
            { buyer: buyer3, amount: 5400000, time: past(0.5) },
            { buyer: buyer1, amount: 5600000, time: past(0.2) },
        ],
    });
    await createAuctionData({
        title: 'Loa Bluetooth Marshall Acton III - Chính Hãng ASH',
        description: 'Loa để bàn phòng ngủ nghe cực chill. Ngoại hình retro sang trọng, âm thanh ấm áp đặc trưng Marshall. Full box tem mác đầy đủ.',
        images: [
            'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Như mới)',
        location: 'Hà Nội',
        category: catAudio,
        seller: seller3,
        startingPrice: 4500000,
        currentPrice: 4700000,
        bidIncrement: 100000,
        startTime: past(3),
        endTime: future(2),
        status: client_1.AuctionStatus.ACTIVE,
        views: 110,
        bids: [
            { buyer: buyer2, amount: 4600000, time: past(2.0) },
            { buyer: buyer3, amount: 4700000, time: past(1.0) },
        ],
    });
    await createAuctionData({
        title: 'Apple Watch Ultra LTE 49mm Titanium - Dây Alpine Loop',
        description: 'Phiên bản chuyên nghiệp vỏ Titanium siêu nhẹ bền bỉ. Máy hoạt động hoàn hảo, pin dùng 2.5 ngày thoải mái. Kèm sạc nhanh Type-C zin.',
        images: [
            'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Bình Dương',
        category: catWatch,
        seller: seller1,
        startingPrice: 10000000,
        currentPrice: 11200000,
        bidIncrement: 200000,
        startTime: past(1),
        endTime: future(2.5),
        status: client_1.AuctionStatus.ACTIVE,
        views: 142,
        bids: [
            { buyer: buyer1, amount: 10200000, time: past(0.9) },
            { buyer: buyer2, amount: 10800000, time: past(0.6) },
            { buyer: buyer3, amount: 11200000, time: past(0.3) },
        ],
    });
    await createAuctionData({
        title: 'Bộ Truyện Tranh Dragon Ball Cổ (97 tập)',
        description: 'Bộ truyện gắn liền với tuổi thơ, giấy hơi ngả vàng theo thời gian nhưng không rách trang, mất bìa. Cực kỳ có giá trị sưu tầm.',
        images: [
            'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Trung bình)',
        location: 'Quảng Ninh',
        category: catBook,
        seller: seller2,
        startingPrice: 800000,
        currentPrice: 1200000,
        bidIncrement: 50000,
        startTime: past(2),
        endTime: future(1),
        status: client_1.AuctionStatus.ACTIVE,
        views: 52,
        bids: [
            { buyer: buyer3, amount: 850000, time: past(1.8) },
            { buyer: buyer1, amount: 1000000, time: past(1.0) },
            { buyer: buyer3, amount: 1200000, time: past(0.5) },
        ],
    });
    await createAuctionData({
        title: 'Giày Nike Air Jordan 1 Retro High OG Chicago',
        description: 'Size 42, hàng chính hãng mua tại Nike Store. Đã mang 2 lần đi chụp ảnh, đế còn cực kỳ mới không mòn. Box gốc và dây phụ đầy đủ.',
        images: [
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Hà Nội',
        category: catFashion,
        seller: seller2,
        startingPrice: 4000000,
        currentPrice: 4800000,
        bidIncrement: 100000,
        startTime: past(1),
        endTime: future(2),
        status: client_1.AuctionStatus.ACTIVE,
        views: 135,
        bids: [
            { buyer: buyer1, amount: 4100000, time: past(0.9) },
            { buyer: buyer2, amount: 4400000, time: past(0.7) },
            { buyer: buyer3, amount: 4600000, time: past(0.4) },
            { buyer: buyer1, amount: 4800000, time: past(0.1) },
        ],
    });
    await createAuctionData({
        title: 'Áo Khoác Da Biker Schott NYC Cổ Điển',
        description: 'Chất liệu da bò thật siêu dày dặn, phong cách phong trần. Size L châu Âu tương đương XL Việt Nam. Hàng nhập Mỹ chính gốc.',
        images: [
            'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80',
        ],
        condition: 'Đã sử dụng (Tốt)',
        location: 'Đà Lạt',
        category: catFashion,
        seller: seller2,
        startingPrice: 6000000,
        currentPrice: 6000000,
        bidIncrement: 200000,
        startTime: future(1),
        endTime: future(4),
        status: client_1.AuctionStatus.UPCOMING,
        views: 12,
    });
    console.log('✓ Seeding database completed successfully!');
}
main()
    .then(async () => {
    await prisma.$disconnect();
})
    .catch(async (e) => {
    console.error('Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
});
