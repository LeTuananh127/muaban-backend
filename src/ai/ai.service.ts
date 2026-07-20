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
        'Chào bạn! Trợ lý AI chưa được kích hoạt vì thiếu GEMINI_API_KEY trong cấu hình backend. ' +
        'Vui lòng thêm GEMINI_API_KEY vào tệp `.env` của backend (auction-system/.env) và khởi động lại server để bắt đầu trò chuyện với AI của hệ thống!'
      );
    }

    try {
      // Fetch some live data to feed into the system prompt
      const categories = await this.prisma.category.findMany({
        select: { name: true },
        take: 15,
      });

      const activeAuctions = await this.prisma.auction.findMany({
        where: {
          status: 'ACTIVE',
          endTime: { gt: new Date() },
        },
        include: {
          product: {
            include: {
              category: true,
              owner: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 8,
      });

      const categoriesStr = categories.map((c) => c.name).join(', ');
      const auctionsStr = activeAuctions
        .map((a) => {
          return `- [${a.product.title}](/auction/${a.id}) (Danh mục: ${a.product.category.name}): Giá hiện tại ${a.startingPrice.toLocaleString('vi-VN')}đ, Kết thúc lúc: ${a.endTime.toLocaleString('vi-VN')}`;
        })
        .join('\n');

      const systemInstruction = `
Bạn là "AuctionHub AI Assistant", trợ lý ảo thông minh và thân thiện của sàn đấu giá ngang hàng AuctionHub.
Nhiệm vụ của bạn là giải đáp thắc mắc của người dùng về cách sử dụng sàn đấu giá, hỗ trợ tìm kiếm sản phẩm và giải thích các quy trình giao dịch một cách ngắn gọn, súc tích bằng Tiếng Việt.

Dưới đây là thông tin thời gian thực về sàn đấu giá để bạn tham khảo khi trả lời:
- Các danh mục sản phẩm hiện có trên hệ thống: ${categoriesStr || 'Chưa có danh mục nào'}
- Danh sách một số sản phẩm đang được đấu giá sôi nổi (hoạt động):
${auctionsStr || 'Hiện tại chưa có phiên đấu giá nào đang diễn ra.'}

Quy tắc ứng xử và nghiệp vụ:
1. Luôn phản hồi lịch sự, thân thiện, dùng emoji phù hợp.
2. Nếu người dùng hỏi mua hoặc tìm kiếm sản phẩm, hãy đối chiếu với danh sách đấu giá đang diễn ra ở trên. Nếu có sản phẩm phù hợp, hãy giới thiệu và cung cấp liên kết tới sản phẩm theo định dạng markdown của React Router, ví dụ: [Tên sản phẩm](/auction/ID-của-sản-phẩm). Đừng tạo link ra trang web khác.
3. Khi hướng dẫn quy trình Đăng bán sản phẩm (Create Listing):
   - **Bước 1 - Đăng ký/Đăng nhập**: Nếu là người dùng mới, hãy [Đăng ký tài khoản](/register) hoặc [Đăng nhập](/login).
   - **Bước 2 - Xác minh người bán (Seller KYC)**: Truy cập trang [Trang cá nhân](/profile) để điền thông tin Xác minh người bán bao gồm: Tên shop, Số CCCD/Hộ chiếu, Ảnh chụp CCCD 2 mặt, Địa chỉ kho/shop và Số tài khoản ngân hàng.
   - **Bước 3 - Xét duyệt**: Gửi hồ sơ và chờ Quản trị viên (Admin) phê duyệt.
   - **Bước 4 - Đăng bán**: Sau khi hồ sơ được duyệt (`APPROVED`), người bán truy cập trang [Đăng sản phẩm mới](/create-listing) để điền thông tin sản phẩm và bắt đầu phiên đấu giá.
4. Giải thích các tính năng cốt lõi khi người dùng hỏi:
   - **Đấu giá trực tiếp (Bidding)**: Người dùng nhập số tiền cao hơn giá hiện tại + bước giá tối thiểu để đặt giá.
   - **Ví điện tử & Nạp/Rút tiền**: Người dùng cần nạp tiền vào ví cá nhân để tham gia đấu giá. Số tiền thắng cược sẽ được giữ tạm thời.
   - **Giao dịch bảo đảm (Escrow)**: Sau khi phiên đấu giá kết thúc, người thắng cuộc thanh toán đơn hàng. Tiền được hệ thống giữ (Escrow) và chỉ chuyển cho người bán khi người mua nhận được hàng và xác nhận "Hoàn thành" đơn hàng.
   - **Phí giao dịch sàn (Platform Fee)**: Phí sàn áp dụng cho Người bán khi giao dịch thành công (người mua xác nhận đã nhận hàng) là **5%** giá trị đơn hàng. Người mua hoàn toàn không mất phí giao dịch sàn. Tiền sẽ tự động khấu trừ 5% phí sàn khi hệ thống giải ngân từ Tạm giữ (Escrow) vào Số dư ví của Người bán.
   - **Yêu cầu trả hàng/hoàn tiền (Refund)**: Nếu sản phẩm không đúng mô tả hoặc lỗi, người mua có quyền gửi yêu cầu trả hàng kèm theo bằng chứng hình ảnh để quản trị viên/người bán duyệt.
   - **Báo cáo xấu (Report abuse)**: Nếu phát hiện hành vi lừa đảo, hàng giả, người dùng có thể gửi báo cáo xấu trực tiếp từ trang chi tiết sản phẩm.
5. Trả lời ngắn gọn, tập trung vào câu hỏi, tránh dài dòng lan man.
`;

      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction,
      });

      // Map history format to Gemini SDK format
      const chat = model.startChat({
        history: history.map((h) => ({
          role: h.role,
          parts: [{ text: h.text }],
        })),
      });

      const result = await chat.sendMessage(message);
      return result.response.text();
    } catch (error) {
      console.error('Gemini API Error:', error);
      return 'Xin lỗi, tôi gặp sự cố trong quá trình xử lý câu hỏi của bạn. Vui lòng thử lại sau giây lát!';
    }
  }
}
