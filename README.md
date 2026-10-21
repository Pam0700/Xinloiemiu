# Anh Xin Lỗi Em ❤️ — Interactive Cinematic Love Story trên Google Apps Script

Dự án website kể chuyện tương tác dạng phim ngắn lãng mạn (**5 cảnh điện ảnh, khung hình 9:16 mobile-first**) vận hành 100% miễn phí trên nền tảng **Google Apps Script Web App** và **Google Drive**.

## A. Kiến trúc tổng thể

Hệ thống được thiết kế theo mô hình **Serverless Web App trên Google Apps Script (V8 Runtime)** gồm 3 tầng tách biệt:

1. **Tầng Lưu trữ & Cấu hình (Storage Layer)**:
   - **Google Drive (`DriveApp`)**: Lưu trữ bộ ảnh kỷ niệm (`LoveStory/Images/01.jpg, 02.jpg...`) và bản nhạc nền MP3 (`LoveStory/Music/background.mp3`).
   - **`PropertiesService.getScriptProperties()`**: Lưu trữ cấu hình kịch bản (tên người nhận, lời mở đầu, thứ tự ảnh, chú thích, nội dung thú nhận, bức thư tay, màu sắc, thời lượng) và hộp thư phản hồi của người nhận mà không bắt buộc phải tạo file phụ.
   - **Google Sheets (`SpreadsheetApp` — Tùy chọn)**: Đồng bộ hóa cấu hình sang bảng tính trực quan (`Config`, `Images`, `Replies`) khi người quản trị điền `googleSheetId`.
   - **`CacheService.getScriptCache()`**: Lưu đệm (cache) cấu hình công khai trong 300 giây (`LOVE_STORY_PUBLIC_CACHE_V1`) để giảm thời gian phản hồi xuống mức mili-giây và tránh chạm ngưỡng quota gọi `DriveApp`.

2. **Tầng Backend Điều phối & Bảo mật (`Code.gs`)**:
   - `doGet(e)`: Điều hướng giữa giao diện câu chuyện (`Index.html`) và giao diện quản trị (`Admin.html` khi `?page=admin`).
   - `getPublicStoryConfig()`: Trả về JSON cấu hình công khai đã lọc sạch dữ liệu nhạy cảm.
   - `getDriveMediaBase64(fileId)`: Proxy chuyển đổi file ảnh/nhạc dưới 4MB sang Base64 Data URI an toàn (chỉ cho phép các `fileId` đã khai báo trong câu chuyện) nhằm vượt qua rào cản chặn cookie bên thứ ba (ITP trên Safari iOS) hoặc lỗi stream trực tiếp từ Google Drive.
   - `getAdminConfig()` & `saveStoryConfig(data)`: Kiểm tra nghiêm ngặt danh tính chủ sở hữu qua `Session.getActiveUser().getEmail()` đối chiếu với `Session.getEffectiveUser().getEmail()`. Tuyệt đối không dùng mật khẩu cứng trên frontend hay mã bí mật trên URL.

3. **Tầng Frontend Trình diễn Điện ảnh (`Index.html`, `Styles.html`, `Scripts.html`, `Admin.html`)**:
   - Thiết kế **Mobile-First 9:16** với bảng màu Hồng Pastel (`#f6bbd0`), Trắng Kem (`#fff9f5`), Đỏ Rượu Vang (`#6b1d2f`) và Tím Hoàng Hôn (`#1c0d26`).
   - Hệ thống `TransitionManager` quản lý 5 cảnh tuần tự, kết hợp `<canvas>` hạt sáng & trái tim bay trong một vòng lặp `requestAnimationFrame` duy nhất (tự động tạm dừng khi `document.hidden` hoặc khi thiết bị bật `prefers-reduced-motion`).
   - Bộ phát âm thanh kép: Hỗ trợ phát file MP3 từ Google Drive kết hợp **Web Audio API Piano Synthesizer** tự động làm nhạc nền dự phòng nếu người dùng chưa tải file MP3 hoặc mạng chập chờn.

## B. Luồng dữ liệu giữa Google Drive, Apps Script và HTML

1. **Khởi tạo & Tải trang (Initial Load)**:
   - Người nhận mở đường link Web App trên điện thoại -> `doGet(e)` nạp `Index.html` cùng `Styles.html` và `Scripts.html` thông qua hàm `include()`.
   - Ngay khi `DOMContentLoaded`, `Scripts.html` gọi `google.script.run.getPublicStoryConfig()` **một lần duy nhất**.
   - `Code.gs` kiểm tra `CacheService`. Nếu chưa có cache, `Code.gs` đọc `ScriptProperties`, dùng `DriveApp` quét thư mục ảnh, sắp xếp theo tên file (`01.jpg`, `02.jpg`...), tạo danh sách URL hiển thị (`https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600`), đóng gói thành JSON tinh gọn gửi về trình duyệt.

2. **Tải trước ảnh & Cơ chế Fallback 4 tầng (4-Tier Image Pipeline)**:
   - **Tầng 1 (Drive Thumbnail CDN)**: Thử tải ảnh từ `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1600` (nhanh, nhẹ, hỗ trợ tốt nhất trên trình duyệt di động khi thư mục hoặc file bật quyền *Anyone with the link*).
   - **Tầng 2 (Google User Content CDN)**: Nếu Tầng 1 lỗi, tự động chuyển sang `https://lh3.googleusercontent.com/d/FILE_ID=w1600`.
   - **Tầng 3 (Apps Script Base64 Proxy)**: Nếu file đang để quyền *Restricted (Riêng tư)* khiến trình duyệt của người yêu không xem trực tiếp được, `Scripts.html` tự động gọi `google.script.run.getDriveMediaBase64(fileId)`. Do Web App chạy dưới quyền chủ sở hữu (`Execute as: Me`), Apps Script đọc được file trong Drive của bạn, mã hóa Base64 và trả về trình duyệt hiển thị mượt mà.
   - **Tầng 4 (Romantic SVG Artwork)**: Nếu File ID bị xóa hoặc mất mạng hoàn toàn, hệ thống tự động dựng khung tranh SVG lãng mạn để câu chuyện không bao giờ bị vỡ giao diện.

3. **Luồng phát nhạc nền (Audio Pipeline)**:
   - Trình duyệt di động (iOS Safari, Chrome Android) chặn tự động phát âm thanh (`autoplay`) trước khi người dùng chạm tay.
   - Khi người yêu nhấn nút **"Chạm vào đây nhé ❤️"** ở Cảnh 1, sự kiện `click` kích hoạt đồng thời `audio.play()` và chuyển sang Cảnh 2. Nhạc duy trì xuyên suốt từ Cảnh 1 đến Cảnh 5 mà không bị khởi tạo lại.

## C. Cây thư mục Google Drive & Cấu trúc File Dự Án

### 1. Cấu trúc thư mục trên Google Drive của bạn

```text
LoveStory/
├── Images/                  <-- Lấy Folder ID của thư mục này điền vào cấu hình
│   ├── 01.jpg               <-- Đặt tên 01, 02, 03... để tự động sắp xếp đúng thứ tự
│   ├── 02.jpg
│   ├── 03.jpg
│   └── 04.jpg
├── Music/
│   └── background.mp3       <-- Lấy File ID của file nhạc này (nên nén < 4MB)
└── Config/
    └── LoveStory_Sheet      <-- (Tùy chọn) Google Sheets lưu cấu hình & tin nhắn phản hồi
```

### 2. Cấu trúc các file trong Google Apps Script Project

```text
AnhXinLoiEm_GAS/
├── appsscript.json          <-- Cấu hình Manifest, Timezone và OAuth Scopes
├── Code.gs                  <-- Backend Apps Script (Routing, DriveApp, Cache, Auth, Proxy)
├── Index.html               <-- Giao diện chính 5 cảnh của câu chuyện tương tác
├── Styles.html              <-- Toàn bộ CSS3, hiệu ứng điện ảnh, Polaroid, mở thư tay
├── Scripts.html             <-- Logic điều phối 5 cảnh, Canvas hạt sáng, Audio & Preloader
├── Admin.html               <-- Trang quản trị nội dung & hộp thư đọc phản hồi của người yêu
└── README.md                <-- Tài liệu hướng dẫn cài đặt, triển khai và xử lý lỗi
```

## E. Hướng dẫn triển khai từng bước cho người mới (12 Bước)

### Bước 1: Tạo thư mục trên Google Drive
1. Mở [Google Drive](https://drive.google.com/) bằng tài khoản Google của bạn.
2. Tạo thư mục mới tên là `LoveStory`, bên trong tạo 2 thư mục con: `Images` và `Music`.

### Bước 2: Tải ảnh và nhạc lên Google Drive
1. Chọn 4–10 bức ảnh kỷ niệm đẹp nhất của hai người (ưu tiên ảnh dọc tỷ lệ 9:16 hoặc 3:4, dung lượng mỗi ảnh nên nén dưới **1.5MB** để tải tức thì trên 4G/5G).
2. Đặt tên file theo thứ tự: `01.jpg`, `02.jpg`, `03.jpg`, `04.jpg`... rồi tải vào thư mục `Images`.
3. Tải 1 file nhạc `.mp3` (dung lượng khuyến nghị **dưới 4MB**) vào thư mục `Music`.
4. **Thiết lập quyền xem file đúng cách (Quan trọng)**:
   - Bạn **KHÔNG** cần công khai toàn bộ Google Drive cá nhân.
   - Chỉ cần nhấp chuột phải vào thư mục `Images` (và file `background.mp3`) -> Chọn **Chia sẻ (Share)** -> Ở mục *Quyền truy cập chung (General access)*, đổi từ *Hạn chế (Restricted)* sang **Bất kỳ ai có đường liên kết (Anyone with the link) -> Người xem (Viewer)**.
   - *Sự khác biệt giữa quyền chạy của Apps Script và quyền xem file Google Drive*: Khi bạn chọn `Execute as: Me` trong Apps Script, code backend (`Code.gs`) có quyền đọc file trong Drive của bạn, nhưng trình duyệt điện thoại của người yêu khi tải thẻ `<img src="https://drive.google.com/...">` lại tải trực tiếp từ máy chủ Google Drive bằng phiên trình duyệt của cô ấy. Do đó, bật *Anyone with the link (Viewer)* cho riêng thư mục `Images` giúp trình duyệt tải ảnh trực tiếp qua CDN nhanh gấp 5 lần so với đi qua Base64 Proxy.

### Bước 3: Lấy Folder ID và File ID
1. Mở thư mục `Images` trên trình duyệt. Nhìn lên thanh địa chỉ URL:
   `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`
   -> Phần chuỗi ký tự sau `/folders/` chính là **Folder ID** (`1aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`).
2. Nhấp chuột phải vào file `background.mp3` -> **Lấy đường liên kết (Copy link)**:
   `https://drive.google.com/file/d/1xYzAbCdEfGhIjKlMnOpQrStUvWxYz987/view?usp=sharing`
   -> Bạn có thể dán nguyên đường link này vào trang Quản trị (hệ thống sẽ tự động tách **File ID**), hoặc copy chuỗi nằm giữa `/d/` và `/view`.

### Bước 4: Tạo Google Apps Script Project
1. Truy cập [script.google.com](https://script.google.com/) -> Nhấn **Dự án mới (New project)**.
2. Đặt tên dự án ở góc trên bên trái là: `Anh Xin Loi Em ❤️`.

### Bước 5: Tạo từng file mã nguồn
1. Trong trình soạn thảo Apps Script, nhấp vào biểu tượng **Cài đặt dự án (Project Settings ⚙️)** ở thanh bên trái -> Tích chọn ô **"Hiển thị tệp kê khai 'appsscript.json' trong trình chỉnh sửa"**.
2. Quay lại tab **Trình chỉnh sửa (Editor `< >`)**:
   - Mở `appsscript.json`: Xóa nội dung cũ và dán toàn bộ nội dung file `appsscript.json` vào.
   - Mở `Code.gs`: Xóa hàm `myFunction()` mặc định và dán toàn bộ nội dung file `Code.gs` vào.
   - Nhấn dấu **`+` (Thêm tệp -> HTML)** để tạo lần lượt **4 file HTML** (lưu ý đặt tên **chính xác chữ hoa/thường**, không gõ đuôi `.html` vì Google tự thêm):
     1. `Index` (dán nội dung `Index.html`)
     2. `Styles` (dán nội dung `Styles.html`)
     3. `Scripts` (dán nội dung `Scripts.html`)
     4. `Admin` (dán nội dung `Admin.html`)
3. Nhấn `Ctrl + S` (hoặc `Cmd + S`) để lưu toàn bộ các file.

### Bước 6 & 7: Cấu hình dữ liệu mẫu, chạy thử và cấp quyền (Authorize)
1. Trên thanh công cụ của `Code.gs`, chọn hàm `setupSampleConfig` ở menu thả xuống (cạnh nút **Chạy / Run**).
2. Nhấn **Chạy (Run)**.
3. Một cửa sổ yêu cầu cấp quyền sẽ hiện ra:
   - Nhấn **Xem lại quyền (Review permissions)** -> Chọn tài khoản Google của bạn.
   - Nếu xuất hiện màn hình cảnh báo *"Google hasn't verified this app"*, nhấn vào **Nâng cao (Advanced)** -> Nhấn **Đi tới Anh Xin Loi Em (không an toàn) / Go to project (unsafe)** -> Nhấn **Cho phép (Allow)**.

### Bước 8 & 9: Deploy dưới dạng Web App và chọn quyền truy cập
1. Nhấn nút **Triển khai (Deploy)** ở góc trên bên phải -> Chọn **Tạo mục triển khai mới (New deployment)**.
2. Nhấn biểu tượng bánh răng ⚙️ cạnh mục *Chọn loại (Select type)* -> Chọn **Ứng dụng web (Web app)**.
3. Thiết lập 2 thông số cực kỳ quan trọng:
   - **Thực thi dưới dạng (Execute as)**: Chọn **Tôi (Me - email của bạn)**.
   - **Ai có quyền truy cập (Who has access)**: Chọn **Bất kỳ ai (Anyone)**. *(Nhờ cấu hình này, người yêu của bạn mở link trên iPhone/Android qua Zalo, Messenger, iMessage không cần phải đăng nhập tài khoản Google)*.
4. Nhấn **Triển khai (Deploy)** và sao chép đường link **URL ứng dụng web (`https://script.google.com/macros/s/.../exec`)**.

### Bước 10: Mở trang Quản trị để điền Folder ID, Nhạc và Lời nhắn riêng
1. Để chỉnh sửa nội dung trên giao diện đồ họa, bạn mở đường link chạy thử dành cho chủ sở hữu (`.../dev?page=admin` — lấy link `/dev` bằng cách chọn **Deploy -> Test deployments**) khi đang đăng nhập tài khoản Google của bạn.
2. Tại trang Quản trị (`Admin.html`):
   - Điền biệt danh người yêu, dán **Folder ID** thư mục `Images` và nhấn **Kiểm tra**.
   - Dán **File ID** nhạc nền MP3 và nhấn **Kiểm tra**.
   - Sửa lại các câu ở Cảnh 3, nội dung bức thư tay ở Cảnh 4 theo đúng câu chuyện thật của hai bạn.
   - Nhấn **💾 Lưu toàn bộ cấu hình**.

### Bước 11: Kiểm tra trên iPhone và Android trước khi gửi
1. Mở đường link chính thức (`.../exec`) trên điện thoại của bạn bằng trình duyệt ẩn danh để đóng vai người nhận.
2. Kiểm tra thao tác chạm mở màn, tiếng nhạc nền, hiệu ứng chuyển ảnh ở Cảnh 2, mở phong bì thư ở Cảnh 4 và gửi thử một lời nhắn ở Cảnh 5.

### Bước 12: Cách cập nhật ảnh, nhạc và lời nhắn sau này
- **Khi chỉ thay ảnh, thêm ảnh mới hoặc sửa lời nhắn**: Bạn chỉ cần tải ảnh mới vào thư mục `Images` trên Google Drive hoặc bấm **Lưu cấu hình** trong `Admin.html`. Thay đổi có hiệu lực ngay lập tức mà **không cần Re-deploy** lại mã nguồn!
- **Khi bạn sửa code trong `Code.gs` hoặc HTML**: Chọn **Deploy -> Manage deployments -> Nhấn biểu tượng cây bút ✏️ -> Chọn Version: New version -> Deploy** (giữ nguyên đường link cũ).

## F. Checklist kiểm thử 10 tình huống thực tế

| STT | Tình huống kiểm thử | Cơ chế xử lý đã tích hợp trong mã nguồn |
| :--- | :--- | :--- |
| 1 | **Chưa có ảnh hoặc Folder trống** | Tự động hiển thị bộ 4 khung tranh SVG lãng mạn với lời chú thích mặc định, không bao giờ hiện icon ảnh lỗi. |
| 2 | **Ảnh bị xóa hoặc để quên ở chế độ Restricted** | Tự động chuyển từ `drive.google.com/thumbnail` -> `lh3.googleusercontent.com` -> `getDriveMediaBase64()` (Proxy đọc bằng quyền chủ sở hữu) -> SVG Artwork. |
| 3 | **Không cấu hình file nhạc MP3** | Tự động kích hoạt bộ tạo giai điệu Piano lãng mạn bằng **Web Audio API (`SynthPiano`)**, không cần file ngoài. |
| 4 | **Trình duyệt chặn tự động phát nhạc (Autoplay Policy)** | Nhạc chỉ bắt đầu phát ngay trong sự kiện `click` khi người yêu chạm vào nút *"Chạm vào đây nhé ❤️"* ở Cảnh 1. |
| 5 | **Mất kết nối mạng giữa chừng** | Ảnh kế tiếp đã được `preloadAndResolveImage` nạp sẵn vào bộ nhớ đệm `AppState.imageCache`; nhạc Synth chạy hoàn toàn offline trên trình duyệt. |
| 6 | **Màn hình nhỏ (iPhone SE / màn hình gập)** | Sử dụng `100dvh`, bố cục linh hoạt, lá thư ở Cảnh 4 có thanh cuộn mượt bên trong khung giấy (`max-height: 76vh; overflow-y: auto`). |
| 7 | **Người dùng tải lại trang hoặc khóa màn hình** | Sự kiện `visibilitychange` tự động tạm dừng vòng lặp Canvas và bộ đếm chuyển ảnh khi rời tab/khóa máy, tiết kiệm pin tối đa. |
| 8 | **Người dùng bấm chuyển cảnh liên tục** | Hàm `clearAllSceneTimers()` hủy toàn bộ `setInterval` và `setTimeout` của cảnh cũ trước khi kích hoạt cảnh mới, chống chồng chéo hiệu ứng. |
| 9 | **Chưa khởi tạo dữ liệu cấu hình** | `loadRawConfig_()` tự động trả về `getDefaultConfig_()` đầy đủ 5 cảnh mẫu. |
| 10 | **Người lạ cố truy cập `?page=admin` hoặc gọi `saveStoryConfig`** | Backend kiểm tra `Session.getActiveUser().getEmail()` đối chiếu với `Session.getEffectiveUser().getEmail()`; ném lỗi từ chối truy cập ngay lập tức nếu không phải chủ sở hữu. |

## G. Các giới hạn thực tế của Apps Script, Google Drive và Trình duyệt

1. **Khung Iframe Sandbox của Google Apps Script**:
   - Mọi Web App của Google Apps Script đều chạy bên trong một `<iframe>` bảo mật trên miền `*.googleusercontent.com` và luôn hiển thị một dải băng nhỏ ở trên cùng hoặc dưới cùng của Google (*"This application was created by another user"*). Đây là cơ chế chống giả mạo bắt buộc của Google đối với tài khoản miễn phí.
2. **Giới hạn băng thông & Virus Scan của Google Drive với file lớn**:
   - Google Drive không phải là CDN chuyên dụng cho streaming video/audio dung lượng lớn. Với các file lớn hơn 25MB, Google Drive chèn trang cảnh báo quét virus khiến thẻ `<audio>` hoặc `<img>` không đọc được. Do đó, hãy giữ ảnh dưới **2MB/ảnh** và nhạc MP3 dưới **4MB**.
3. **Giới hạn của chế độ `Execute as: Me` + `Who has access: Anyone`**:
   - Khi triển khai ở chế độ `Anyone (ẩn danh)` để người yêu không cần đăng nhập Google, hàm `Session.getActiveUser().getEmail()` trên link công khai (`/exec`) sẽ trả về chuỗi rỗng để bảo vệ quyền riêng tư. Vì vậy, khi chính bạn muốn vào trang Quản trị (`?page=admin`), hãy mở qua đường link **Test deployment (`/dev?page=admin`)** hoặc đặt quyền truy cập tạm thời là *Anyone with Google Account* trong lúc chỉnh sửa.
