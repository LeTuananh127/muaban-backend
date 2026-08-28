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

const { PrismaClient, ProductStatus, AuctionStatus } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL
    }
  }
});

// 10 Products for each of the 8 Categories
const categoryProductsData = {
  'dien-thoai-phu-kien': [
    {
      title: 'iPhone 14 Pro Max 128GB Tím Deep Purple Quốc Tế 99%',
      description: 'Máy nguyên zin 100%, pin 92%, ngoại hình đẹp không cấn móp, full chức năng Face ID cực nhạy. Kèm cáp sạc nhanh Type-C to Lightning chính hãng và ốp lưng UAG.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 17500000,
      bidIncrement: 200000,
      buyNowPrice: 21000000,
      images: [
        'https://images.unsplash.com/photo-1678685888221-cda773a3dcdb?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Samsung Galaxy S23 Ultra 5G 256GB Phantom Black',
      description: 'Bản chính hãng SSVN hết bảo hành, viền phẩy nhẹ, màn sáng đẹp không ám ố. Bút S-Pen hoạt động mượt mà, zoom 100x nét căng. Kèm sạc nhanh 45W.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 14000000,
      bidIncrement: 200000,
      buyNowPrice: 17500000,
      images: [
        'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'iPhone 13 128GB Midnight VNA Pin 88%',
      description: 'Chính chủ lên đời cần bán, máy mua tại CellphoneS, nguyên bản chưa từng sửa chữa. Màn hình dán cường lực KingKong từ lúc mua.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Đà Nẵng',
      startingPrice: 9500000,
      bidIncrement: 100000,
      buyNowPrice: 12000000,
      images: [
        'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Xiaomi 13 Pro 12GB/256GB Gốm Đen Leica Siêu Nét',
      description: 'Flagship camera cảm biến 1 inch hợp tác Leica chụp chân dung xoá phông đỉnh cao. Chip Snapdragon 8 Gen 2 cực mượt, sạc 120W 19 phút đầy pin.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hải Phòng',
      startingPrice: 10500000,
      bidIncrement: 150000,
      buyNowPrice: 13500000,
      images: [
        'https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Google Pixel 7 Pro 128GB Hazel Quốc Tế Camera AI',
      description: 'Trải nghiệm Android gốc mượt mà, chụp đêm siêu thực tế. Máy hình thức 98%, màn hình 2K 120Hz mượt mà, pin dùng thoải mái 1 ngày.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Hà Nội',
      startingPrice: 7800000,
      bidIncrement: 100000,
      buyNowPrice: 9800000,
      images: [
        'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Tai nghe Apple AirPods Pro 2 MagSafe Type-C Chính Hãng',
      description: 'Chống ồn chủ động ANC đỉnh cao, âm bass chắc nịch. Hộp sạc và tai nghe đẹp 99%, đầy đủ núm tai size XS/S/M/L và hộp nguyên.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 3200000,
      bidIncrement: 50000,
      buyNowPrice: 4200000,
      images: [
        'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Sạc Dự Phòng Anker 737 PowerCore 24000mAh 140W',
      description: 'Quái vật sạc nhanh có màn hình thông minh hiển thị công suất từng cổng. Sạc được cho cả MacBook Pro và iPhone cùng lúc.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 1600000,
      bidIncrement: 50000,
      buyNowPrice: 2300000,
      images: [
        'https://images.unsplash.com/photo-1609592426868-23e59546059d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Ốp lưng Da Apple Leather Case iPhone 14 Pro Max Chính Hãng',
      description: 'Chất liệu da thật nguyên bản Apple màu Cam Umber, patina tự nhiên cực đẹp, phím bấm kim loại nảy tanh tách.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Cần Thơ',
      startingPrice: 350000,
      bidIncrement: 20000,
      buyNowPrice: 600000,
      images: [
        'https://images.unsplash.com/photo-1603313011101-320f26a4f6f6?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Gimbal Chống Rung DJI OM 6 (Osmo Mobile 6) Fullbox',
      description: 'Gimbal quay video TikTok / Vlog chuyên nghiệp, có thanh nối dài tích hợp, bám nét ActiveTrack 5.0 mượt mà.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 2100000,
      bidIncrement: 50000,
      buyNowPrice: 2800000,
      images: [
        'https://images.unsplash.com/photo-1589739900243-4b52cd9b104e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'iPad Air 5 M1 64GB Wifi Space Grey Kèm Bút Apple Pencil 2',
      description: 'Combo học tập đồ hoạ cực đỉnh: Chip M1 cân mọi tác vụ, màn hình Liquid Retina sắc nét. Máy dán Paperlike vẽ viết như trên giấy.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 11000000,
      bidIncrement: 150000,
      buyNowPrice: 13500000,
      images: [
        'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'may-tinh-laptop': [
    {
      title: 'MacBook Pro 14 inch M2 Pro 16GB / 512GB Space Gray',
      description: 'Cỗ máy làm việc hoàn hảo cho Designer/Developer. Màn Liquid Retina XDR 120Hz siêu mịn, pin 100% sạc 35 lần, bảo hành Apple Care dài.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 32000000,
      bidIncrement: 500000,
      buyNowPrice: 38000000,
      images: [
        'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Dell XPS 13 Plus 9320 Core i7-1360P / 16GB / 512GB 3.5K OLED',
      description: 'Thiết kế tương lai với hàng phím cảm ứng điện dung, touchpad tàng hình, màn hình OLED cảm ứng vô cực siêu sắc nét.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 24000000,
      bidIncrement: 300000,
      buyNowPrice: 29000000,
      images: [
        'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'MacBook Air M1 8GB/256GB Gold Sang Trọng Pin 94%',
      description: 'Máy văn phòng quốc dân, mỏng nhẹ 1.2kg, bàn phím gõ êm ái, pin trâu 12-14 tiếng làm việc liên tục. Tặng kèm túi chống sốc cao cấp.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Đà Nẵng',
      startingPrice: 12500000,
      bidIncrement: 150000,
      buyNowPrice: 15000000,
      images: [
        'https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Laptop Gaming ASUS ROG Zephyrus G14 Ryzen 9 / RTX 3060 / 16GB',
      description: 'Màn hình 2K 120Hz chuẩn màu 100% DCI-P3, mặt lưng đèn LED AniMe Matrix độc đáo, cân mượt mọi game AAA và đồ hoạ 3D.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 18500000,
      bidIncrement: 250000,
      buyNowPrice: 23000000,
      images: [
        'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bàn phím cơ Custom Keychron Q1 Pro Wireless Gateron Banana',
      description: 'Full nhôm CNC nguyên khối đầm nặng 1.8kg, mạch xuôi hotswap, kết nối Bluetooth / Type-C 3 thiết bị, gõ đầm ấm cực êm.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 2800000,
      bidIncrement: 50000,
      buyNowPrice: 3600000,
      images: [
        'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Màn hình đồ hoạ LG UltraFine 27 inch 4K IPS Type-C 90W',
      description: 'Độ chuẩn màu 99% sRGB, chân đế công thái học Ergo xoay gập linh hoạt, vừa xuất hình 4K vừa sạc laptop qua 1 sợi cáp.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 6500000,
      bidIncrement: 100000,
      buyNowPrice: 8200000,
      images: [
        'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Chuột công thái học Logitech MX Master 3S Silent Dark Gray',
      description: 'Con lăn vô cực MagSpeed cuộn 1000 dòng/giây, click tĩnh âm 90%, cảm biến 8000 DPI di mượt trên mọi bề mặt kính.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1350000,
      bidIncrement: 30000,
      buyNowPrice: 1800000,
      images: [
        'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Ổ cứng di động SSD Samsung T7 Shield 1TB Chống Nước Chuẩn IP65',
      description: 'Tốc độ đọc ghi 1050MB/s, bọc cao su chống va đập rơi rớt từ độ cao 3m, sao chép file video 4K trong chớp mắt.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 1650000,
      bidIncrement: 50000,
      buyNowPrice: 2200000,
      images: [
        'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Card Màn Hình ASUS TUF Gaming RTX 3070 8GB GDDR6',
      description: 'Hàng người dùng chơi game không trâu cày, nhiệt độ mát mẻ 62 độ full tải, nguyên tem niêm phong hãng.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Đà Nẵng',
      startingPrice: 6200000,
      bidIncrement: 100000,
      buyNowPrice: 7800000,
      images: [
        'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Ghế Công Thái Học Herman Miller Aeron Remastered Size B',
      description: 'Vua ghế công thái học, lưới Pellicle 8Z thoáng khí tuyệt đối, ngả lưng êm ái bảo vệ cột sống làm việc 10 tiếng không mỏi.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 18000000,
      bidIncrement: 300000,
      buyNowPrice: 23000000,
      images: [
        'https://images.unsplash.com/photo-1580481077111-85b42d7676fb?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'may-anh-may-quay': [
    {
      title: 'Sony Alpha A7 IV (ILCE-7M4) Body Fullframe 33MP 4K60p',
      description: 'Máy chụp 4k shot, ngoại hình như vừa đập hộp, cảm biến sạch bong, quay video 10-bit 4:2:2 lấy nét mắt Real-time Eye AF đỉnh cao.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 41000000,
      bidIncrement: 500000,
      buyNowPrice: 47000000,
      images: [
        'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Fujifilm X-T4 Body Silver Màu Phim Vintage Chống Rung IBIS',
      description: 'Huyền thoại giả lập màu phim Classic Negative, màn hình xoay lật đa hướng, 2 khe thẻ nhớ, kèm 2 pin chính hãng W235.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 22500000,
      bidIncrement: 300000,
      buyNowPrice: 27000000,
      images: [
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Ống Kính Sony FE 24-70mm F2.8 GM II (G Master Mark 2)',
      description: 'Lens zoom đa dụng nét nhất hệ Sony, nhẹ hơn đời 1 tới 22%, kính trong veo không mốc rễ xước xát.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 35000000,
      bidIncrement: 500000,
      buyNowPrice: 41000000,
      images: [
        'https://images.unsplash.com/photo-1617005082133-548c4dd27f35?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Canon EOS R6 Body 20MP Chống Rung 8 Stop Lấy Nét Động Vật',
      description: 'Máy hoạt động hoàn hảo, chuyên chụp sự kiện tiệc cưới chân dung màu da Canon hồng hào nịnh mắt.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Đà Nẵng',
      startingPrice: 30000000,
      bidIncrement: 400000,
      buyNowPrice: 35000000,
      images: [
        'https://images.unsplash.com/photo-1519638831568-d9897f54ed69?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Action Cam GoPro Hero 11 Black Combo Phụ Kiện 3 Pin',
      description: 'Chống rung HyperSmooth 5.0 khoá đường chân trời 360 độ, quay 5.3K 60fps siêu nét, chống nước 10m không cần vỏ.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hải Phòng',
      startingPrice: 5800000,
      bidIncrement: 100000,
      buyNowPrice: 7200000,
      images: [
        'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Flycam DJI Mini 3 Pro Kèm Tay Cầm Điều Khiển DJI RC Màn Hình',
      description: 'Trọng lượng dưới 249g không cần xin phép bay phức tạp, cảm biến tránh vật cản 3 hướng, quay dọc camera TikTok 4K.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 13500000,
      bidIncrement: 200000,
      buyNowPrice: 16500000,
      images: [
        'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Máy Ảnh Film Canon AE-1 Program Kèm Lens 50mm f/1.4 FD',
      description: 'Máy cơ film 35mm kinh điển của giới mê nhiếp ảnh hoài cổ. Cơ tốc chính xác, view ngắm sáng rõ, đo sáng chuẩn từng khẩu độ.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Hà Nội',
      startingPrice: 3200000,
      bidIncrement: 50000,
      buyNowPrice: 4500000,
      images: [
        'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đèn Studio Godox SL60W Kèm Softbox Cầu Lanterna 65cm',
      description: 'Đèn led ánh sáng liên tục chuyên quay livestream, chụp sản phẩm, CRI 96+ hiển thị màu sắc trung thực.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1900000,
      bidIncrement: 50000,
      buyNowPrice: 2500000,
      images: [
        'https://images.unsplash.com/photo-1517430816045-df4b7de7d692?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Micro Thu Âm Không Dây DJI Mic 1 TX + 1 RX Bản Đơn',
      description: 'Thu âm thanh vắt, ghi âm backup bộ nhớ trong 8GB, phạm vi truyền sóng 250m ổn định không giật lag.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Cần Thơ',
      startingPrice: 2700000,
      bidIncrement: 50000,
      buyNowPrice: 3400000,
      images: [
        'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Chân Máy Ảnh Carbon Fiber Benro Tortoise 34C Kèm Ballhead GX35',
      description: 'Chân sợi carbon siêu nhẹ 1.4kg nhưng chịu tải tới 20kg, gập gọn bỏ balo du lịch phượt leo núi.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 3800000,
      bidIncrement: 50000,
      buyNowPrice: 4900000,
      images: [
        'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'am-thanh-loa': [
    {
      title: 'Loa Marshall Stanmore III Bluetooth Black Phong Cách Cổ Điển',
      description: 'Âm thanh tràn ngập căn phòng 30m2 với củ loa kép góc cạnh, Dynamic Loudness tinh chỉnh âm thanh cân bằng mọi mức âm lượng.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 5900000,
      bidIncrement: 100000,
      buyNowPrice: 7500000,
      images: [
        'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Tai nghe Chống Ồn Sony WH-1000XM5 Silver Nguyên Hộp',
      description: 'Ông vua chống ồn di động với 8 micro và 2 vi xử lý khử ồn tự động, chất âm LDAC độ phân giải cao Hi-Res Audio.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 5200000,
      bidIncrement: 100000,
      buyNowPrice: 6600000,
      images: [
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Loa Di Động JBL PartyBox Encore 2 Micro Hát Karaoke',
      description: 'Âm thanh JBL Original Pro Sound uy lực 100W, đèn LED nhấp nháy theo điệu nhạc, pin 10 tiếng quẩy tiệc dã ngoại.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Đà Nẵng',
      startingPrice: 4800000,
      bidIncrement: 100000,
      buyNowPrice: 6200000,
      images: [
        'https://images.unsplash.com/photo-1543512214-318c7553f230?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Mâm Đĩa Than Audio-Technica AT-LP60XBT Wireless Turntable',
      description: 'Phát đĩa nhựa Vinyl cổ điển kết nối loa Bluetooth không dây tiện lợi, đầu kim MM cao cấp đọc rãnh đĩa chi tiết mượt mà.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 3400000,
      bidIncrement: 50000,
      buyNowPrice: 4300000,
      images: [
        'https://images.unsplash.com/photo-1539185441755-769473a23570?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Tai nghe Audiophile Sennheiser HD 660S Open-Back 150 Ohm',
      description: 'Tai nghe chụp tai mở chuyên dụng cho audiophile nghe nhạc giao hưởng, vocal chi tiết tách bạch từng hơi thở ca sĩ.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 6500000,
      bidIncrement: 100000,
      buyNowPrice: 8500000,
      images: [
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Loa Thông Minh Apple HomePod 2 Midnight Âm Thanh Không Gian',
      description: 'Âm thanh vòm Spatial Audio Dolby Atmos, cảm biến phòng tự động điều chỉnh sóng âm, tích hợp trung tâm nhà thông minh HomeKit.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 5100000,
      bidIncrement: 100000,
      buyNowPrice: 6500000,
      images: [
        'https://images.unsplash.com/photo-1543512214-318c7553f230?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'DAC/AMP Di Động iFi Hip-Dac 3 Hỗ Trợ MQA DSD256',
      description: 'Thiết kế bình rượu nhôm màu đồng cổ điển, mạch khuếch đại tai nghe công suất mạnh kéo tốt cả những tai nghe trở kháng cao.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 2600000,
      bidIncrement: 50000,
      buyNowPrice: 3500000,
      images: [
        'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Loa Bluetooth B&O Beosound A1 2nd Gen Chống Nước IP67',
      description: 'Thiết kế nhôm đục lỗ Bang & Olufsen Đan Mạch sang chảnh, âm thanh 360 độ bass đánh sâu trầm ấm bất ngờ so với kích thước.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hải Phòng',
      startingPrice: 4200000,
      bidIncrement: 80000,
      buyNowPrice: 5400000,
      images: [
        'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Soundbar Xem Phim JBL Bar 5.1 Surround Có Loa Sub Không Dây',
      description: 'Hệ thống âm thanh rạp chiếu phim tại gia công nghệ JBL MultiBeam, loa subwoofer 10 inch rung chuyển phòng khách.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Đà Nẵng',
      startingPrice: 7200000,
      bidIncrement: 150000,
      buyNowPrice: 9500000,
      images: [
        'https://images.unsplash.com/photo-1543512214-318c7553f230?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Tai Nghe True Wireless Devialet Gemini II Khử Ồn Đỉnh Cao',
      description: 'Chất âm hi-end Pháp đẳng cấp, thiết kế hộp sạc mạ kim loại sang trọng, âm trường rộng mở chân thực.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 8500000,
      bidIncrement: 200000,
      buyNowPrice: 11000000,
      images: [
        'https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'dong-ho-trang-suc': [
    {
      title: 'Đồng Hồ Nam Tissot Le Locle Powermatic 80 Mặt Số La Mã',
      description: 'Bản Thụy Sĩ chính hãng trữ cót 80 giờ, nắp lưng lộ cơ chạm khắc tinh xảo, kính Sapphire chống trầy xước tuyệt đối.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 7800000,
      bidIncrement: 100000,
      buyNowPrice: 10500000,
      images: [
        'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Apple Watch Series 8 45mm Nhôm GPS Midnight Pin 95%',
      description: 'Cảm biến đo nồng độ oxy trong máu SpO2, đo điện tâm đồ ECG, theo dõi nhiệt độ cổ tay và giấc ngủ chi tiết.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 5400000,
      bidIncrement: 100000,
      buyNowPrice: 6900000,
      images: [
        'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đồng Hồ Seiko Presage Cocktail Time Automatic "Blue Moon"',
      description: 'Mặt số vân tia xanh lam ngọc quyến rũ lấy cảm hứng từ ly cocktail Blue Moon, bộ máy 4R35 bền bỉ của Nhật Bản.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Đà Nẵng',
      startingPrice: 5800000,
      bidIncrement: 100000,
      buyNowPrice: 7800000,
      images: [
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đồng Hồ Garmin Fenix 7 Sapphire Solar Bản Viền Titanium',
      description: 'Đỉnh cao đồng hồ thể thao ngoài trời mặt kính sạc năng lượng mặt trời, bản đồ địa hình Topo đa băng tần chính xác tuyệt đối.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 12500000,
      bidIncrement: 200000,
      buyNowPrice: 16000000,
      images: [
        'https://images.unsplash.com/photo-1510017803434-a899398421b3?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Dây Chuyền Vàng Ý 18K Đính Mặt Đá Moissanite 1 Carat',
      description: 'Dây chuyền vàng trắng 750 sáng lấp lánh, viên chủ Moissanite nước D độ sạch VVS1 có giấy kiểm định GRA.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 4600000,
      bidIncrement: 100000,
      buyNowPrice: 6500000,
      images: [
        'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đồng Hồ Casio G-Shock GA-2100 "CasiOak" All Black',
      description: 'Vỏ cấu trúc rỗng sợi carbon siêu bền chống sốc chống va đập, chống nước 200m bơi lặn thoải mái.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Hà Nội',
      startingPrice: 1400000,
      bidIncrement: 50000,
      buyNowPrice: 2000000,
      images: [
        'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Lắc Tay Bạc S925 Khắc Họa Tiết Chrome Hearts Bụi Bặm',
      description: 'Phong cách Gothic Rock mạnh mẽ cá tính, bạc 925 đúc dày dặn có phủ lớp oxi hóa vintage cổ điển.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 950000,
      bidIncrement: 30000,
      buyNowPrice: 1400000,
      images: [
        'https://images.unsplash.com/photo-1611591475155-4264774d0d12?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đồng Hồ Nữ Citizen Eco-Drive Năng Lượng Ánh Sáng Mạ Vàng',
      description: 'Bộ máy Eco-Drive không bao giờ cần thay pin, mặt khảm xà cừ đính 12 viên đá Swarovski lấp lánh.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Cần Thơ',
      startingPrice: 2600000,
      bidIncrement: 50000,
      buyNowPrice: 3500000,
      images: [
        'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Nhẫn Nam Bạc Thái Lan Đính Đá Mắt Hổ Phong Thủy Tự Nhiên',
      description: 'Đá mắt hổ vàng nâu tự nhiên vân sáng chuyển động theo góc nhìn, đem lại may mắn tài lộc và sự quyết đoán.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hải Phòng',
      startingPrice: 650000,
      bidIncrement: 20000,
      buyNowPrice: 950000,
      images: [
        'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Hộp Xoay Đồng Hồ Cơ 4 Ngăn Vỏ Gỗ Sơn Mài Piano Cực Êm',
      description: 'Động cơ Mabuchi Nhật Bản siêu êm không tiếng ồn, có đèn LED xanh nội thất sang trọng bảo vệ đồng hồ automatic.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 1800000,
      bidIncrement: 50000,
      buyNowPrice: 2600000,
      images: [
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'sach-truyen-tranh': [
    {
      title: 'Trọn Bộ Manga Dragon Ball (7 Viên Ngọc Rồng) 42 Tập Kim Đồng',
      description: 'Bộ truyện gắn liền với tuổi thơ thế hệ 8x 9x, chất lượng giấy đẹp không rách nát, giữ gìn cẩn thận trong tủ kính.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Hà Nội',
      startingPrice: 1200000,
      bidIncrement: 50000,
      buyNowPrice: 1800000,
      images: [
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bộ Sách Harry Potter 7 Tập Bìa Cứng Bản Đặc Biệt Minh Họa',
      description: 'Bản dịch kinh điển của dịch giả Lý Lan, minh hoạ tranh màu sắc nét của Jim Kay, bìa bọc nhũ vàng sang trọng.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1600000,
      bidIncrement: 50000,
      buyNowPrice: 2400000,
      images: [
        'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Trọn Bộ Tiểu Thuyết Trinh Thám Sherlock Holmes Toàn Tập 3 Cuốn',
      description: 'Bộ sưu tập đầy đủ 4 tiểu thuyết và 56 truyện ngắn của Arthur Conan Doyle do NXB Văn Học ấn hành.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Đà Nẵng',
      startingPrice: 450000,
      bidIncrement: 20000,
      buyNowPrice: 700000,
      images: [
        'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bộ Sách Lịch Sử Văn Minh Thế Giới (Will Durant) 11 Tập',
      description: 'Kiệt tác đồ sộ về lịch sử nhân loại của hai vợ chồng Will & Ariel Durant, bản in bìa cứng cao cấp.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 2800000,
      bidIncrement: 50000,
      buyNowPrice: 3800000,
      images: [
        'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Manga One Piece Hộp Boxset 1-23 Tập Đầu Tiên Bản Tiếng Nhật',
      description: 'Boxset sưu tầm nguyên gốc Nhật Bản Shueisha, có kèm poster kỷ niệm và booklet màu độc quyền.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1900000,
      bidIncrement: 50000,
      buyNowPrice: 2700000,
      images: [
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bộ Sách Nghệ Thuật & Thiết Kế "Grid Systems" & "Thinking with Type"',
      description: 'Bộ 2 cuốn sách gối đầu giường của mọi Designer đồ họa và Typography chuyên nghiệp, bản nhập khẩu tiếng Anh.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hà Nội',
      startingPrice: 850000,
      bidIncrement: 30000,
      buyNowPrice: 1300000,
      images: [
        'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Máy Đọc Sách Kindle Paperwhite 5 (Gen 11) 8GB Màn 6.8 inch',
      description: 'Đèn vàng ấm điều chỉnh được giúp đọc ban đêm không mỏi mắt, chống nước IPX8, pin dùng 10 tuần sạc 1 lần.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 2300000,
      bidIncrement: 50000,
      buyNowPrice: 2900000,
      images: [
        'https://images.unsplash.com/photo-1592496431122-2349e0fbc666?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bộ Truyện Tranh Doraemon Truyện Ngắn 45 Tập Bản Kỷ Niệm',
      description: 'Bộ truyện huyền thoại giấy xốp siêu nhẹ, bìa bóng đẹp nét không quăn mép, món quà ý nghĩa cho con em.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hải Phòng',
      startingPrice: 850000,
      bidIncrement: 30000,
      buyNowPrice: 1250000,
      images: [
        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bộ Sách Tâm Lý Học Ứng Dụng: Phi Lý Trí & Tư Duy Nhanh Và Chậm',
      description: 'Bộ sách bán chạy nhất toàn cầu về kinh tế học hành vi và tâm lý con người trong việc ra quyết định.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Cần Thơ',
      startingPrice: 280000,
      bidIncrement: 10000,
      buyNowPrice: 420000,
      images: [
        'https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Cuốn Sách Cổ "Đại Việt Sử Ký Toàn Thư" Bìa Da Khắc Chữ Nho',
      description: 'Ấn bản sưu tầm phục dựng đặc biệt, giấy dó cao cấp thơm mùi mực in truyền thống, có hộp gỗ bọc nhung.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 3500000,
      bidIncrement: 100000,
      buyNowPrice: 5000000,
      images: [
        'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'thoi-trang-giay-dep': [
    {
      title: 'Giày Sneaker Nike Air Jordan 1 Retro High OG "Chicago" Size 42',
      description: 'Phối màu huyền thoại Chicago Lost & Found, da cao cấp nứt rạn cổ điển, có hóa đơn mua hàng và dây phụ nguyên hộp.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 4800000,
      bidIncrement: 100000,
      buyNowPrice: 6500000,
      images: [
        'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Áo Khoác Da Thật Biker Jacket Nam AllSaints Size M Slimfit',
      description: 'Chất da cừu 100% mềm mại mùi thơm tự nhiên, khoá kéo kim loại màu bạc xám phong trần chuẩn phong cách London.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 5500000,
      bidIncrement: 100000,
      buyNowPrice: 7800000,
      images: [
        'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Túi Xách Nữ Gucci Marmont Matelassé Mini Da Đen Chính Hãng',
      description: 'Biểu tượng GG mạ vàng cổ, da chần bông mềm mại, dây xích đeo chéo sang trọng, kèm túi vải dustbag.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 19000000,
      bidIncrement: 300000,
      buyNowPrice: 25000000,
      images: [
        'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Giày Da Nam Oxford Da Bò Ý Thủ Công Goodyear Welted Size 41',
      description: 'Đế da khâu chỉ kép Goodyear bền bỉ 10 năm, đánh màu patina thủ công từ màu nâu cánh gián sang đen tuyền.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Đà Nẵng',
      startingPrice: 2600000,
      bidIncrement: 50000,
      buyNowPrice: 3800000,
      images: [
        'https://images.unsplash.com/photo-1533867617858-e7b97e060509?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Kính Mát Ray-Ban Aviator Classic Tròng Thủy Tinh Xanh G-15',
      description: 'Gọng mạ vàng 14k cổ điển, chống 100% tia UV, đeo dịu mắt đi biển hay lái xe đường dài cực êm.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1800000,
      bidIncrement: 50000,
      buyNowPrice: 2500000,
      images: [
        'https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Ví Nam Da Cá Sấu Nước Ngọt Nguyên Tấm Màu Nâu Đen',
      description: 'Làm từ da gai lưng cá sấu thật độc bản không trùng lặp, may chỉ sáp tay sắc sảo từng đường kim mũi chỉ.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hải Phòng',
      startingPrice: 850000,
      bidIncrement: 30000,
      buyNowPrice: 1300000,
      images: [
        'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Áo Hoodie Fear of God Essentials Core Collection Màu Xám Oatmeal',
      description: 'Chất nỉ bông dày dặn ấm áp, form rộng unisex streetwear thời thượng, logo in phản quang nổi bật sau lưng.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 1400000,
      bidIncrement: 50000,
      buyNowPrice: 2000000,
      images: [
        'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Thắt Lưng Da Nam Montblanc Reversible Khóa Kim Mạ Bạch Kim',
      description: 'Dây da 2 mặt đen và nâu xoay đảo chiều tiện lợi phối đồ suit công sở hay quần jeans năng động.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 3200000,
      bidIncrement: 50000,
      buyNowPrice: 4500000,
      images: [
        'https://images.unsplash.com/photo-1624222247344-550fb60583dc?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Giày Sneaker New Balance 990v5 Made in USA Xám Classic Size 42.5',
      description: 'Đế đệm ENCAP siêu êm ái hỗ trợ vận động cả ngày dài, chất liệu da lộn pigskin cao cấp sản xuất trực tiếp tại Mỹ.',
      condition: 'Đã sử dụng (Tốt)',
      location: 'Cần Thơ',
      startingPrice: 2400000,
      bidIncrement: 50000,
      buyNowPrice: 3400000,
      images: [
        'https://images.unsplash.com/photo-1539185441755-769473a23570?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Balo Chống Nước Bellroy Transit Backpack 28L Màu Midnight',
      description: 'Balo du lịch công tác thông minh có ngăn laptop 16 inch riêng biệt, chất liệu vải tái chế chống thấm nước mưa.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 3100000,
      bidIncrement: 50000,
      buyNowPrice: 4200000,
      images: [
        'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ],

  'khac': [
    {
      title: 'Bộ Lego Creator Expert Porsche 911 (10295) Fullbox 1458 Chi Tiết',
      description: 'Đã lắp ráp hoàn thiện trưng bày tủ kính, có thể tùy biến 2 phiên bản Turbo hoặc Targa cổ điển, đầy đủ hộp và sách hướng dẫn.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 2700000,
      bidIncrement: 50000,
      buyNowPrice: 3800000,
      images: [
        'https://images.unsplash.com/photo-1585366119957-e9730b6d0f60?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bàn Đấu Cờ Tướng Bằng Gỗ Mun Vân Gỗ Quý Kèm Quân Cờ Sừng Trâu',
      description: 'Quân cờ tiện tay gõ tiếng đanh chắc nịch, mặt bàn chạm khắc rồng phượng tinh xảo mang giá trị nghệ thuật cao.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1800000,
      bidIncrement: 50000,
      buyNowPrice: 2700000,
      images: [
        'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đàn Guitar Acoustic Taylor Academy 10e Có Pickup EQ',
      description: 'Gỗ vân sam Sitka cộng hưởng âm thanh vang ấm dồi dào, vát tì tay công thái học chơi lâu không cấn mỏi.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Đà Nẵng',
      startingPrice: 11500000,
      bidIncrement: 200000,
      buyNowPrice: 14500000,
      images: [
        'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Mô Hình Tàu Vũ Trụ NASA Apollo Saturn V Cao 1 Mét',
      description: 'Mô hình tỷ lệ 1:110 có thể tháo rời 3 tầng tên lửa và khoang đổ bộ mặt trăng Lunar Lander siêu chi tiết.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 2200000,
      bidIncrement: 50000,
      buyNowPrice: 3200000,
      images: [
        'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bật Lửa Zippo Armor Mạ Vàng 24K Chạm Khắc Họa Tiết Nhật Bản',
      description: 'Bản vỏ dày Armor tiếng mở nắp thanh vang ngân dài, ruột zippo chính hãng giữ xăng tốt không hao.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 1500000,
      bidIncrement: 30000,
      buyNowPrice: 2200000,
      images: [
        'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Kính Thiên Văn Khúc Xạ Celestron AstroMaster 70AZ Ngắm Mặt Trăng',
      description: 'Đường kính quang học 70mm phủ lớp chống phản xạ, ngắm rõ các miệng hố trên bề mặt Mặt Trăng và vành đai sao Thổ.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Hải Phòng',
      startingPrice: 2400000,
      bidIncrement: 50000,
      buyNowPrice: 3300000,
      images: [
        'https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Máy Pha Cà Phê Espresso Thủ Công Flair PRO 2 Áp Suất 9 Bar',
      description: 'Cỗ máy chiết xuất cà phê espresso thủ công đậm đà lớp crema dày mịn chuẩn quán cafe Specialty.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 6200000,
      bidIncrement: 100000,
      buyNowPrice: 7900000,
      images: [
        'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Đèn Ngủ Bàn Gỗ Epoxy Resin Tự Nhiên Vân Sóng Biển Đảo 3D',
      description: 'Tác phẩm thủ công kết hợp gỗ lũa tự nhiên và keo resin cao cấp tạo hình đáy biển sâu với thợ lặn và cá voi phát sáng.',
      condition: 'Mới 100%',
      location: 'TP. Hồ Chí Minh',
      startingPrice: 980000,
      bidIncrement: 30000,
      buyNowPrice: 1500000,
      images: [
        'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Xe Đạp Đua Road Bike Khung Carbon Twitter Stealth Pro Group Shimano',
      description: 'Trọng lượng siêu nhẹ chỉ 8.5kg, phanh đĩa dầu an toàn, líp tầng chuyển số mượt mà cho các buổi rèn luyện thể thao.',
      condition: 'Đã sử dụng (Rất tốt)',
      location: 'Đà Nẵng',
      startingPrice: 14500000,
      bidIncrement: 200000,
      buyNowPrice: 18500000,
      images: [
        'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80'
      ]
    },
    {
      title: 'Bút Máy Cao Cấp Parker Sonnet Lacquer Black Vàng 18K Nib F',
      description: 'Thân kim loại phủ sơn mài đen tuyền bóng bẩy, ngòi bút khắc hoa văn vàng 18K viết êm lướt nhẹ trên mọi chất liệu giấy.',
      condition: 'Đã sử dụng (Như mới)',
      location: 'Hà Nội',
      startingPrice: 4200000,
      bidIncrement: 100000,
      buyNowPrice: 5800000,
      images: [
        'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=800&auto=format&fit=crop&q=80'
      ]
    }
  ]
};

async function seed() {
  console.log('🚀 Starting Seeding 10 Products per Category...');

  // Find all categories
  const categories = await prisma.category.findMany();
  const categoryMap = new Map();
  categories.forEach(c => categoryMap.set(c.slug, c));

  // Find Sellers
  const sellers = await prisma.user.findMany({
    where: {
      email: { in: ['seller1@email.com', 'seller2@email.com', 'seller3@email.com', 'letuananh1207204@gmail.com'] }
    }
  });

  if (sellers.length === 0) {
    console.error('❌ No sellers found in database!');
    return;
  }

  // Find Buyers
  const buyers = await prisma.user.findMany({
    where: {
      email: { in: ['buyer1@email.com', 'buyer2@email.com', 'buyer3@email.com'] }
    }
  });

  const now = new Date();
  let createdCount = 0;

  for (const [catSlug, productList] of Object.entries(categoryProductsData)) {
    const category = categoryMap.get(catSlug);
    if (!category) {
      console.warn(`⚠️ Category slug "${catSlug}" not found in DB! Skipping...`);
      continue;
    }

    console.log(`\n📦 Seeding category: ${category.name} (${productList.length} products)...`);

    for (let i = 0; i < productList.length; i++) {
      const pData = productList[i];
      const seller = sellers[i % sellers.length];

      // Create Product
      const product = await prisma.product.create({
        data: {
          title: pData.title,
          description: pData.description,
          condition: pData.condition,
          location: pData.location,
          images: pData.images,
          status: ProductStatus.IN_AUCTION,
          ownerId: seller.id,
          categoryId: category.id
        }
      });

      // Auction Timing: Started 2 to 24 hours ago, ends in 2 to 7 days
      const hoursAgo = 2 + (i % 20);
      const daysAhead = 2 + (i % 5);
      const startTime = new Date(now.getTime() - hoursAgo * 3600 * 1000);
      const endTime = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000 + (i * 1800 * 1000));

      // Simulate 1 to 3 active bids
      const bidCount = 1 + (i % 4); // 1 to 4 bids
      let currentPrice = pData.startingPrice;
      const bidList = [];

      for (let b = 1; b <= bidCount; b++) {
        currentPrice += pData.bidIncrement;
        const buyer = buyers[(i + b) % buyers.length];
        const bidTime = new Date(startTime.getTime() + (b * 3600 * 1000) + (i * 300 * 1000));
        bidList.push({
          buyer,
          amount: currentPrice,
          time: bidTime
        });
      }

      const winner = bidList.length > 0 ? bidList[bidList.length - 1].buyer : null;

      // Create Auction
      const auction = await prisma.auction.create({
        data: {
          productId: product.id,
          startingPrice: pData.startingPrice,
          currentPrice: currentPrice,
          bidIncrement: pData.bidIncrement,
          buyNowPrice: pData.buyNowPrice,
          shippingCost: 30000,
          status: AuctionStatus.ACTIVE,
          startTime: startTime,
          endTime: endTime,
          views: 35 + (i * 27) + Math.floor(Math.random() * 50),
          currentWinnerId: winner ? winner.id : null
        }
      });

      // Insert Bids
      for (const b of bidList) {
        await prisma.bid.create({
          data: {
            auctionId: auction.id,
            userId: b.buyer.id,
            amount: b.amount,
            createdAt: b.time
          }
        });
      }

      createdCount++;
      process.stdout.write(`  ✓ [${i + 1}/10] ${pData.title.slice(0, 45)}...\n`);
    }
  }

  console.log(`\n🎉 DONE! Successfully seeded ${createdCount} active products & auctions across all 8 categories.`);
}

seed()
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
