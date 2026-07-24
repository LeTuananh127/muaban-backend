import { PrismaClient, Role, UserStatus, SellerVerificationStatus, AuctionStatus, ProductStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting 100-product database seeding...');

  // 1. Clear existing data in reverse order of dependencies
  console.log('🧹 Clearing existing data...');
  await prisma.autoBid.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.otpVerification.deleteMany();
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

  // Hash password for users
  const passwordHash = await bcrypt.hash('Password123', 10);

  // 2. Create Users
  console.log('👤 Creating users...');
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@email.com',
      password: passwordHash,
      name: 'Quản trị viên hệ thống',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      sellerVerificationStatus: SellerVerificationStatus.APPROVED,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      sellerVerificationStatus: SellerVerificationStatus.APPROVED,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      sellerVerificationStatus: SellerVerificationStatus.APPROVED,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
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
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  console.log('💳 Creating wallets...');
  const users = [admin, seller1, seller2, seller3, buyer1, buyer2, buyer3];
  for (const u of users) {
    const isBuyer = u.email.startsWith('buyer');
    await prisma.wallet.create({
      data: {
        userId: u.id,
        balance: isBuyer ? 200000000 : 10000000,
      },
    });
  }

  // 3. Create Categories
  console.log('🏷️ Creating categories...');
  const catPhone = await prisma.category.create({ data: { name: 'Điện thoại & Phụ kiện', slug: 'dien-thoai-phu-kien' } });
  const catLaptop = await prisma.category.create({ data: { name: 'Máy tính & Laptop', slug: 'may-tinh-laptop' } });
  const catCamera = await prisma.category.create({ data: { name: 'Máy ảnh & Máy quay', slug: 'may-anh-may-quay' } });
  const catAudio = await prisma.category.create({ data: { name: 'Âm thanh & Loa', slug: 'am-thanh-loa' } });
  const catWatch = await prisma.category.create({ data: { name: 'Đồng hồ & Trang sức', slug: 'dong-ho-trang-suc' } });
  const catBook = await prisma.category.create({ data: { name: 'Sách & Truyện tranh', slug: 'sach-truyen-tranh' } });
  const catFashion = await prisma.category.create({ data: { name: 'Thời trang & Giày dép', slug: 'thoi-trang-giay-dep' } });
  const catOther = await prisma.category.create({ data: { name: 'Khác', slug: 'khac' } });

  const sellers = [seller1, seller2, seller3];
  const buyers = [buyer1, buyer2, buyer3];
  const now = new Date();

  // Helper function to create listing with bids
  const createListing = async (data: {
    title: string;
    description: string;
    images: string[];
    condition: string;
    location: string;
    category: any;
    startPrice: number;
    bidIncrement: number;
    buyNowPrice?: number;
    status: AuctionStatus;
    hoursStartOffset: number;
    hoursDuration: number;
    bidCount: number;
  }) => {
    const seller = sellers[Math.floor(Math.random() * sellers.length)];
    const startTime = new Date(now.getTime() + data.hoursStartOffset * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + data.hoursDuration * 60 * 60 * 1000);

    const product = await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        images: data.images,
        condition: data.condition,
        location: data.location,
        status: data.status === AuctionStatus.ENDED ? ProductStatus.SOLD : ProductStatus.IN_AUCTION,
        ownerId: seller.id,
        categoryId: data.category.id,
      },
    });

    let currentPrice = data.startPrice;
    let winningBuyer: any = null;

    const auction = await prisma.auction.create({
      data: {
        productId: product.id,
        startingPrice: data.startPrice,
        currentPrice: currentPrice,
        bidIncrement: data.bidIncrement,
        buyNowPrice: data.buyNowPrice,
        startTime: startTime,
        endTime: endTime,
        status: data.status,
        views: Math.floor(Math.random() * 300) + 20,
      },
    });

    if (data.bidCount > 0 && data.status !== AuctionStatus.UPCOMING) {
      for (let i = 0; i < data.bidCount; i++) {
        currentPrice += data.bidIncrement * (Math.floor(Math.random() * 2) + 1);
        winningBuyer = buyers[i % buyers.length];
        const bidTime = new Date(startTime.getTime() + (i + 1) * 30 * 60 * 1000);

        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            userId: winningBuyer.id,
            amount: currentPrice,
            createdAt: bidTime,
          },
        });
      }

      await prisma.auction.update({
        where: { id: auction.id },
        data: {
          currentPrice: currentPrice,
          currentWinnerId: winningBuyer.id,
        },
      });
    }
  };

  console.log('📦 Seeding 100 full product listings...');

  // 1. Điện thoại & Phụ kiện (13 items)
  const phoneItems = [
    { title: 'iPhone 15 Pro Max 256GB Titan Tự Nhiên VN/A', startPrice: 24000000, buyNowPrice: 28000000, img: 'https://images.unsplash.com/photo-1696446702193-e0b7d0de773b?w=800&q=80' },
    { title: 'Samsung Galaxy S24 Ultra 512GB Xám Titanium', startPrice: 22000000, buyNowPrice: 26000000, img: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&q=80' },
    { title: 'Google Pixel 8 Pro 128GB Obsidian Likenew', startPrice: 12500000, buyNowPrice: 15000000, img: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&q=80' },
    { title: 'iPhone 14 Pro 128GB Tím Deep Purple Hộp Zin', startPrice: 16500000, buyNowPrice: 19000000, img: 'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800&q=80' },
    { title: 'Xiaomi 14 Ultra 16GB/512GB Trắng Khung Kim Loại', startPrice: 18000000, buyNowPrice: 21000000, img: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80' },
    { title: 'iPad Pro 12.9 inch M2 128GB WiFi Fullbox', startPrice: 19000000, buyNowPrice: 22000000, img: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&q=80' },
    { title: 'Samsung Galaxy Z Fold 5 256GB Xanh Ice Blue', startPrice: 21000000, buyNowPrice: 25000000, img: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&q=80' },
    { title: 'Apple Watch Series 9 45mm Nhôm GPS Mới 100%', startPrice: 7500000, buyNowPrice: 9000000, img: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&q=80' },
    { title: 'Sạc Dự Phòng MagSafe Anker 10000mAh Siêu Mỏng', startPrice: 600000, buyNowPrice: 900000, img: 'https://images.unsplash.com/photo-1609592424074-2794c489d2c9?w=800&q=80' },
    { title: 'Tai Nghe AirPods Pro 2 USB-C Chính Hãng VN/A', startPrice: 4200000, buyNowPrice: 5200000, img: 'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&q=80' },
    { title: 'Ốp Lưng UAG Monarch iPhone 15 Pro Max Chống Va Đập', startPrice: 700000, buyNowPrice: 1100000, img: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=800&q=80' },
    { title: 'Sony Xperia 1 V 256GB Đen Nhám Quốc Tế', startPrice: 15000000, buyNowPrice: 18000000, img: 'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=800&q=80' },
    { title: 'OnePlus 12 16GB/512GB Xanh Lục Bảo 99%', startPrice: 14000000, buyNowPrice: 16500000, img: 'https://images.unsplash.com/photo-1546054454-aa26e2b734c7?w=800&q=80' },
  ];

  for (let i = 0; i < phoneItems.length; i++) {
    const item = phoneItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Hàng dùng giữ gìn cẩn thận, nguyên bản chưa qua sửa chữa. Phụ kiện đầy đủ sạc cáp zin, bao test 7 ngày thoải mái!`,
      images: [item.img],
      condition: i % 2 === 0 ? 'Đã sử dụng (Như mới)' : 'Mới 100%',
      location: i % 3 === 0 ? 'Hà Nội' : i % 3 === 1 ? 'TP. Hồ Chí Minh' : 'Đà Nẵng',
      category: catPhone,
      startPrice: item.startPrice,
      bidIncrement: 200000,
      buyNowPrice: item.buyNowPrice,
      status: i === 1 ? AuctionStatus.UPCOMING : i === 3 ? AuctionStatus.ENDED : AuctionStatus.ACTIVE,
      hoursStartOffset: i === 1 ? 5 : -12,
      hoursDuration: 48,
      bidCount: i === 1 ? 0 : Math.floor(Math.random() * 5) + 2,
    });
  }

  // 2. Máy tính & Laptop (13 items)
  const laptopItems = [
    { title: 'MacBook Pro M3 14 inch 2024 (16GB/512GB) Space Gray', startPrice: 33000000, buyNowPrice: 38000000, img: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80' },
    { title: 'Dell XPS 13 Plus 9320 Core i7 Touch OLED 3.5K', startPrice: 22000000, buyNowPrice: 26000000, img: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&q=80' },
    { title: 'MacBook Air M2 13.6 inch 8GB/256GB Midnight Hàng FPT', startPrice: 18500000, buyNowPrice: 21500000, img: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&q=80' },
    { title: 'Asus ROG Zephyrus G14 Ryzen 9 RTX 4060 Gaming', startPrice: 26000000, buyNowPrice: 30000000, img: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=800&q=80' },
    { title: 'Lenovo ThinkPad X1 Carbon Gen 11 Core i7 16GB RAM', startPrice: 24000000, buyNowPrice: 28000000, img: 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=800&q=80' },
    { title: 'Màn Hình Dell Ultrasharp U2723QE 27 inch 4K IPS', startPrice: 9500000, buyNowPrice: 12000000, img: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&q=80' },
    { title: 'Bàn Phím Cơ Keychron Q1 Pro Wireless Gateron Brown', startPrice: 2800000, buyNowPrice: 3500000, img: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&q=80' },
    { title: 'Chuột Không Dây Logitech MX Master 3S Mới 99%', startPrice: 1500000, buyNowPrice: 2000000, img: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&q=80' },
    { title: 'Mac Studio M2 Max (12CPU/30GPU/32GB/512GB)', startPrice: 42000000, buyNowPrice: 48000000, img: 'https://images.unsplash.com/photo-1547082299-de196ea013d6?w=800&q=80' },
    { title: 'PC Gaming Intel Core i7 14700K / RTX 4070 Ti Super', startPrice: 38000000, buyNowPrice: 44000000, img: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=800&q=80' },
    { title: 'Laptop HP Spectre x360 14 OLED Cảm Ứng Xoay 360', startPrice: 20000000, buyNowPrice: 24000000, img: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&q=80' },
    { title: 'Ổ Cứng SSD Portable Samsung T7 Touch 1TB Chống Nước', startPrice: 1800000, buyNowPrice: 2400000, img: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=800&q=80' },
    { title: 'Tai Nghe Gaming SteelSeries Arctis Nova Pro Wireless', startPrice: 5500000, buyNowPrice: 7000000, img: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80' },
  ];

  for (let i = 0; i < laptopItems.length; i++) {
    const item = laptopItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Máy đẹp hoàn hảo, làm việc đồ họa mượt mà, lập trình hay chiến game cực đỉnh. Đầy đủ phụ kiện chính hãng!`,
      images: [item.img],
      condition: i % 3 === 0 ? 'Mới 100%' : 'Đã sử dụng (Như mới)',
      location: i % 2 === 0 ? 'Hà Nội' : 'TP. Hồ Chí Minh',
      category: catLaptop,
      startPrice: item.startPrice,
      bidIncrement: 500000,
      buyNowPrice: item.buyNowPrice,
      status: i === 2 ? AuctionStatus.UPCOMING : i === 4 ? AuctionStatus.ENDED : AuctionStatus.ACTIVE,
      hoursStartOffset: i === 2 ? 6 : -18,
      hoursDuration: 60,
      bidCount: i === 2 ? 0 : Math.floor(Math.random() * 4) + 2,
    });
  }

  // 3. Máy ảnh & Máy quay (12 items)
  const cameraItems = [
    { title: 'Sony Alpha A7 IV Body Fullframe Mới 99% (3k Shot)', startPrice: 42000000, buyNowPrice: 46000000, img: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80' },
    { title: 'Canon EOS R6 Mark II Body Chính Hãng LeBaoMinh', startPrice: 45000000, buyNowPrice: 50000000, img: 'https://images.unsplash.com/photo-1606988991744-e875a46725e9?w=800&q=80' },
    { title: 'Ống Kính Canon RF 50mm f/1.2 L USM Đẹp Kính Trong', startPrice: 31000000, buyNowPrice: 35000000, img: 'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&q=80' },
    { title: 'Fujifilm X-T5 Body Màu Bạc Vintage 1000 Shot', startPrice: 32000000, buyNowPrice: 36000000, img: 'https://images.unsplash.com/photo-1502982720700-bfff97f2ecac?w=800&q=80' },
    { title: 'Ống Kính Sony FE 24-70mm f/2.8 GM II Siêu Đẹp', startPrice: 38000000, buyNowPrice: 43000000, img: 'https://images.unsplash.com/photo-1616440342855-5ed7324025a4?w=800&q=80' },
    { title: 'GoPro Hero 12 Black Special Bundle Kèm 3 Pin Gậy', startPrice: 8500000, buyNowPrice: 10500000, img: 'https://images.unsplash.com/photo-1564466809058-bf4114d55352?w=800&q=80' },
    { title: 'DJI Pocket 3 Creator Combo Mới Khui Hộp Dùng 1 Lần', startPrice: 13500000, buyNowPrice: 15500000, img: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80' },
    { title: 'Gimbal DJI RS 3 Pro Chuyên Nghiệp Cho Máy Quay', startPrice: 11000000, buyNowPrice: 13500000, img: 'https://images.unsplash.com/photo-1589256469067-ea99122bbdc4?w=800&q=80' },
    { title: 'Leica Q2 Monochrom Máy Ảnh Trắng Đen Sưu Tầm', startPrice: 75000000, buyNowPrice: 85000000, img: 'https://images.unsplash.com/photo-1510127034890-ba27508e9f1c?w=800&q=80' },
    { title: 'Ống Kính Sigma 85mm f/1.4 DG DN Art Cho Sony E', startPrice: 17000000, buyNowPrice: 20000000, img: 'https://images.unsplash.com/photo-1622434641406-a158123450f9?w=800&q=80' },
    { title: 'Chân Máy Ảnh Carbon Fiber Peak Design Travel Tripod', startPrice: 9000000, buyNowPrice: 11500000, img: 'https://images.unsplash.com/photo-1512790182412-b19e6d611397?w=800&q=80' },
    { title: 'Đèn Studio Godox AD600Pro Kèm Softbox 90cm', startPrice: 14000000, buyNowPrice: 17000000, img: 'https://images.unsplash.com/photo-1520390138845-fd2d229dd553?w=800&q=80' },
  ];

  for (let i = 0; i < cameraItems.length; i++) {
    const item = cameraItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Kính đẹp không mốc rễ xước dăm, sensor sạch bong. Phù hợp anh em chụp dịch vụ hoặc quay vlog chuyên nghiệp!`,
      images: [item.img],
      condition: 'Đã sử dụng (Tốt)',
      location: i % 2 === 0 ? 'TP. Hồ Chí Minh' : 'Hà Nội',
      category: catCamera,
      startPrice: item.startPrice,
      bidIncrement: 500000,
      buyNowPrice: item.buyNowPrice,
      status: i === 5 ? AuctionStatus.ENDED : AuctionStatus.ACTIVE,
      hoursStartOffset: -20,
      hoursDuration: 72,
      bidCount: Math.floor(Math.random() * 4) + 2,
    });
  }

  // 4. Âm thanh & Loa (12 items)
  const audioItems = [
    { title: 'Tai Nghe Chống Ồn Sony WH-1000XM5 Màu Bạc', startPrice: 5200000, buyNowPrice: 6500000, img: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=800&q=80' },
    { title: 'Loa Bluetooth Marshall Acton III ASH Fullbox', startPrice: 4600000, buyNowPrice: 5800000, img: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80' },
    { title: 'Tai Nghe Apple AirPods Max Color Space Gray', startPrice: 9500000, buyNowPrice: 11500000, img: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80' },
    { title: 'Loa Harman Kardon Aura Studio 4 Mới 100%', startPrice: 5800000, buyNowPrice: 7000000, img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80' },
    { title: 'Loa Di Động JBL Charge 5 Chống Nước IP67', startPrice: 2800000, buyNowPrice: 3500000, img: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&q=80' },
    { title: 'Tai Nghe Bluetooth Bose QuietComfort Ultra Headphone', startPrice: 7200000, buyNowPrice: 8800000, img: 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800&q=80' },
    { title: 'Loa B&O Beosound Explore Nhôm Nguyên Khối', startPrice: 3900000, buyNowPrice: 4800000, img: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&q=80' },
    { title: 'Tai Nghe In-Ear Sennheiser IE 600 Âm Thanh Hi-End', startPrice: 12000000, buyNowPrice: 15000000, img: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80' },
    { title: 'DAC/AMP Di Động FiiO Q15 Giải Mã DSD512', startPrice: 8000000, buyNowPrice: 9800000, img: 'https://images.unsplash.com/photo-1558089687-f282ffcbc126?w=800&q=80' },
    { title: 'Micro Thu Âm Shure SM7B Chuẩn Studio Podcast', startPrice: 8500000, buyNowPrice: 10500000, img: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&q=80' },
    { title: 'Loa Karaoke Di Động Acnos CS450 Neo Bass Trầm', startPrice: 4200000, buyNowPrice: 5300000, img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&q=80' },
    { title: 'Tai Nghe Chơi Game HyperX Cloud III Wireless 120H Pin', startPrice: 2600000, buyNowPrice: 3300000, img: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&q=80' },
  ];

  for (let i = 0; i < audioItems.length; i++) {
    const item = audioItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Âm bass uy lực, dải âm trong trẻo. Hàng đẹp 98-99%, nghe nhạc chill phòng ngủ hay mang đi du lịch cực đã.`,
      images: [item.img],
      condition: 'Đã sử dụng (Như mới)',
      location: i % 3 === 0 ? 'Hà Nội' : i % 3 === 1 ? 'TP. Hồ Chí Minh' : 'Cần Thơ',
      category: catAudio,
      startPrice: item.startPrice,
      bidIncrement: 100000,
      buyNowPrice: item.buyNowPrice,
      status: i === 0 ? AuctionStatus.ACTIVE : AuctionStatus.ACTIVE,
      hoursStartOffset: -10,
      hoursDuration: 48,
      bidCount: Math.floor(Math.random() * 5) + 2,
    });
  }

  // 5. Đồng hồ & Trang sức (13 items)
  const watchItems = [
    { title: 'Apple Watch Ultra LTE 49mm Titanium Dây Alpine', startPrice: 10500000, buyNowPrice: 12500000, img: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80' },
    { title: 'Đồng Hồ Seiko Presage Automatic Mặt Số Hoa Văn Kokoro', startPrice: 8500000, buyNowPrice: 10500000, img: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80' },
    { title: 'Đồng Hồ Orient Bambino Gen 2 Kính Cong Cổ Điển', startPrice: 3200000, buyNowPrice: 4200000, img: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&q=80' },
    { title: 'Đồng Hồ Tissot Le Locle Powermatic 80 Thụy Sĩ', startPrice: 9000000, buyNowPrice: 11500000, img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80' },
    { title: 'Nhẫn Bạc Nam S925 Đính Đá Zircon Đen Sang Trọng', startPrice: 800000, buyNowPrice: 1200000, img: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80' },
    { title: 'Dây Chuyền Vàng Ý 750 Mặt Kim Cương Nhân Tạo', startPrice: 4500000, buyNowPrice: 6000000, img: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80' },
    { title: 'Đồng Hồ Casio G-Shock GA-2100 "CasiOak" Đen Tuyền', startPrice: 1800000, buyNowPrice: 2400000, img: 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?w=800&q=80' },
    { title: 'Đồng Hồ Citizen Eco-Drive Năng Lượng Mặt Trời', startPrice: 3500000, buyNowPrice: 4500000, img: 'https://images.unsplash.com/photo-1533139502658-0198f920d8e8?w=800&q=80' },
    { title: 'Vòng Tay Trầm Hương Bọc Vàng 10K Hợp Phong Thủy', startPrice: 2500000, buyNowPrice: 3500000, img: 'https://images.unsplash.com/photo-1611591475877-23e8bced20ed?w=800&q=80' },
    { title: 'Đồng Hồ Hamilton Khaki Field Mechanical Nam Tính', startPrice: 11000000, buyNowPrice: 13500000, img: 'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&q=80' },
    { title: 'Đồng Hồ Garmin Fenix 7 Pro Solar Thể Thao Đa Năng', startPrice: 14500000, buyNowPrice: 17500000, img: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&q=80' },
    { title: 'Đồng Hồ Omega Seamaster Diver 300M Cổ Điển Sưu Tầm', startPrice: 55000000, buyNowPrice: 65000000, img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80' },
    { title: 'Bông Tai Ngọc Trai Biển South Sea Vàng 18K Luxury', startPrice: 8500000, buyNowPrice: 11000000, img: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80' },
  ];

  for (let i = 0; i < watchItems.length; i++) {
    const item = watchItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Đồ dùng cá nhân giữ gìn kỹ lưỡng, máy móc chạy chính xác tuyệt đối. Đầy đủ thẻ bảo hành và hộp chính hãng đi kèm!`,
      images: [item.img],
      condition: i % 2 === 0 ? 'Đã sử dụng (Như mới)' : 'Mới 100%',
      location: i % 2 === 0 ? 'Hà Nội' : 'TP. Hồ Chí Minh',
      category: catWatch,
      startPrice: item.startPrice,
      bidIncrement: 200000,
      buyNowPrice: item.buyNowPrice,
      status: i === 6 ? AuctionStatus.UPCOMING : AuctionStatus.ACTIVE,
      hoursStartOffset: i === 6 ? 4 : -15,
      hoursDuration: 48,
      bidCount: Math.floor(Math.random() * 4) + 1,
    });
  }

  // 6. Sách & Truyện tranh (12 items)
  const bookItems = [
    { title: 'Bộ Truyện Tranh Dragon Ball Cổ (97 Tập Full)', startPrice: 900000, buyNowPrice: 1400000, img: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80' },
    { title: 'Bộ Sách Harry Potter Bản Bìa Cứng Giới Hạn 7 Tập', startPrice: 1800000, buyNowPrice: 2500000, img: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80' },
    { title: 'Truyện Tranh Conan Đời Đầu (Tập 1 Đến 100) Mới 95%', startPrice: 1200000, buyNowPrice: 1800000, img: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80' },
    { title: 'Bộ Tiểu Thuyết Chúa Tể Những Chiếc Nhẫn Special', startPrice: 1100000, buyNowPrice: 1500000, img: 'https://images.unsplash.com/photo-1495640388908-05fa85288e61?w=800&q=80' },
    { title: 'Sách Cổ Khâm Định Việt Sử Thông Giám Cương Mục 1960', startPrice: 3500000, buyNowPrice: 5000000, img: 'https://images.unsplash.com/photo-1463320726281-696a485928c7?w=800&q=80' },
    { title: 'Trọn Bộ Naruto 72 Tập Bìa Gốc NXB Kim Đồng', startPrice: 1400000, buyNowPrice: 2000000, img: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&q=80' },
    { title: 'Bộ Sách Tâm Lý Học Tư Duy Nhanh Và Chậm + Dấu Chân', startPrice: 400000, buyNowPrice: 650000, img: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800&q=80' },
    { title: 'Sách Kinh Doanh Đắc Nhân Tâm + Nhà Giả Kim Bìa Cứng', startPrice: 300000, buyNowPrice: 500000, img: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&q=80' },
    { title: 'Bộ Truyện Tranh Doraemon Ngắn 45 Tập Đời Đầu', startPrice: 1000000, buyNowPrice: 1500000, img: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&q=80' },
    { title: 'Bộ Artbook Tuổi Trẻ Của Van Gogh Độc Bản', startPrice: 1500000, buyNowPrice: 2200000, img: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&q=80' },
    { title: 'Sách Lịch Sử Văn Minh Thế Giới (11 Tập Trọn Bộ)', startPrice: 2800000, buyNowPrice: 3800000, img: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&q=80' },
    { title: 'Bộ Sách Bách Khoa Toàn Thư Cho Trẻ Em DK Britanica', startPrice: 1200000, buyNowPrice: 1800000, img: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80' },
  ];

  for (let i = 0; i < bookItems.length; i++) {
    const item = bookItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Truyện/Sách giữ gìn phẳng đẹp, không gập nếp rách trang. Giá trị sưu tầm cao cho bạn đọc yêu sách!`,
      images: [item.img],
      condition: 'Đã sử dụng (Tốt)',
      location: i % 2 === 0 ? 'Hà Nội' : 'Đà Nẵng',
      category: catBook,
      startPrice: item.startPrice,
      bidIncrement: 50000,
      buyNowPrice: item.buyNowPrice,
      status: AuctionStatus.ACTIVE,
      hoursStartOffset: -24,
      hoursDuration: 72,
      bidCount: Math.floor(Math.random() * 6) + 1,
    });
  }

  // 7. Thời trang & Giày dép (13 items)
  const fashionItems = [
    { title: 'Giày Nike Air Jordan 1 Retro High OG Chicago Size 42', startPrice: 4200000, buyNowPrice: 5500000, img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80' },
    { title: 'Áo Khoác Da Biker Schott NYC Bò Thật Nhập Mỹ', startPrice: 6500000, buyNowPrice: 8500000, img: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&q=80' },
    { title: 'Giày Sneaker Adidas Yeezy Boost 350 V2 Zebra Size 41', startPrice: 3800000, buyNowPrice: 5000000, img: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?w=800&q=80' },
    { title: 'Túi Xách Nữ Dior Lady Medium Da Cừu Đen Auth 98%', startPrice: 35000000, buyNowPrice: 42000000, img: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80' },
    { title: 'Kính Mát Ray-Ban Aviator Khung Vàng Mạ 24K Chính Hãng', startPrice: 2800000, buyNowPrice: 3600000, img: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&q=80' },
    { title: 'Ví Nam Gucci Supreme Canvas Họa Tiết Con Rắn Hộp Zin', startPrice: 4500000, buyNowPrice: 6000000, img: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&q=80' },
    { title: 'Áo Hoodie Fear of God Essentials SS23 Off-Black Size M', startPrice: 1800000, buyNowPrice: 2500000, img: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80' },
    { title: 'Giày Tây Oxford Nam Loake 1880 Da Bò Thật Khâu Goodyear', startPrice: 3200000, buyNowPrice: 4200000, img: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=800&q=80' },
    { title: 'Túi Yves Saint Laurent YSL Loulou Chain Bag Mới 99%', startPrice: 28000000, buyNowPrice: 34000000, img: 'https://images.unsplash.com/photo-1591561954557-26941169b49e?w=800&q=80' },
    { title: 'Áo Sơ Mi Burberry Họa Tiết Kẻ Caro Kinh Điển Size S', startPrice: 3500000, buyNowPrice: 4800000, img: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=800&q=80' },
    { title: 'Mũ Phớt Fedora Nỉ Cao Cấp Sản Xuất Tại Ý', startPrice: 1200000, buyNowPrice: 1800000, img: 'https://images.unsplash.com/photo-1534215754734-18e55d13e346?w=800&q=80' },
    { title: 'Giày Cao Gót Christian Louboutin Đế Đỏ Huyền Thoại 37', startPrice: 9000000, buyNowPrice: 12000000, img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80' },
    { title: 'Quần Jeans Levi\'s 501 Vintage 1990 Made in USA', startPrice: 1500000, buyNowPrice: 2200000, img: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&q=80' },
  ];

  for (let i = 0; i < fashionItems.length; i++) {
    const item = fashionItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Hàng hiệu chính hãng 100%, tình trạng đẹp chuẩn mẫu, chất liệu cao cấp tôn dáng thời thượng!`,
      images: [item.img],
      condition: i % 2 === 0 ? 'Đã sử dụng (Như mới)' : 'Mới 100%',
      location: i % 2 === 0 ? 'TP. Hồ Chí Minh' : 'Hà Nội',
      category: catFashion,
      startPrice: item.startPrice,
      bidIncrement: 100000,
      buyNowPrice: item.buyNowPrice,
      status: AuctionStatus.ACTIVE,
      hoursStartOffset: -8,
      hoursDuration: 48,
      bidCount: Math.floor(Math.random() * 4) + 1,
    });
  }

  // 8. Khác (12 items)
  const otherItems = [
    { title: 'Đàn Guitar Acoustic Fender CD-60S Gỗ Thông Tự Nhiên', startPrice: 3500000, buyNowPrice: 4800000, img: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&q=80' },
    { title: 'Đồng Đồng Cổ Thời Pháp Thuộc Họa Tiết Chạm Khắc', startPrice: 4800000, buyNowPrice: 6500000, img: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&q=80' },
    { title: 'Bộ Tiền Xu Cổ Việt Nam Qua Các Thời Kỳ Sưu Tầm', startPrice: 1500000, buyNowPrice: 2400000, img: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=800&q=80' },
    { title: 'Ghế Ergonomic Herman Miller Aeron Size B Đen', startPrice: 18000000, buyNowPrice: 22000000, img: 'https://images.unsplash.com/photo-1580481072645-022f9a6d8310?w=800&q=80' },
    { title: 'Xe Đạp Đua Road Trek Emonda ALR 5 Khung Nhôm Siêu Nhẹ', startPrice: 21000000, buyNowPrice: 26000000, img: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&q=80' },
    { title: 'Bộ Ấm Trà Tử Sa Bát Tràng Đất Tử Nglêm Thủ Công', startPrice: 1800000, buyNowPrice: 2800000, img: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=800&q=80' },
    { title: 'Đàn Ukulele Concert Kala Solid Mahogany Âm Ấm', startPrice: 1200000, buyNowPrice: 1800000, img: 'https://images.unsplash.com/photo-1568219656418-15c329d1b42a?w=800&q=80' },
    { title: 'Tranh Sơn Dầu Phong Cảnh Hà Nội Cổ Khung Gỗ Gụ', startPrice: 3200000, buyNowPrice: 4500000, img: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&q=80' },
    { title: 'Mô Hình Gundam PG 1/60 Perfect Strike Đã Ráp Sơn Custom', startPrice: 4500000, buyNowPrice: 6000000, img: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&q=80' },
    { title: 'Đèn Bàn Tiffany Họa Tiết Hoa Thủy Tinh Cổ Điển', startPrice: 2800000, buyNowPrice: 3900000, img: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&q=80' },
    { title: 'Vợt Cầu Lông Yonex Astrox 100ZZ Kurenai Chính Hãng', startPrice: 3100000, buyNowPrice: 4000000, img: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80' },
    { title: 'Bàn Bida Mini Lỗ Gia Đình Khung Gỗ Chắc Chắn', startPrice: 2200000, buyNowPrice: 3000000, img: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&q=80' },
  ];

  for (let i = 0; i < otherItems.length; i++) {
    const item = otherItems[i];
    await createListing({
      title: item.title,
      description: `${item.title}. Vật phẩm độc đáo sang trọng, dùng trang trí hoặc sưu tầm đều mang tính thẩm mỹ cao!`,
      images: [item.img],
      condition: 'Đã sử dụng (Tốt)',
      location: i % 2 === 0 ? 'Hà Nội' : 'TP. Hồ Chí Minh',
      category: catOther,
      startPrice: item.startPrice,
      bidIncrement: 100000,
      buyNowPrice: item.buyNowPrice,
      status: AuctionStatus.ACTIVE,
      hoursStartOffset: -12,
      hoursDuration: 48,
      bidCount: Math.floor(Math.random() * 4) + 1,
    });
  }

  console.log('✨ 100-product database seeding completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
