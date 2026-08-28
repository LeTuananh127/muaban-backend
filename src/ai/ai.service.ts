import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getPlatformFeePercent } from '../escrow/escrow.service';

@Injectable()
export class AiService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  async getChatResponse(message: string, history: Array<{ role: 'user' | 'model'; text: string }>) {
    if (!this.genAI) {
      return (
        'Chào bạn! Trợ lý AI Bazzar chưa được kích hoạt vì thiếu GEMINI_API_KEY trong cấu hình backend. ' +
        'Vui lòng thêm GEMINI_API_KEY vào tệp `.env` của backend (auction-system/.env) và khởi động lại server để bắt đầu trò chuyện với AI của hệ thống!'
      );
    }

    try {
      // 1. Fetch categories
      const categories = await this.prisma.category.findMany({
        select: { id: true, name: true, slug: true },
        take: 30,
      });

      // 2. Intelligent Category and Keyword Extraction
      const rawMessage = message.trim();
      const lowerMsg = rawMessage.toLowerCase();

      // Category keywords mapping dictionary
      const categoryKeywordsMap: Record<string, { slug: string; name: string; icon: string; keywords: string[] }> = {
        'dien-thoai-phu-kien': {
          slug: 'dien-thoai-phu-kien',
          name: 'Điện thoại & Phụ kiện',
          icon: '📱',
          keywords: [
            'điện thoại', 'dien thoai', 'đt', 'dt', 'smartphone', 'phone', 'iphone', 'samsung',
            'xiaomi', 'pixel', 'ipad', 'airpod', 'sạc dự phòng', 'ốp lưng', 'gimbal', 'apple watch', 'tai nghe apple',
          ],
        },
        'may-tinh-laptop': {
          slug: 'may-tinh-laptop',
          name: 'Máy tính & Laptop',
          icon: '💻',
          keywords: [
            'máy tính', 'may tinh', 'laptop', 'macbook', 'dell', 'asus', 'rog', 'pc',
            'bàn phím', 'chuột', 'màn hình', 'ssd', 'card màn hình', 'rtx', 'ghế công thái học', 'keychron', 'logitech',
          ],
        },
        'may-anh-may-quay': {
          slug: 'may-anh-may-quay',
          name: 'Máy ảnh & Máy quay',
          icon: '📷',
          keywords: [
            'máy ảnh', 'may anh', 'máy quay', 'may quay', 'camera', 'sony alpha', 'a7',
            'fujifilm', 'canon', 'eos', 'lens', 'ống kính', 'gopro', 'flycam', 'dji', 'godox', 'chân máy', 'tripod',
          ],
        },
        'am-thanh-loa': {
          slug: 'am-thanh-loa',
          name: 'Âm thanh & Loa',
          icon: '🎵',
          keywords: [
            'âm thanh', 'am thanh', 'loa', 'speaker', 'tai nghe', 'headphone', 'marshall',
            'sony wh', 'jbl', 'mâm đĩa than', 'sennheiser', 'homepod', 'dac', 'soundbar', 'devialet',
          ],
        },
        'dong-ho-trang-suc': {
          slug: 'dong-ho-trang-suc',
          name: 'Đồng hồ & Trang sức',
          icon: '⌚',
          keywords: [
            'đồng hồ', 'dong ho', 'watch', 'tissot', 'seiko', 'garmin', 'casio',
            'g-shock', 'citizen', 'trang sức', 'dây chuyền', 'lắc tay', 'nhẫn', 'bạc', 'vàng', 'hộp xoay',
          ],
        },
        'sach-truyen-tranh': {
          slug: 'sach-truyen-tranh',
          name: 'Sách & Truyện tranh',
          icon: '📚',
          keywords: [
            'sách', 'sach', 'truyện', 'truyen', 'manga', 'comic', 'dragon ball',
            'harry potter', 'sherlock', 'one piece', 'kindle', 'doraemon', 'đại việt sử ký', 'tâm lý học',
          ],
        },
        'thoi-trang-giay-dep': {
          slug: 'thoi-trang-giay-dep',
          name: 'Thời trang & Giày dép',
          icon: '👟',
          keywords: [
            'thời trang', 'thoi trang', 'giày', 'giay', 'sneaker', 'nike', 'jordan',
            'allsaints', 'gucci', 'oxford', 'ray-ban', 'kính mát', 'ví', 'hoodie', 'thắt lưng', 'new balance', 'balo',
          ],
        },
        'khac': {
          slug: 'khac',
          name: 'Khác',
          icon: '✨',
          keywords: [
            'lego', 'cờ tướng', 'guitar', 'đàn', 'mô hình', 'zippo', 'bật lửa',
            'kính thiên văn', 'máy pha cà phê', 'flair', 'resin', 'xe đạp', 'bút máy', 'parker',
          ],
        },
      };

      // Detect matched category from query keywords
      let matchedCategorySlug: string | null = null;
      let matchedCategoryInfo: { slug: string; name: string; icon: string } | null = null;

      for (const [slug, info] of Object.entries(categoryKeywordsMap)) {
        if (info.keywords.some((kw) => lowerMsg.includes(kw))) {
          matchedCategorySlug = slug;
          matchedCategoryInfo = info;
          break;
        }
      }

      // Extract specific search terms (cleaning stop words)
      const stopWords = [
        'tìm', 'cho', 'tôi', 'mình', 'em', 'anh', '1', 'một', 'vài', 'vái', 'cái', 'chiếc', 'đi', 'cơ', 'mà',
        'xem', 'có', 'nào', 'không', 'ko', 'k', 'với', 'hộ', 'giúp', 'muốn', 'mua', 'cần', 'ạ', 'nhé', 'ơi',
        'ad', 'bạn', 'sản phẩm', 'đồ', 'hàng', 'đang', 'bán', 'đấu', 'giá', 'hot', 'nổi bật', 'gợi ý',
      ];
      const searchTokens = lowerMsg
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !stopWords.includes(w));

      // 3. Build Prisma query
      let matchingAuctions: any[] = [];

      if (matchedCategorySlug) {
        // Query by matched category
        matchingAuctions = await this.prisma.auction.findMany({
          where: {
            status: 'ACTIVE',
            endTime: { gt: new Date() },
            product: {
              category: { slug: matchedCategorySlug },
            },
          },
          include: {
            product: {
              include: {
                category: true,
                owner: { select: { name: true } },
              },
            },
            bids: { select: { id: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        });
      }

      if (matchingAuctions.length === 0 && searchTokens.length > 0) {
        // Query by specific search tokens in title, description, or category name
        matchingAuctions = await this.prisma.auction.findMany({
          where: {
            status: 'ACTIVE',
            endTime: { gt: new Date() },
            OR: searchTokens.map((token) => ({
              OR: [
                { product: { title: { contains: token, mode: 'insensitive' } } },
                { product: { description: { contains: token, mode: 'insensitive' } } },
                { product: { category: { name: { contains: token, mode: 'insensitive' } } } },
              ],
            })),
          },
          include: {
            product: {
              include: {
                category: true,
                owner: { select: { name: true } },
              },
            },
            bids: { select: { id: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        });
      }

      // If still no keyword match, provide a balanced top active auctions list across categories
      if (matchingAuctions.length === 0) {
        matchingAuctions = await this.prisma.auction.findMany({
          where: {
            status: 'ACTIVE',
            endTime: { gt: new Date() },
          },
          include: {
            product: {
              include: {
                category: true,
                owner: { select: { name: true } },
              },
            },
            bids: { select: { id: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        });
      }

      const categoriesStr = categories.map((c) => c.name).join(', ');
      const auctionsStr = matchingAuctions
        .map((a) => {
          const currentPrice = Number(a.currentPrice || a.startingPrice);
          const bidCount = a.bids ? a.bids.length : 0;
          return `- [${a.product.title}](/auction/${a.id}) (Danh mục: ${a.product.category?.name || 'Khác'}): Giá hiện tại ${currentPrice.toLocaleString('vi-VN')}đ, ${bidCount} lượt đấu giá, Kết thúc: ${new Date(a.endTime).toLocaleString('vi-VN')}`;
        })
        .join('\n');

      const feePercent = getPlatformFeePercent();
      const systemInstruction = `
Bạn là "Bazzar AI Assistant" (Trợ lý Trí tuệ Nhân tạo thông minh của sàn đấu giá đồ cũ trực tuyến Bazzar).
Nhiệm vụ của bạn là:
1. Giải đáp mọi thắc mắc của người dùng về cách bán và mua đồ cũ bằng hình thức đấu giá trực tuyến.
2. Hỗ trợ tìm kiếm, tra cứu và tư vấn sản phẩm đồ cũ phù hợp theo ngân sách và nhu cầu.
3. Giải thích chi tiết quy trình ký quỹ ví Escrow, quy tắc chống bắn tỉa Anti-sniping, chính sách bảo vệ người dùng một cách ngắn gọn, thân thiện và súc tích bằng Tiếng Việt.
4. Giới thiệu về thông tin Đồ án & Tác giả khi được hỏi: Sàn đấu giá đồ cũ Bazzar được phát triển bởi sinh viên **Lê Tuấn Anh** (MSV: **22010165**), Lớp **K16-CNTT2**, Trường Đại học Phenikaa.

Dưới đây là thông tin thời gian thực về sản phẩm và hệ thống để bạn tham khảo khi trả lời:
- Các danh mục đồ cũ trên hệ thống: ${categoriesStr || 'Chưa có danh mục nào'}
- Các phiên đấu giá đồ cũ phù hợp/đang diễn ra:
${auctionsStr || 'Hiện tại chưa có phiên đấu giá nào đang diễn ra.'}

Quy tắc ứng xử và nghiệp vụ:
1. Luôn phản hồi lịch sự, thân thiện, dùng emoji phù hợp.
2. Nếu người dùng hỏi mua hoặc tìm kiếm sản phẩm (ví dụ điện thoại, laptop, máy ảnh, loa, đồng hồ, sách, thời trang...), hãy đối chiếu với danh sách đấu giá ở trên. Hãy giới thiệu các sản phẩm phù hợp và cung cấp liên kết theo định dạng markdown của React Router, ví dụ: [Tên sản phẩm](/auction/ID-của-sản-phẩm). Đừng tạo link ra trang web khác ngoài hệ thống.
3. Hướng dẫn quy trình Đăng bán đồ cũ bằng đấu giá:
   - **Bước 1**: [Đăng ký tài khoản](/register) hoặc [Đăng nhập](/login).
   - **Bước 2 - Xác minh người bán (KYC)**: Truy cập trang [Trang cá nhân](/profile) để gửi ảnh chụp CCCD 2 mặt và thông tin người bán.
   - **Bước 3 - Xét duyệt**: Chờ Quản trị viên (Admin) phê duyệt hồ sơ.
   - **Bước 4 - Đăng tin đấu giá**: Truy cập [Đăng sản phẩm mới](/create-listing) để đặt giá khởi điểm, bước giá, chọn 1 trong 3 bố cục Layout và thiết lập quy tắc Anti-sniping gia hạn tự động.
4. Giải thích các tính năng cốt lõi khi được hỏi:
   - **Đấu giá trực tiếp (Bidding)**: Đặt mức giá mới cao hơn giá hiện tại + bước giá tối thiểu. Số dư cọc tương ứng sẽ tạm giữ trong Ví ký quỹ (WalletHold).
   - **Ví ký quỹ cọc (Escrow Wallet Hold)**: Khóa cọc tự động khi đặt giá, tự động hoàn trả 100% tiền cọc ngay khi bị người khác đè giá cao hơn.
   - **Chống canh phút chót (Dynamic Anti-sniping)**: Tự động cộng thêm thời gian nếu có lượt đặt giá hợp lệ ở những phút cuối phiên đấu giá.
   - **Phí sàn**: Người bán chịu ${feePercent}% phí giao dịch khi đấu giá thành công (chuyển sang trạng thái Hoàn thành). Người mua hoàn toàn miễn phí giao dịch.
   - **Xử lý khiếu nại hoàn tiền (Refund)**: Người mua có quyền mở yêu cầu hoàn tiền nếu đồ cũ nhận được không đúng như mô tả.
5. Trả lời ngắn gọn, tập trung vào câu hỏi, tránh dài dòng lan man.
`;

      // Candidate models for Google Generative AI
      const candidateModels = [
        'gemini-3.6-flash',
        'gemini-2.5-pro',
        'gemini-2.0-flash-exp',
      ];

      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
          });

          const chat = model.startChat({
            history: history.map((h) => ({
              role: h.role,
              parts: [{ text: h.text }],
            })),
          });

          const result = await chat.sendMessage(message);
          return result.response.text();
        } catch (modelErr) {
          console.warn(`Model ${modelName} failed, trying fallback...`, modelErr?.message || modelErr);
          continue;
        }
      }

      // Smart Fallback Assistant Response if Gemini API Key quota is exceeded or unreachable
      if (['chủ', 'tên gì', 'ai tạo', 'tác giả', 'sinh viên', 'người tạo', 'tuấn anh', 'lê tuấn anh', 'phenikaa', 'msv', 'mssv'].some((w) => lowerMsg.includes(w))) {
        return (
          '🎓 **Thông tin Tác giả & Đồ án Tốt nghiệp**:\n\n' +
          '• **Hệ thống**: **Bazzar** — Sàn Mua Bán & Đấu Giá Đồ Cũ Trực Tuyến.\n' +
          '• **Sinh viên thực hiện**: **Lê Tuấn Anh** (MSV: **22010165**) — Lớp **K16-CNTT2**.\n' +
          '• **Trường**: Đại học Phenikaa — Khoa Công nghệ Thông tin.\n\n' +
          'Ứng dụng được xây dựng với mục tiêu mang đến nền tảng Re-commerce đấu giá đồ cũ minh bạch, an toàn qua Ví ký quỹ Escrow và Trợ lý AI!'
        );
      } else if (['hello', 'hi', 'chào', 'xin chào', 'chao', 'hey'].some((w) => lowerMsg.includes(w))) {
        return (
          '👋 **Chào bạn! Trợ lý AI Bazzar rất vui được hỗ trợ bạn.**\n\n' +
          'Tôi có thể giúp bạn tư vấn sản phẩm, hướng dẫn đăng bán đồ cũ, quy trình đặt giá đấu giá, cơ chế ký quỹ ví Escrow, hoặc tìm kiếm các sản phẩm hot đang đấu giá trên sàn. Bạn cần hỗ trợ thông tin gì ạ?'
        );
      } else if (
        matchedCategoryInfo ||
        ['gợi ý', 'sản phẩm', 'đang bán', 'đang đấu', 'có gì', 'gợi ý sản phẩm', 'tìm', 'đồ', 'cơ mà'].some((w) => lowerMsg.includes(w))
      ) {
        if (matchingAuctions.length > 0) {
          const categoryTitle = matchedCategoryInfo
            ? `${matchedCategoryInfo.icon} Danh sách sản phẩm **${matchedCategoryInfo.name}**`
            : '🔥 Gợi ý các sản phẩm đang Đấu giá Nổi bật';
          const listStr = matchingAuctions
            .map((a) => {
              const currentPrice = Number(a.currentPrice || a.startingPrice);
              const bidCount = a.bids ? a.bids.length : 0;
              return `• 🏷️ [${a.product.title}](/auction/${a.id}) (${a.product.category?.name || 'Đồ cũ'}) — Giá hiện tại: **${currentPrice.toLocaleString('vi-VN')}đ** (${bidCount} lượt đấu giá)`;
            })
            .join('\n');
          return `${categoryTitle} trên Bazaar:\n\n${listStr}\n\n👉 Bạn bấm trực tiếp vào tên sản phẩm để xem chi tiết và tham gia đặt giá ngay nhé!`;
        }
        return 'Dạ hiện tại sàn đang chuẩn bị cập nhật thêm các phiên đấu giá cho danh mục này. Bạn quay lại sau ít phút nhé!';
      } else if (lowerMsg.includes('đăng') || lowerMsg.includes('bán') || lowerMsg.includes('tạo')) {
        return (
          '🤖 **Hướng dẫn Đăng bán Đấu giá Đồ cũ trên Bazaar**:\n\n' +
          '1️⃣ **Bước 1**: Đăng nhập tài khoản Seller.\n' +
          '2️⃣ **Bước 2**: Xác minh danh tính người bán (CCCD) tại trang Cá nhân / KYC.\n' +
          '3️⃣ **Bước 3**: Truy cập trang [Đăng sản phẩm mới](/create-listing).\n' +
          '4️⃣ **Bước 4**: Tải ảnh đồ cũ, nhập giá khởi điểm, bước giá và thiết lập thời gian kết thúc đấu giá.'
        );
      } else if (lowerMsg.includes('phí') || lowerMsg.includes('tiền')) {
        return (
          '🤖 **Chính sách Phí dịch vụ Sàn Bazaar**:\n\n' +
          '• **Người mua**: Miễn phí 100% giao dịch khi tham gia đấu giá.\n' +
          `• **Người bán**: Phí sàn tiêu chuẩn là **${feePercent}%** trên tổng giá trị giao dịch thành công (chỉ trích trừ khi đơn hàng hoàn tất).`
        );
      } else if (lowerMsg.includes('escrow') || lowerMsg.includes('cọc') || lowerMsg.includes('ví')) {
        return (
          '🤖 **Cơ chế Ký quỹ Ví Escrow Hold**:\n\n' +
          'Khi đặt giá, hệ thống sẽ tạm giữ tiền cọc trong Ví Escrow. ' +
          'Nếu có người khác đặt giá cao hơn, 100% tiền cọc sẽ được tự động hoàn trả về Ví khả dụng của bạn ngay lập tức!'
        );
      } else if (lowerMsg.includes('mua') || lowerMsg.includes('đấu giá') || lowerMsg.includes('đặt giá')) {
        return (
          '🤖 **Hướng dẫn Tham gia Đấu giá**:\n\n' +
          '• Bạn chọn sản phẩm yêu thích và nhập mức giá đặt cao hơn giá hiện tại + bước giá tối thiểu.\n' +
          '• Tiền cọc sẽ được tạm giữ an toàn trong Ví Escrow.\n' +
          '• Nếu chiến thắng phiên đấu giá, bạn tiến hành thanh toán đơn hàng để Người bán giao hàng cho bạn!'
        );
      }

      return (
        '🤖 **Trợ lý AI Bazaar hân hạnh hỗ trợ bạn**!\n\n' +
        'Tôi có thể giải đáp cho bạn về:\n' +
        '• **Tác giả dự án**: Thông tin sinh viên thực hiện & Trường.\n' +
        '• **Đăng bán đấu giá**: Cách tạo bài viết, đặt bước giá & chọn layout.\n' +
        '• **Cơ chế Ký quỹ Ví Escrow**: Đặt cọc an toàn & hoàn tiền tự động.\n' +
        '• **Chính sách phí sàn**: Miễn phí cho người mua, phí ưu đãi cho người bán.\n' +
        '• **Tìm kiếm sản phẩm**: Bạn có thể gõ "Tìm điện thoại", "Laptop", "Máy ảnh", v.v. để xem các sản phẩm đang đấu giá.'
      );
    } catch (error) {
      console.error('AI Service Chat Error:', error);
      return 'Xin lỗi, tôi đang gặp sự cố kết nối AI. Bạn vui lòng thử lại sau nhé!';
    }
  }

  async generateListingContent(title: string, category?: string, condition?: string, imageUrl?: string) {
    // 1. Layer 1: Fetch/Parse product image buffer for Multimodal Gemini Vision if imageUrl is provided
    let imagePart: any = null;
    if (imageUrl) {
      if (imageUrl.startsWith('data:')) {
        try {
          const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches && matches[2]) {
            imagePart = {
              inlineData: {
                mimeType: matches[1] || 'image/jpeg',
                data: matches[2],
              },
            };
          }
        } catch (err) {
          console.warn('Failed to parse base64 data URL for Gemini Vision:', err);
        }
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const base64Data = Buffer.from(arrayBuffer).toString('base64');
            const mimeType = response.headers.get('content-type') || 'image/jpeg';
            imagePart = {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            };
          }
        } catch (err) {
          console.warn('Failed to fetch image for Gemini Vision:', err);
        }
      }
    }

    // 2. Layer 2: Query past successful sales from PostgreSQL database if available
    let historicalContext = '';
    try {
      const keywords = title.trim().split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
      if (keywords.length > 0) {
        const pastAuctions = await this.prisma.auction.findMany({
          where: {
            status: 'ENDED',
            product: {
              OR: keywords.map((kw) => ({
                title: { contains: kw, mode: 'insensitive' },
              })),
            },
          },
          select: {
            currentPrice: true,
            startingPrice: true,
            product: { select: { title: true } },
          },
          take: 5,
        });

        if (pastAuctions.length > 0) {
          const prices = pastAuctions.map((a) => Number(a.currentPrice || a.startingPrice));
          const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
          historicalContext = `Dữ liệu lịch sử giao dịch đấu giá thành công trên CSDL Bazaar: Đã có ${pastAuctions.length} sản phẩm tương tự chốt thành công với mức giá trung bình là ${avgPrice.toLocaleString('vi-VN')} VNĐ.`;
        }
      }
    } catch (e) {
      console.warn('Error querying historical auction prices:', e);
    }

    // 3. Layer 3: Advanced dynamic fallback valuation matrix for Vietnamese second-hand market
    const titleLower = title.toLowerCase();
    let estimatedMarketValue = 250000; // Default sensible market value for everyday items

    // Smart Regex Parser for iPhone series (iPhone 16, 15, 14, 13, 12...)
    const iphoneMatch = titleLower.match(/iphone\s*(\d+)(\s*pro\s*max|\s*pro|\s*plus)?/i);
    const samsungMatch = titleLower.match(/s2(\d+)\s*(ultra|plus)?/i);

    if (iphoneMatch) {
      const versionNumber = parseInt(iphoneMatch[1], 10);
      const subType = (iphoneMatch[2] || '').toLowerCase();

      let basePrice = 8000000;
      if (versionNumber >= 16) {
        basePrice = subType.includes('pro max') ? 34000000 : subType.includes('pro') ? 28000000 : 21000000;
      } else if (versionNumber === 15) {
        basePrice = subType.includes('pro max') ? 24000000 : subType.includes('pro') ? 20500000 : 16000000;
      } else if (versionNumber === 14) {
        basePrice = subType.includes('pro max') ? 18500000 : subType.includes('pro') ? 15500000 : 12500000;
      } else if (versionNumber === 13) {
        basePrice = subType.includes('pro max') ? 13500000 : subType.includes('pro') ? 11500000 : 9500000;
      } else if (versionNumber === 12) {
        basePrice = subType.includes('pro max') ? 10500000 : subType.includes('pro') ? 9000000 : 7500000;
      } else {
        basePrice = 6000000;
      }

      // Storage capacity additions
      if (titleLower.includes('1tb')) basePrice += 4500000;
      else if (titleLower.includes('512gb')) basePrice += 2500000;
      else if (titleLower.includes('256gb')) basePrice += 1000000;

      estimatedMarketValue = basePrice;
    } else if (samsungMatch) {
      const sNum = parseInt(samsungMatch[1], 10);
      const isUltra = (samsungMatch[2] || '').toLowerCase() === 'ultra';

      if (sNum >= 24) estimatedMarketValue = isUltra ? 23000000 : 17000000;
      else if (sNum === 23) estimatedMarketValue = isUltra ? 16500000 : 12500000;
      else if (sNum === 22) estimatedMarketValue = isUltra ? 12000000 : 9000000;

      if (titleLower.includes('1tb') || titleLower.includes('512gb')) estimatedMarketValue += 2000000;
    } else if (titleLower.includes('macbook')) {
      if (titleLower.includes('m3 max') || titleLower.includes('m2 max') || titleLower.includes('m1 max')) {
        estimatedMarketValue = 38000000;
      } else if (titleLower.includes('16 inch') || titleLower.includes('16"') || titleLower.includes('16-inch')) {
        estimatedMarketValue = 28500000;
      } else if (titleLower.includes('14 inch') || titleLower.includes('14"') || titleLower.includes('14-inch')) {
        estimatedMarketValue = 23000000;
      } else if (titleLower.includes('air m2') || titleLower.includes('air m3')) {
        estimatedMarketValue = 18500000;
      } else if (titleLower.includes('air m1')) {
        estimatedMarketValue = 12500000;
      } else {
        estimatedMarketValue = 18000000;
      }

      // Storage boost for 1TB / 2TB / 512GB
      if (titleLower.includes('1tb') || titleLower.includes('2tb')) {
        estimatedMarketValue += 4000000;
      } else if (titleLower.includes('512gb')) {
        estimatedMarketValue += 1500000;
      }
    } else if (titleLower.includes('rtx 4090') || titleLower.includes('rtx 4080')) {
      estimatedMarketValue = 35000000;
    } else if (titleLower.includes('sony a7') || titleLower.includes('canon r6')) {
      estimatedMarketValue = 30000000;
    } else if (titleLower.includes('laptop') || titleLower.includes('gaming') || titleLower.includes('asus rog') || titleLower.includes('thinkpad')) {
      estimatedMarketValue = 16000000;
    } else if (
      titleLower.includes('cốc giữ nhiệt') ||
      titleLower.includes('bình giữ nhiệt') ||
      titleLower.includes('ly giữ nhiệt') ||
      titleLower.includes('fanhouse') ||
      titleLower.includes('lock&lock') ||
      titleLower.includes('lock and lock') ||
      titleLower.includes('elmich') ||
      titleLower.includes('cốc nước') ||
      titleLower.includes('bình nước')
    ) {
      if (titleLower.includes('stanley') || titleLower.includes('yeti')) {
        estimatedMarketValue = 550000;
      } else {
        estimatedMarketValue = 160000; // Fanhouse, Lock&Lock tumbler ~160.000 VNĐ
      }
    } else if (
      titleLower.includes('sách') ||
      titleLower.includes('truyện') ||
      titleLower.includes('manga') ||
      titleLower.includes('comic') ||
      titleLower.includes('doraemon') ||
      titleLower.includes('conan') ||
      titleLower.includes('one piece') ||
      titleLower.includes('tiểu thuyết')
    ) {
      if (titleLower.includes('trọn bộ') || titleLower.includes('full bộ') || titleLower.includes('boxset')) {
        estimatedMarketValue = 450000;
      } else {
        estimatedMarketValue = 65000;
      }
    } else if (
      titleLower.includes('ốp lưng') ||
      titleLower.includes('cường lực') ||
      titleLower.includes('cáp sạc') ||
      titleLower.includes('dây sạc') ||
      titleLower.includes('lót chuột') ||
      titleLower.includes('giá đỡ')
    ) {
      estimatedMarketValue = 85000;
    } else if (
      titleLower.includes('áo thun') ||
      titleLower.includes('áo phông') ||
      titleLower.includes('quần short') ||
      titleLower.includes('mũ') ||
      titleLower.includes('nón')
    ) {
      estimatedMarketValue = 150000;
    } else if (
      titleLower.includes('giày') ||
      titleLower.includes('sneaker') ||
      titleLower.includes('nike') ||
      titleLower.includes('adidas') ||
      titleLower.includes('jordan')
    ) {
      estimatedMarketValue = titleLower.includes('jordan') || titleLower.includes('yeezy') ? 2500000 : 850000;
    } else if (
      titleLower.includes('tai nghe') ||
      titleLower.includes('airpod') ||
      titleLower.includes('headphone')
    ) {
      if (titleLower.includes('airpod pro') || titleLower.includes('sony wh')) {
        estimatedMarketValue = 3200000;
      } else if (titleLower.includes('airpod')) {
        estimatedMarketValue = 1800000;
      } else {
        estimatedMarketValue = 250000;
      }
    } else if (
      titleLower.includes('máy cạo râu') ||
      titleLower.includes('dao cạo') ||
      titleLower.includes('tông đơ') ||
      titleLower.includes('coclear') ||
      titleLower.includes('enchen') ||
      titleLower.includes('flyco') ||
      titleLower.includes('bàn chải điện') ||
      titleLower.includes('máy rửa mặt') ||
      titleLower.includes('máy massage') ||
      titleLower.includes('shaver') ||
      titleLower.includes('trimmer')
    ) {
      if (titleLower.includes('philips') || titleLower.includes('braun') || titleLower.includes('panasonic')) {
        estimatedMarketValue = 450000; // Philips/Braun shaver used
      } else {
        // COCLEAR, Enchen, Flyco, Xiaomi mini shaver (giá mua mới ~170k-200k -> giá đồ cũ như mới ~110.000 VNĐ)
        estimatedMarketValue = 110000;
      }
    } else if (
      titleLower.includes('ấm siêu tốc') ||
      titleLower.includes('máy sấy') ||
      titleLower.includes('quạt mini') ||
      titleLower.includes('bàn là') ||
      titleLower.includes('đèn bàn')
    ) {
      estimatedMarketValue = 180000;
    }

    // Auto-detect best category name
    let defaultCategoryName = 'Khác';
    if (['điện thoại', 'iphone', 'samsung', 'xiaomi', 'pixel', 'ipad', 'airpod', 'sạc dự phòng', 'ốp lưng', 'gimbal', 'apple watch'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Điện thoại & Phụ kiện';
    } else if (['máy tính', 'laptop', 'macbook', 'dell', 'asus', 'rog', 'pc', 'bàn phím', 'chuột', 'màn hình', 'card màn hình', 'rtx'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Máy tính & Laptop';
    } else if (['máy ảnh', 'camera', 'sony a7', 'fujifilm', 'canon', 'eos', 'lens', 'ống kính', 'gopro', 'flycam', 'dji', 'tripod'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Máy ảnh & Máy quay';
    } else if (['âm thanh', 'loa', 'speaker', 'headphone', 'tai nghe', 'marshall', 'jbl', 'soundbar', 'mâm đĩa than', 'sennheiser'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Âm thanh & Loa';
    } else if (['đồng hồ', 'watch', 'tissot', 'seiko', 'garmin', 'casio', 'g-shock', 'citizen', 'trang sức', 'dây chuyền', 'nhẫn'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Đồng hồ & Trang sức';
    } else if (['sách', 'truyện', 'manga', 'comic', 'dragon ball', 'harry potter', 'one piece', 'kindle', 'doraemon', 'tiểu thuyết'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Sách & Truyện tranh';
    } else if (['thời trang', 'giày', 'sneaker', 'nike', 'jordan', 'adidas', 'gucci', 'kính mát', 'ví', 'hoodie', 'balo', 'áo'].some((k) => titleLower.includes(k))) {
      defaultCategoryName = 'Thời trang & Giày dép';
    }

    // Auto-detect default condition & percentage
    let defaultCondition = condition || 'Đã sử dụng (Như mới)';
    let defaultPercent = '98%';
    if (condition?.includes('100%')) {
      defaultPercent = '100%';
    } else if (condition?.includes('Như mới')) {
      defaultPercent = '98%';
    } else if (condition?.includes('Tốt')) {
      defaultPercent = '90 - 95%';
    } else if (condition?.includes('Khá')) {
      defaultPercent = '80 - 85%';
    }

    // Dynamic starting price & bid increment based on price range
    let calculatedStarting = 0;
    let calculatedIncrement = 10000;

    if (estimatedMarketValue <= 300000) {
      calculatedStarting = Math.max(20000, Math.round((estimatedMarketValue * 0.45) / 10000) * 10000);
      calculatedIncrement = 10000;
    } else if (estimatedMarketValue <= 1000000) {
      calculatedStarting = Math.round((estimatedMarketValue * 0.45) / 20000) * 20000;
      calculatedIncrement = 20000;
    } else if (estimatedMarketValue <= 5000000) {
      calculatedStarting = Math.round((estimatedMarketValue * 0.45) / 50000) * 50000;
      calculatedIncrement = 50000;
    } else if (estimatedMarketValue <= 15000000) {
      calculatedStarting = Math.round((estimatedMarketValue * 0.45) / 100000) * 100000;
      calculatedIncrement = 100000;
    } else {
      calculatedStarting = Math.round((estimatedMarketValue * 0.45) / 100000) * 100000;
      calculatedIncrement = 200000;
    }

    // Rich dynamic description builder for Fallback (when AI SDK is offline)
    let dynamicDescription = '';
    if (titleLower.includes('iphone') || titleLower.includes('macbook') || titleLower.includes('laptop') || titleLower.includes('samsung')) {
      dynamicDescription = `📌 **TỔNG QUAN SẢN PHẨM**:
Siêu phẩm ${title} chính hãng, máy nguyên bản 100%, chưa từng qua sửa chữa hay thay thế linh kiện.

✨ **TÌNH TRẠNG & ĐÁNH GIÁ NGOẠI HÌNH (${defaultPercent})**:
- Ngoại hình: Còn mới khoảng **${defaultPercent}**, thân máy và màn hình đẹp leng keng, không cấn móp.
- Màn hình sắc nét, cấu hình cực mạnh đáp ứng mượt mà mọi tác vụ làm việc, giải trí và chơi game.
- Pin bền bỉ, mọi tính năng (FaceID/TouchID, Wifi, Bluetooth, Camera) đều hoạt động hoàn hảo.
- Phụ kiện kèm theo đầy đủ: Cáp sạc chính hãng, tặng kèm ốp lưng/túi chống sốc.

🛡️ **CAM KẾT & CHÍNH SÁCH BẢO HỘ**:
- Bao test sử dụng 7 ngày thoải mái.
- Bảo hộ tài chính an toàn 100% qua cơ chế Ví ký quỹ Escrow Bazzar - Hoàn cọc tức thì nếu sản phẩm không đúng mô tả!

⚡ **LỜI KÊU GỌI ĐẶT GIÁ**:
Nhanh tay đặt giá đấu để sở hữu chiếc ${title} với giá cực kỳ ưu đãi!`;
    } else {
      dynamicDescription = `📌 **TỔNG QUAN SẢN PHẨM**:
Cần nhượng lại ${title} chính hãng, tình trạng ${defaultCondition}, được giữ gìn cẩn thận và vệ sinh sạch sẽ.

✨ **TÌNH TRẠNG & ĐÁNH GIÁ NGOẠI HÌNH (${defaultPercent})**:
- Ngoại hình: Còn mới khoảng **${defaultPercent}**, các chi tiết và bề mặt sáng bóng, không hư hỏng hay trầy xước đáng kể.
- Hoạt động: Mọi tính năng hoạt động ổn định, mượt mà, sẵn sàng sử dụng ngay.
- Phụ kiện đi kèm đầy đủ theo sản phẩm.

🛡️ **CAM KẾT & CHÍNH SÁCH BẢO HỘ**:
- Giao dịch minh bạch, bảo hộ an toàn 100% qua Ví ký quỹ Escrow Bazzar.

⚡ **LỜI KÊU GỌI ĐẶT GIÁ**:
Chúc các bạn đấu giá may mắn và chốt được sản phẩm ưng ý!`;
    }

    const fallbackResponse = {
      description: dynamicDescription,
      suggestedStartingPrice: calculatedStarting,
      suggestedBidIncrement: calculatedIncrement,
      suggestedBuyNowPrice: estimatedMarketValue,
      suggestedLayout: estimatedMarketValue >= 10000000 ? 'full_banner' : 'standard',
      suggestedCategoryName: defaultCategoryName,
      suggestedCondition: defaultCondition,
      estimatedConditionPercent: defaultPercent,
    };

    if (!this.genAI) return fallbackResponse;

    try {
      const prompt = `
Bạn là Chuyên gia AI Cao cấp về Thẩm định Giá & Sáng tạo Nội dung Bán hàng (Copywriting) trên sàn đấu giá đồ cũ Bazzar.

THÔNG TIN SẢN PHẨM TỪ NGƯỜI BÁN:
- Tên sản phẩm: ${title}
- Phân loại / Danh mục hiện tại: ${category || defaultCategoryName}
- Tình trạng người bán chọn: ${condition || 'Chưa chọn'}
- Giá thị trường đồ cũ tham chiếu tại Việt Nam (Benchmark): ${estimatedMarketValue.toLocaleString('vi-VN')} VNĐ
${imagePart ? '- Thị giác máy tính (Multimodal Vision): Đã đính kèm ảnh sản phẩm thực tế để bạn soi chi tiết màu sắc, ngoại hình, tem nhãn, độ mới, vết xước.' : '- Không có ảnh đính kèm.'}
${historicalContext ? `- Dữ liệu giá quá khứ trên sàn: ${historicalContext}` : ''}

NHIỆM VỤ 1: PHÂN LOẠI DANH MỤC & ĐÁNH GIÁ TÌNH TRẠNG (VISION & CATEGORIZATION)
1. "suggestedCategoryName": Chọn chính xác 1 trong các danh mục sau của hệ thống:
   - "Điện thoại & Phụ kiện"
   - "Máy tính & Laptop"
   - "Máy ảnh & Máy quay"
   - "Âm thanh & Loa"
   - "Đồng hồ & Trang sức"
   - "Sách & Truyện tranh"
   - "Thời trang & Giày dép"
   - "Khác" (Ví dụ: Máy cạo râu, đồ gia dụng, đồ chơi, lego, dụng cụ thể thao, xe cộ,...)
2. "suggestedCondition": Dựa vào ảnh thực tế và mô tả, chọn 1 trong 4 tình trạng:
   - "Mới 100%" (Còn nguyên seal/hộp chưa mở)
   - "Đã sử dụng (Như mới)" (Độ mới 98% - 99%, không vết xước)
   - "Đã sử dụng (Tốt)" (Độ mới 90% - 95%, có xước dăm nhẹ nhưng bóng đẹp)
   - "Đã sử dụng (Khá)" (Độ mới 80% - 89%, cũ theo thời gian)
3. "estimatedConditionPercent": Ước lượng độ mới cụ thể theo %, ví dụ "98%", "95%", "90%".

NHIỆM VỤ 2: ĐỊNH GIÁ THỊ TRƯỜNG ĐỒ CŨ TẠI VIỆT NAM (MARKET VALUATION)
Đây là nền tảng mua bán ĐỒ CŨ (second-hand), vì vậy:
- "suggestedBuyNowPrice" (Giá mua ngay): PHẢI THẤP HƠN GIÁ MUA MỚI TRÊN THỊ TRƯỜNG (thường chỉ bằng 55% - 75% giá new tùy theo độ mới).
  + Định giá bám sát mức tham chiếu (${estimatedMarketValue.toLocaleString('vi-VN')} VNĐ, dao động tối đa ±20%).
  + LƯU Ý BẮT BUỘC: Không bao giờ định giá mua ngay đồ cũ cao hơn hoặc ngang bằng giá mua mới (Ví dụ máy cạo râu mua mới 170k-200k thì giá mua ngay đồ cũ chỉ từ 90k-120k; cốc giữ nhiệt mua mới 160k thì giá mua ngay chỉ từ 80k-110k).
- "suggestedStartingPrice" (Giá khởi điểm): Đặt bằng khoảng 40% - 50% của giá mua ngay để kích thích người mua tham gia đấu giá sôi nổi.
- "suggestedBidIncrement" (Bước giá):
  + Dưới 300.000 VNĐ: Bước giá 10.000 VNĐ
  + 300.000 - 1.000.000 VNĐ: Bước giá 20.000 - 50.000 VNĐ
  + 1.000.000 - 5.000.000 VNĐ: Bước giá 50.000 - 100.000 VNĐ
  + Trên 10.000.000 VNĐ: Bước giá 200.000 - 500.000 VNĐ.
- "suggestedLayout": Chọn "full_banner" (hàng xa xỉ/công nghệ cao >10 triệu), "grid_gallery" (thời trang, phụ kiện, bộ sưu tập), hoặc "standard" (đồ thông dụng).

NHIỆM VỤ 3: SÁNG TẠO BÀI MÔ TẢ BẮT BUỘC CÓ MỤC ĐÁNH GIÁ NGOẠI HÌNH ...% (COPYWRITING)
Viết bài mô tả bán hàng lôi cuốn, văn phong tự nhiên (khoảng 150 - 250 từ).
LƯU Ý BẮT BUỘC:
- Trong bài viết BẮT BUỘC có mục đánh giá ngoại hình cụ thể theo %, ví dụ: "✨ **TÌNH TRẠNG & ĐÁNH GIÁ NGOẠI HÌNH (98%)**: Ngoại hình còn mới khoảng 98%, thân máy sáng bóng, lưỡi cạo/màn hình sạch sẽ, không trầy xước cấn móp..."
- Không đánh số thứ tự (1., 2., 3.). Hãy dùng dấu gạch đầu dòng (-) sạch sẽ và emoji sinh động.
- Lồng ghép cam kết an toàn 100% qua Ví ký quỹ Escrow Bazzar.
- Kết thúc bằng lời kêu gọi đặt giá sôi nổi.

YÊU CẦU ĐẦU RA:
Trả về duy nhất định dạng JSON hợp lệ (không chứa markdown \`\`\`json bọc ngoài):
{
  "description": "<bài mô tả hoàn chỉnh có ghi rõ ngoại hình ...%, dùng dấu gạch đầu dòng ->",
  "suggestedStartingPrice": <số nguyên VNĐ>,
  "suggestedBidIncrement": <số nguyên VNĐ>,
  "suggestedBuyNowPrice": <số nguyên VNĐ>,
  "suggestedLayout": "standard" | "full_banner" | "grid_gallery",
  "suggestedCategoryName": "<Tên danh mục>",
  "suggestedCondition": "<Mới 100% | Đã sử dụng (Như mới) | Đã sử dụng (Tốt) | Đã sử dụng (Khá)>",
  "estimatedConditionPercent": "<ví dụ 98%>"
}
`;

      const candidateModels = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
      ];
      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.3,
              topP: 0.9,
            },
          });
          const contentParts: any[] = [prompt];
          if (imagePart) contentParts.push(imagePart);

          const res = await model.generateContent(contentParts);
          const text = res.response.text().trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            let startPrice = Number(parsed.suggestedStartingPrice);
            let buyNowPrice = Number(parsed.suggestedBuyNowPrice);
            let increment = Number(parsed.suggestedBidIncrement);

            // Guardrail against hallucinated prices deviating too far from Vietnamese market value
            if (estimatedMarketValue > 0) {
              if (buyNowPrice > estimatedMarketValue * 2.5 || buyNowPrice <= 0) {
                buyNowPrice = estimatedMarketValue;
              }
              if (startPrice > buyNowPrice * 0.8 || startPrice <= 0) {
                startPrice = Math.max(20000, Math.round((buyNowPrice * 0.45) / 10000) * 10000);
              }
              if (!increment || increment <= 0) {
                increment = buyNowPrice <= 300000 ? 10000 : buyNowPrice <= 1000000 ? 20000 : 50000;
              }
            }

            // Clean up any unwanted leading 1. 2. 3. numbers if AI generated them
            let cleanDescription = (parsed.description || fallbackResponse.description)
              .replace(/^\s*\d+[\.\)]\s*/gm, '- ');

            if (startPrice > 0 && buyNowPrice > startPrice) {
              return {
                description: cleanDescription,
                suggestedStartingPrice: startPrice,
                suggestedBidIncrement: increment || fallbackResponse.suggestedBidIncrement,
                suggestedBuyNowPrice: buyNowPrice,
                suggestedLayout: ['standard', 'full_banner', 'grid_gallery'].includes(parsed.suggestedLayout)
                  ? parsed.suggestedLayout
                  : fallbackResponse.suggestedLayout,
                suggestedCategoryName: parsed.suggestedCategoryName || fallbackResponse.suggestedCategoryName,
                suggestedCondition: parsed.suggestedCondition || fallbackResponse.suggestedCondition,
                estimatedConditionPercent: parsed.estimatedConditionPercent || fallbackResponse.estimatedConditionPercent,
              };
            }
          }
        } catch (err) {
          console.warn(`Model ${modelName} failed in generateListingContent`, err);
        }
      }
    } catch (e) {
      console.error('generateListingContent error:', e);
    }

    return fallbackResponse;
  }
}
