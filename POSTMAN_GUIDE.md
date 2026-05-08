# 🚀 Postman Testing Guide - Mua Bán Đấu Giá Backend

Hướng dẫn chi tiết cách test Backend NestJS bằng Postman.

## 📋 Bước 1: Chuẩn Bị

### Yêu cầu:
- Postman đã cài đặt ([Download](https://www.postman.com/downloads/))
- Backend server chạy trên `http://localhost:3000`
  ```bash
  cd muaban_nestjs/auction-system
  npm run start:dev
  ```

## 📥 Bước 2: Import Collection

### Cách 1: Import từ file JSON
1. Mở Postman
2. Click **File** → **Import**
3. Chọn file `Postman_Collection.json` từ thư mục `muaban_nestjs/auction-system/`
4. Click **Import** → Collection sẽ xuất hiện ở sidebar bên trái

### Cách 2: Manual Setup Variables
Nếu cần setup environment variables:
1. Click **Environments** ở sidebar
2. Click **+** để tạo environment mới
3. Tên: `Local Dev`
4. Thêm variables:
   ```
   base_url: http://localhost:3000
   token: (sẽ copy sau khi login)
   admin_token: (sẽ copy sau khi admin login)
   ```

## 🧪 Bước 3: Workflow Test

### Luồng 1: Đăng Ký & Đăng Nhập

#### 1. Register Seller
```
POST /auth/register
Body:
{
  "email": "seller@mail.com",
  "password": "123456",
  "name": "Seller Name",
  "role": "USER"
}
```

#### 2. Register Buyer
```
POST /auth/register
Body:
{
  "email": "buyer@mail.com",
  "password": "123456",
  "name": "Buyer Name",
  "role": "USER"
}
```

#### 3. Register Admin (nếu cần test admin features)
```
POST /auth/register
Body:
{
  "email": "admin@mail.com",
  "password": "123456",
  "name": "Admin Name",
  "role": "ADMIN"
}
```

#### 4. Seller Login
- Copy token từ response
- Paste vào request header `Authorization: Bearer <TOKEN>`

```
POST /auth/login
Body:
{
  "email": "seller@mail.com",
  "password": "123456"
}
```

---

### Luồng 2: Tạo Sản Phẩm & Đấu Giá

#### 1. Lấy Category ID
```
GET /categories
```

#### 2. Seller Tạo Listing (Product + Auction)
```
POST /products/create-listing
Authorization: Bearer SELLER_TOKEN
Body:
{
  "title": "iPhone 15 Pro Max",
  "description": "Brand new, sealed",
  "images": ["https://via.placeholder.com/300"],
  "condition": "New",
  "location": "Hanoi",
  "categoryId": "PASTE_CATEGORY_ID",
  "startingPrice": 100000,
  "reservePrice": 120000,
  "buyNowPrice": 500000,
  "shippingCost": 20000,
  "endTime": "2026-05-25T23:59:59Z"
}
```

#### 3. Xem Danh Sách Auctions
```
GET /auctions
```

#### 4. Tìm Kiếm & Gợi Ý
```
GET /auctions/search?q=iphone&page=1&limit=12
GET /auctions/search/suggestions?q=iph&limit=5
```

---

### Luồng 3: Đặt Giá (Bidding)

#### 1. Buyer Đặt Giá
```
POST /bids/AUCTION_ID
Authorization: Bearer BUYER_TOKEN
Body:
{
  "amount": 150000
}
```

#### 2. Xem Lịch Sử Bid
```
GET /bids/AUCTION_ID
```

---

### Luồng 4: Yêu Thích (Favorites)

#### 1. Buyer Thêm vào Favorites
```
POST /favorites/AUCTION_ID
Authorization: Bearer BUYER_TOKEN
```

#### 2. Xem Danh Sách Favorites
```
GET /favorites
Authorization: Bearer BUYER_TOKEN
```

#### 3. Xóa khỏi Favorites
```
DELETE /favorites/AUCTION_ID
Authorization: Bearer BUYER_TOKEN
```

---

### Luồng 5: Nhắn Tin (Messages)

#### 1. Buyer Gửi Tin cho Seller
```
POST /messages
Authorization: Bearer BUYER_TOKEN
Body:
{
  "receiverId": "SELLER_ID",
  "content": "Hi, I'm interested in this item!"
}
```

#### 2. Xem Danh Sách Hội Thoại
```
GET /messages/conversations
Authorization: Bearer BUYER_TOKEN
```

#### 3. Xem Chi Tiết Hội Thoại
```
GET /messages/SELLER_ID
Authorization: Bearer BUYER_TOKEN
```

#### 4. Đánh Dấu Đã Đọc
```
PATCH /messages/SELLER_ID/read
Authorization: Bearer BUYER_TOKEN
```

---

### Luộc 6: Đơn Hàng (Orders)

#### 1. Tạo Order (Sau khi thắng auction - cần kết thúc auction trước)
```
POST /orders/AUCTION_ID
Authorization: Bearer BUYER_TOKEN
```

#### 2. Xem Đơn Hàng Mua
```
GET /orders/buying
Authorization: Bearer BUYER_TOKEN
```

#### 3. Xem Đơn Hàng Bán
```
GET /orders/selling
Authorization: Bearer SELLER_TOKEN
```

#### 4. Cập Nhật Trạng Thái (Buyer: PAID/DELIVERED, Seller: SHIPPED)
```
PATCH /orders/ORDER_ID/status
Authorization: Bearer BUYER_TOKEN (hoặc SELLER_TOKEN)
Body:
{
  "status": "PAID"
}
```

---

### Luồng 7: Đánh Giá (Reviews)

#### 1. Buyer Đánh Giá Seller (sau khi order DELIVERED)
```
POST /reviews
Authorization: Bearer BUYER_TOKEN
Body:
{
  "revieweeId": "SELLER_ID",
  "rating": 5,
  "comment": "Great seller!"
}
```

#### 2. Xem Đánh Giá của User
```
GET /reviews/user/USER_ID
```

---

### Luồng 8: Quản Lý (Admin)

#### 1. Xem Tất Cả Users
```
GET /admin/users
Authorization: Bearer ADMIN_TOKEN
```

#### 2. Khoá/Mở Khóa User
```
PATCH /admin/users/USER_ID/toggle-ban
Authorization: Bearer ADMIN_TOKEN
```

#### 3. Xem Tất Cả Listings
```
GET /admin/listings
Authorization: Bearer ADMIN_TOKEN
```

#### 4. Xoá Listing Vi Phạm
```
DELETE /admin/listings/AUCTION_ID
Authorization: Bearer ADMIN_TOKEN
```

#### 5. Xem Reports
```
GET /admin/reports
Authorization: Bearer ADMIN_TOKEN
```

#### 6. Giải Quyết Report
```
PATCH /admin/reports/REPORT_ID/resolve
Authorization: Bearer ADMIN_TOKEN
Body:
{
  "status": "RESOLVED"
}
```

---

### Luồng 9: Upload Ảnh (Upload)

#### 1. Upload 1 Ảnh
```
POST /upload/image
Authorization: Bearer YOUR_TOKEN
Body: form-data
  key: file
  value: (chọn file ảnh từ máy)
```

#### 2. Upload Nhiều Ảnh
```
POST /upload/images
Authorization: Bearer YOUR_TOKEN
Body: form-data
  key: files
  value: (chọn nhiều file ảnh)
```

---

## 💡 Tips & Tricks

### 1. Sử dụng Environment Variables
Thay vì copy paste token mỗi lần, lưu vào variable:
```
Trong Body hoặc Header, dùng {{token}}
Sau khi login, select response body → Save to variable
```

### 2. Test Chain (1 request phụ thuộc vào kết quả của request trước)
```javascript
// Trong tab Tests của response
pm.environment.set("auction_id", pm.response.json().auction.id);
pm.environment.set("token", pm.response.json().access_token);
```

### 3. Kiểm Tra Response
- Xem tab **Body** để xem JSON response
- Xem tab **Tests** để kiểm tra assertion

### 4. Debug Request
- Xem tab **Console** (Ctrl+Alt+C) để xem log request/response

---

## 🐛 Các Lỗi Phổ Biến

| Lỗi | Nguyên Nhân | Giải Pháp |
|-----|-----------|----------|
| 401 Unauthorized | Token không hợp lệ/hết hạn | Copy lại token từ login |
| 403 Forbidden | Quyền không đủ | Chắc chắn dùng đúng role (ADMIN) |
| 400 Bad Request | Body sai format | Kiểm tra lại JSON body |
| 404 Not Found | ID không tồn tại | Copy chính xác ID từ response trước |
| Connection refused | Backend không chạy | Bật server `npm run start:dev` |

---

## 📚 Collection Structure

```
Auction System Backend API
├── 🔐 Auth
│   ├── Register
│   └── Login
├── 📁 Categories
│   ├── Get All
│   └── Create (Admin)
├── 📦 Products & Auctions
│   ├── Get All
│   ├── Create Listing
│   └── Get Detail
├── 🔨 Auctions
│   ├── Get Active
│   ├── Search
│   ├── Suggestions
│   └── Get Detail
├── 💰 Bids
│   ├── Get Bids
│   └── Place Bid
├── ❤️ Favorites
│   ├── Get My
│   ├── Add
│   └── Remove
├── 💬 Messages
│   ├── Send
│   ├── Conversations
│   ├── Get Messages
│   └── Mark Read
├── 📦 Orders
│   ├── Create
│   ├── Buying
│   ├── Selling
│   └── Update Status
├── ⭐ Reviews
│   ├── Create
│   └── Get User Reviews
├── 👤 Users
│   ├── My Profile
│   ├── Get Profile
│   └── Update Profile
├── 🛡️ Admin
│   ├── Users
│   ├── Listings
│   └── Reports
└── 📤 Upload
    ├── Single
    └── Multiple
```

---

## 🎯 Test Scenarios

### Scenario 1: Complete Auction Flow
1. Seller đăng sản phẩm
2. Buyer tìm & xem chi tiết
3. Buyer đặt giá & thắng
4. Tạo Order
5. Update trạng thái PAID → SHIPPED → DELIVERED
6. Buyer đánh giá Seller
7. Xem Review

### Scenario 2: Admin Moderation
1. Admin xem tất cả users
2. Admin xem tất cả listings
3. Admin xem reports
4. Admin resolve report hoặc xoá listing

---

**Happy Testing! 🎉**

Nếu có lỗi, check console Postman (Ctrl+Alt+C) và backend logs.
