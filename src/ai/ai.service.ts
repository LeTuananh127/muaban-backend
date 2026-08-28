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

  // Real-time Web Market Search Helper to dynamically lookup Vietnamese prices for any product title
  private async searchRealTimeMarket(title: string): Promise<string> {
    try {
      const cleanTitle = title.replace(/[^\p{L}\p{N}\s\+\-\.]/gu, ' ').trim();
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanTitle + ' giá bao nhiêu việt nam shopee')}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const html = await res.text();
        const snippetMatches = html.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g);
        if (snippetMatches && snippetMatches.length > 0) {
          const snippets = snippetMatches
            .slice(0, 4)
            .map((s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim())
            .filter((s) => s.length > 15);
          if (snippets.length > 0) {
            return snippets.map((s) => `• ${s}`).join('\n');
          }
        }
      }
    } catch (e) {
      console.warn('Real-time web search fallback error:', e?.message || e);
    }
    return '';
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

    // 3. Layer 3: Dynamic Real-Time Web Price Lookup for the exact product title & model
    const liveWebSearchData = await this.searchRealTimeMarket(title);

    // Default basic fallback response (only used if Gemini API is offline/unreachable)
    const fallbackCondition = condition || 'Đã sử dụng (Như mới)';
    const fallbackResponse = {
      description: `📌 **TỔNG QUAN SẢN PHẨM**:
Cần nhượng lại ${title} chính hãng, tình trạng ${fallbackCondition}, được giữ gìn cẩn thận và hoạt động tốt.

✨ **TÌNH TRẠNG & ĐÁNH GIÁ NGOẠI HÌNH (98%)**:
- Ngoại hình: Còn mới khoảng 98%, các chi tiết sạch đẹp, không trầy xước cấn móp.
- Hoạt động: Mọi tính năng hoạt động ổn định, mượt mà, đầy đủ phụ kiện.

🛡️ **CAM KẾT & CHÍNH SÁCH BẢO HỘ**:
- Giao dịch minh bạch, bảo hộ an toàn 100% qua Ví ký quỹ Escrow Bazzar.

⚡ **LỜI KÊU GỌI ĐẶT GIÁ**:
Chúc các bạn đấu giá may mắn và chốt được sản phẩm ưng ý!`,
      suggestedStartingPrice: 100000,
      suggestedBidIncrement: 20000,
      suggestedBuyNowPrice: 250000,
      suggestedLayout: 'standard',
      suggestedCategoryName: 'Khác',
      suggestedCondition: fallbackCondition,
      estimatedConditionPercent: '98%',
    };

    if (!this.genAI) return fallbackResponse;

    try {
      const prompt = `
Bạn là Chuyên gia AI Cao cấp về Thẩm định Giá Thị trường & Sáng tạo Nội dung Bán hàng (Copywriting) trên sàn đấu giá đồ cũ Bazzar.

THÔNG TIN SẢN PHẨM ĐẦU VÀO:
- Tiêu đề sản phẩm đầy đủ từ người bán: "${title}"
- Danh mục người bán chọn: ${category || 'Chưa chọn'}
- Tình trạng người bán chọn: ${condition || 'Chưa chọn'}
${liveWebSearchData ? `\nKẾT QUẢ TRA CỨU GIÁ THỜI GIAN THỰC TRÊN CÁC SÀN THƯƠNG MẠI ĐIỆN TỬ & CỬA HÀNG TẠI VIỆT NAM:\n${liveWebSearchData}\n` : ''}
${imagePart ? '- Thị giác máy tính (Multimodal Vision): Đã đính kèm ảnh sản phẩm thực tế để bạn soi chi tiết ngoại hình, độ mới, vết xước, tem mác, phụ kiện.' : '- Không có ảnh đính kèm.'}
${historicalContext ? `- Dữ liệu giá quá khứ trên sàn: ${historicalContext}` : ''}

NHIỆM VỤ 1: ĐỊNH VỊ SẢN PHẨM & TRA CỨU GIÁ MUA MỚI (MARKET ANALYSIS)
1. Đọc và phân tích kỹ TOÀN BỘ CỤM TIÊU ĐỀ: Nhận diện chính xác Hãng sản xuất, Tên sản phẩm, Mã model chi tiết, Phiên bản, Phân khúc sản phẩm (Ví dụ: "chuột gaming VXE R1 SE+", "vợt cầu lông Yonex Astrox 77 Play", "cốc giữ nhiệt Fanhouse 510ml", "máy cạo râu Flyco FS370", "iPhone 15 Pro Max 256GB", "Macbook Air M2", "Giày Nike Pegasus 40",...).
2. Dựa vào kết quả tra cứu web đính kèm và kho dữ liệu khổng lồ của bạn, hãy xác định chính xác "Mức giá mua mới chính hãng niêm yết tại Việt Nam" của sản phẩm này.
3. Tự động chọn đúng 1 trong các Danh mục hệ thống ("suggestedCategoryName"):
   - "Điện thoại & Phụ kiện"
   - "Máy tính & Laptop" (Gồm máy tính, laptop, màn hình, chuột, bàn phím, linh kiện PC...)
   - "Máy ảnh & Máy quay"
   - "Âm thanh & Loa"
   - "Đồng hồ & Trang sức"
   - "Sách & Truyện tranh"
   - "Thời trang & Giày dép"
   - "Khác" (Gồm dụng cụ thể thao/vợt cầu lông, đồ gia dụng, đồ chăm sóc cá nhân, đồ chơi, xe cộ...)

NHIỆM VỤ 2: THỊ GIÁC MÁY TÍNH (VISION) & ĐÁNH GIÁ NGOẠI HÌNH
1. Nếu có ảnh chụp đính kèm: Soi kỹ ngoại hình thực tế (độ bóng bẩy, vết xước dăm, cấn móp, bụi bẩn, phụ kiện).
2. "suggestedCondition": Chọn 1 trong 4:
   - "Mới 100%" (Nguyên seal/hộp chưa sử dụng)
   - "Đã sử dụng (Như mới)" (Độ mới 98% - 99%, thân máy/bề mặt đẹp không trầy xước)
   - "Đã sử dụng (Tốt)" (Độ mới 90% - 95%, có xước nhẹ do sử dụng nhưng bóng đẹp)
   - "Đã sử dụng (Khá)" (Độ mới 80% - 89%, cũ theo thời gian)
3. "estimatedConditionPercent": Ước lượng độ mới cụ thể theo %, ví dụ "99%", "98%", "95%", "90%".

NHIỆM VỤ 3: ĐỊNH GIÁ ĐỒ CŨ SECOND-HAND CHUẨN XÁC
Bazzar là sàn đấu giá ĐỒ CŨ, do đó:
1. "suggestedBuyNowPrice" (Giá mua ngay đồ cũ):
   - Phải dựa trên giá mua mới của ĐÚNG SẢN PHẨM / ĐÚNG MÃ ĐÓ trên thị trường Việt Nam:
     + Mới 100%: ~85% - 90% giá mới.
     + Như mới (98% - 99%): ~65% - 80% giá mới (Ví dụ chuột VXE R1 SE+ giá mới ~480k -> Giá mua ngay đồ cũ ~300k - 350k; Vợt Yonex Astrox 77 Play giá mới ~1.1tr -> Giá mua ngay đồ cũ ~750k - 850k; Cốc Fanhouse giá mới ~160k -> Giá mua ngay đồ cũ ~90k - 110k).
     + Tốt (90% - 95%): ~50% - 65% giá mới.
     + Khá (80% - 89%): ~35% - 50% giá mới.
2. "suggestedStartingPrice" (Giá khởi điểm): Đặt ở mức hấp dẫn bằng khoảng 40% - 50% của Giá mua ngay để kích thích người mua tham gia đấu giá sôi nổi.
3. "suggestedBidIncrement" (Bước giá):
   - Dưới 300.000 VNĐ: 10.000 VNĐ
   - 300.000 - 1.000.000 VNĐ: 20.000 - 50.000 VNĐ
   - 1.000.000 - 5.000.000 VNĐ: 50.000 - 100.000 VNĐ
   - Trên 10.000.000 VNĐ: 200.000 - 500.000 VNĐ.
4. "suggestedLayout": Chọn "full_banner" (hàng cao cấp/công nghệ xa xỉ >10 triệu), "grid_gallery" (thời trang, đồ thể thao, sưu tầm), hoặc "standard" (đồ thông dụng).

NHIỆM VỤ 4: SÁNG TẠO BÀI MÔ TẢ CÓ MỤC ĐÁNH GIÁ NGOẠI HÌNH ...% (COPYWRITING)
Viết bài mô tả bán hàng lôi cuốn, văn phong tự nhiên (khoảng 150 - 250 từ).
LƯU Ý BẮT BUỘC:
- Bắt buộc có mục đánh giá ngoại hình cụ thể theo %, ví dụ: "✨ **TÌNH TRẠNG & ĐÁNH GIÁ NGOẠI HÌNH (98%)**: Ngoại hình còn mới khoảng 98%, thân máy/bề mặt sáng đẹp, không trầy xước cấn móp..."
- Không đánh số thứ tự (1., 2., 3.). Dùng dấu gạch đầu dòng (-) sạch sẽ và emoji sinh động.
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
              temperature: 0.2,
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
            const startPrice = Number(parsed.suggestedStartingPrice);
            const buyNowPrice = Number(parsed.suggestedBuyNowPrice);
            let increment = Number(parsed.suggestedBidIncrement);

            if (!increment || increment <= 0) {
              increment = buyNowPrice <= 300000 ? 10000 : buyNowPrice <= 1000000 ? 20000 : 50000;
            }

            // Clean up any unwanted leading numbers if AI generated them
            let cleanDescription = (parsed.description || fallbackResponse.description)
              .replace(/^\s*\d+[\.\)]\s*/gm, '- ');

            if (startPrice > 0 && buyNowPrice > startPrice) {
              return {
                description: cleanDescription,
                suggestedStartingPrice: startPrice,
                suggestedBidIncrement: increment,
                suggestedBuyNowPrice: buyNowPrice,
                suggestedLayout: ['standard', 'full_banner', 'grid_gallery'].includes(parsed.suggestedLayout)
                  ? parsed.suggestedLayout
                  : buyNowPrice >= 10000000
                    ? 'full_banner'
                    : 'standard',
                suggestedCategoryName: parsed.suggestedCategoryName || fallbackResponse.suggestedCategoryName,
                suggestedCondition: parsed.suggestedCondition || fallbackResponse.suggestedCondition,
                estimatedConditionPercent: parsed.estimatedConditionPercent || fallbackResponse.estimatedConditionPercent,
              };
            }
          }
        } catch (err) {
          console.warn(`Model ${modelName} failed in generateListingContent:`, err?.message || err);
        }
      }
    } catch (e) {
      console.error('generateListingContent error:', e);
    }

    return fallbackResponse;
  }
}
