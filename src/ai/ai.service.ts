import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
        'Chào bạn! Trợ lý AI Muabandocuui chưa được kích hoạt vì thiếu GEMINI_API_KEY trong cấu hình backend. ' +
        'Vui lòng thêm GEMINI_API_KEY vào tệp `.env` của backend (auction-system/.env) và khởi động lại server để bắt đầu trò chuyện với AI của hệ thống!'
      );
    }

    try {
      // 1. Fetch categories
      const categories = await this.prisma.category.findMany({
        select: { name: true },
        take: 20,
      });

      // 2. Dynamic Search for auctions matching user's query keywords
      const searchKeywords = message.trim().toLowerCase();
      let matchingAuctions = await this.prisma.auction.findMany({
        where: {
          status: 'ACTIVE',
          endTime: { gt: new Date() },
          OR: [
            { product: { title: { contains: searchKeywords, mode: 'insensitive' } } },
            { product: { description: { contains: searchKeywords, mode: 'insensitive' } } },
            { product: { category: { name: { contains: searchKeywords, mode: 'insensitive' } } } },
          ],
        },
        include: {
          product: {
            include: {
              category: true,
              owner: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      // If no keyword match, fallback to top active auctions
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
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
        });
      }

      const categoriesStr = categories.map((c) => c.name).join(', ');
      const auctionsStr = matchingAuctions
        .map((a) => {
          return `- [${a.product.title}](/auction/${a.id}) (Danh mục: ${a.product.category.name}): Giá hiện tại ${a.startingPrice.toLocaleString('vi-VN')}đ, Kết thúc: ${a.endTime.toLocaleString('vi-VN')}`;
        })
        .join('\n');

      const systemInstruction = `
Bạn là "Muabandocuui AI Assistant", trợ lý ảo thông minh và thân thiện của ứng dụng bán và mua đồ cũ bằng đấu giá Muabandocuui.
Nhiệm vụ của bạn là giải đáp thắc mắc của người dùng về cách bán và mua đồ cũ bằng đấu giá, hỗ trợ tìm kiếm sản phẩm đồ cũ và giải thích quy trình ký quỹ Escrow một cách ngắn gọn, súc tích bằng Tiếng Việt.

Dưới đây là thông tin thời gian thực về sản phẩm và hệ thống để bạn tham khảo khi trả lời:
- Các danh mục đồ cũ trên hệ thống: ${categoriesStr || 'Chưa có danh mục nào'}
- Các phiên đấu giá đồ cũ phù hợp/đang diễn ra:
${auctionsStr || 'Hiện tại chưa có phiên đấu giá nào đang diễn ra.'}

Quy tắc ứng xử và nghiệp vụ:
1. Luôn phản hồi lịch sự, thân thiện, dùng emoji phù hợp.
2. Nếu người dùng hỏi mua hoặc tìm kiếm sản phẩm, hãy đối chiếu với danh sách đấu giá ở trên. Nếu có sản phẩm phù hợp, hãy giới thiệu và cung cấp liên kết tới sản phẩm theo định dạng markdown của React Router, ví dụ: [Tên sản phẩm](/auction/ID-của-sản-phẩm). Đừng tạo link ra trang web khác.
3. Hướng dẫn quy trình Đăng bán đồ cũ bằng đấu giá:
   - **Bước 1**: [Đăng ký tài khoản](/register) hoặc [Đăng nhập](/login).
   - **Bước 2 - Xác minh người bán (KYC)**: Truy cập trang [Trang cá nhân](/profile) để gửi ảnh chụp CCCD 2 mặt và thông tin người bán.
   - **Bước 3 - Xét duyệt**: Chờ Quản trị viên (Admin) phê duyệt hồ sơ.
   - **Bước 4 - Đăng tin đấu giá**: Truy cập [Đăng sản phẩm mới](/create-listing) để đặt giá khởi điểm, bước giá, chọn 1 trong 3 bố cục Layout và thiết lập quy tắc Anti-sniping gia hạn tự động.
4. Giải thích các tính năng cốt lõi khi được hỏi:
   - **Đấu giá trực tiếp (Bidding)**: Đặt mức giá mới cao hơn giá hiện tại + bước giá tối thiểu. Số dư cọc tương ứng sẽ tạm giữ trong Ví ký quỹ (WalletHold).
   - **Ví ký quỹ cọc (Escrow Wallet Hold)**: Khóa cọc tự động khi đặt giá, tự động hoàn trả 100% tiền cọc ngay khi bị người khác đè giá cao hơn.
   - **Chống canh phút chót (Dynamic Anti-sniping)**: Tự động cộng thêm thời gian nếu có lượt đặt giá hợp lệ ở những phút cuối phiên đấu giá.
   - **Phí sàn**: Người bán chịu 5% phí giao dịch khi đấu giá thành công (chuyển sang trạng thái Hoàn thành). Người mua hoàn toàn miễn phí giao dịch.
   - **Xử lý khiếu nại hoàn tiền (Refund)**: Người mua có quyền mở yêu cầu hoàn tiền nếu đồ cũ nhận được không đúng như mô tả.
5. Trả lời ngắn gọn, tập trung vào câu hỏi, tránh dài dòng lan man.
`;

      // Array of candidate models for robust fallback
      const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

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
          console.warn(`Model ${modelName} failed, trying fallback...`, modelErr);
          continue;
        }
      }

      throw new Error('All Gemini model candidates failed');
    } catch (error) {
      console.error('Gemini API Error:', error);
      return 'Xin lỗi, tôi gặp sự cố kết nối AI trong giây lát. Bạn vui lòng thử lại sau nhé!';
    }
  }

  async generateListingContent(title: string, category?: string, condition?: string) {
    // Advanced dynamic valuation matrix for Vietnamese second-hand market
    const titleLower = title.toLowerCase();
    let estimatedMarketValue = 5000000;

    // 1. Smart Regex Parser for iPhone series (iPhone 16, 15, 14, 13, 12...)
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
    }

    const calculatedStarting = Math.round((estimatedMarketValue * 0.45) / 100000) * 100000;
    const calculatedIncrement = estimatedMarketValue >= 15000000 ? 200000 : (estimatedMarketValue >= 5000000 ? 100000 : 50000);

    const fallbackResponse = {
      description: `Sản phẩm "${title}" chính hãng cao cấp đã qua sử dụng với tình trạng ${condition || 'hoạt động hoàn hảo'}. Máy nguyên bản chưa qua sửa chữa, ngoại hình đẹp, đầy đủ phụ kiện. Bao test thoải mái và được bảo hộ giao dịch an toàn 100% qua Ví ký quỹ Escrow Bazaar (bazaar.vn)!`,
      suggestedStartingPrice: calculatedStarting,
      suggestedBidIncrement: calculatedIncrement,
      suggestedBuyNowPrice: estimatedMarketValue,
      suggestedLayout: estimatedMarketValue >= 10000000 ? 'full_banner' : 'standard',
    };

    if (!this.genAI) return fallbackResponse;

    try {
      const prompt = `
Bạn là Trợ lý AI Chuyên gia Định giá & Viết bài Đăng bán Đồ cũ trên nền tảng Bazaar (bazaar.vn).
Người bán cung cấp thông tin sản phẩm:
- Tên sản phẩm: ${title}
- Danh mục: ${category || 'Đồ cũ cá nhân'}
- Tình trạng: ${condition || 'Đã qua sử dụng'}

HƯỚNG DẪN ĐỊNH GIÁ THỰC TẾ TẠI VIỆT NAM (RẤT QUAN TRỌNG):
1. Phân tích chính xác tên sản phẩm "${title}" bao gồm thương hiệu, model, dung lượng ổ cứng (1TB, 512GB), kích thước (16 inch, 14 inch) để định giá thị trường đồ cũ thực tế tại Việt Nam hiện tại.
   - Ví dụ: MacBook Pro 16 inch M1 Pro 1TB cũ có giá thị trường thực tế khoảng 30.000.000đ - 33.000.000đ.
   - Ví dụ: iPhone 14 Pro Max 256GB cũ khoảng 18.000.000đ.
2. Tính toán 3 mức giá hợp lý theo nguyên lý Đấu giá Anh:
   - "suggestedStartingPrice": Giá khởi điểm bằng khoảng 40% - 50% giá thị trường đồ cũ (đặt thấp hơn để thu hút lượt đặt giá sôi nổi).
   - "suggestedBidIncrement": Bước giá từ 50,000đ đến 200,000đ tùy giá trị sản phẩm.
   - "suggestedBuyNowPrice": Giá mua ngay bằng khoảng 95% - 100% giá trị thị trường thực tế đồ cũ.
   - "suggestedLayout": Chọn "full_banner" đối với đồ công nghệ/hàng hiệu cao cấp (>10 triệu), "grid_gallery" đối với bộ sưu tập/thời trang, hoặc "standard".

Hãy trả về định dạng JSON hợp lệ duy nhất (không bọc trong thẻ markdown khác) với cấu trúc:
{
  "description": "Bài viết mô tả chi tiết sản phẩm chuẩn SEO (từ 150 - 250 từ), liệt kê tình trạng, phụ kiện, chính sách bao test và lời kêu gọi đặt giá nhiệt tình.",
  "suggestedStartingPrice": <số nguyên giá khởi điểm tính bằng VNĐ>,
  "suggestedBidIncrement": <số nguyên bước giá tính bằng VNĐ>,
  "suggestedBuyNowPrice": <số nguyên giá mua ngay tính bằng VNĐ>,
  "suggestedLayout": "standard" | "full_banner" | "grid_gallery"
}
`;

      const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const modelName of candidateModels) {
        try {
          const model = this.genAI.getGenerativeModel({ model: modelName });
          const res = await model.generateContent(prompt);
          const text = res.response.text().trim();
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const startPrice = Number(parsed.suggestedStartingPrice);
            const buyNowPrice = Number(parsed.suggestedBuyNowPrice);
            const increment = Number(parsed.suggestedBidIncrement);

            if (startPrice > 0 && buyNowPrice > startPrice) {
              return {
                description: parsed.description || fallbackResponse.description,
                suggestedStartingPrice: startPrice,
                suggestedBidIncrement: increment || fallbackResponse.suggestedBidIncrement,
                suggestedBuyNowPrice: buyNowPrice,
                suggestedLayout: ['standard', 'full_banner', 'grid_gallery'].includes(parsed.suggestedLayout)
                  ? parsed.suggestedLayout
                  : fallbackResponse.suggestedLayout,
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
