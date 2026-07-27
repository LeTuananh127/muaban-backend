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
    // Dynamic fallback price estimator based on product keywords if AI SDK is offline
    const titleLower = title.toLowerCase();
    let estimatedMarketValue = 2000000;

    if (titleLower.includes('iphone 15 pro max') || titleLower.includes('15 pro max')) {
      estimatedMarketValue = 22000000;
    } else if (titleLower.includes('iphone 14 pro max') || titleLower.includes('14 pro max')) {
      estimatedMarketValue = 16500000;
    } else if (titleLower.includes('iphone 13 pro max') || titleLower.includes('13 pro max')) {
      estimatedMarketValue = 13000000;
    } else if (titleLower.includes('iphone 12 pro max') || titleLower.includes('12 pro max')) {
      estimatedMarketValue = 10000000;
    } else if (titleLower.includes('iphone') || titleLower.includes('samsung galaxy') || titleLower.includes('ipad')) {
      estimatedMarketValue = 7500000;
    } else if (titleLower.includes('macbook') || titleLower.includes('laptop') || titleLower.includes('dell') || titleLower.includes('thinkpad')) {
      estimatedMarketValue = 14000000;
    } else if (titleLower.includes('sony') || titleLower.includes('canon') || titleLower.includes('fujifilm') || titleLower.includes('máy ảnh')) {
      estimatedMarketValue = 12000000;
    } else if (titleLower.includes('rolex') || titleLower.includes('apple watch') || titleLower.includes('đồng hồ')) {
      estimatedMarketValue = 5000000;
    }

    const fallbackResponse = {
      description: `Sản phẩm "${title}" chính hãng đã qua sử dụng với tình trạng ${condition || 'hoạt động hoàn hảo'}. Ngoại hình đẹp, chưa qua sửa chữa, đầy đủ phụ kiện. Đấu giá minh bạch và giao dịch an toàn 100% qua Ví ký quỹ Escrow Bazaar (bazaar.vn)!`,
      suggestedStartingPrice: Math.round(estimatedMarketValue * 0.45 / 10000) * 10000,
      suggestedBidIncrement: estimatedMarketValue >= 10000000 ? 100000 : 50000,
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
1. Hãy phân tích tên sản phẩm "${title}" để xác định chính xác đây là món đồ gì và giá trị thực tế của nó trên thị trường đồ cũ Việt Nam hiện tại. (Ví dụ: iPhone 14 Pro Max 256GB đồ cũ có giá thị trường khoảng 16.000.000đ - 18.000.000đ; MacBook Pro M1 khoảng 14.000.000đ; v.v.).
2. Tính toán 3 mức giá hợp lý theo nguyên lý Đấu giá Anh:
   - "suggestedStartingPrice": Giá khởi điểm bằng khoảng 40% - 50% giá thị trường đồ cũ (đặt thấp hơn để thu hút lượt đấu giá sôi nổi).
   - "suggestedBidIncrement": Bước giá từ 20,000đ đến 200,000đ tùy giá trị sản phẩm.
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
