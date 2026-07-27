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
   - **Đấu giá trực tiếp (Bidding)**: Đặt mức giá mới cao hơn giá hiện tại + bước giá tối thiểu. Số dư cọc tương ứng sẽ tạm giữ trong Ví ký quỹ (`WalletHold`).
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
}
