/**
 * ============================================================================
 * DỰ ÁN: ANH XIN LỖI EM ❤️ - INTERACTIVE CINEMATIC LOVE STORY (GOOGLE APPS SCRIPT)
 * File: Code.gs
 * Vai trò: Backend xử lý Web App routing, tích hợp Google Drive an toàn,
 *          quản lý cấu hình (PropertiesService + Google Sheets tùy chọn),
 *          Caching và kiểm soát quyền truy cập trang Quản trị (Admin).
 * ============================================================================
 */

var CONFIG_STORAGE_KEY = 'LOVE_STORY_CONFIG_V1';
var REPLIES_STORAGE_KEY = 'LOVE_STORY_REPLIES_V1';
var PUBLIC_CACHE_KEY = 'LOVE_STORY_PUBLIC_CACHE_V1';
var CACHE_TTL_SECONDS = 300; // Cache cấu hình công khai 5 phút
var MAX_PROXY_FILE_BYTES = 4 * 1024 * 1024; // Giới hạn 4MB cho Base64 proxy để tránh vượt ngưỡng thực thi GAS

/**
 * 1. ENTRY POINT: Hàm doGet(e) trả về giao diện Web App
 * - Mặc định: Trả về trang câu chuyện tương tác (Index.html)
 * - Khi có tham số ?page=admin: Kiểm tra quyền chủ sở hữu và trả về trang Quản trị (Admin.html)
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var page = String(params.page || 'story').toLowerCase().trim();

  if (page === 'admin') {
    var template = HtmlService.createTemplateFromFile('Admin');
    var authInfo = getAdminAuthStatus_();
    template.isAuthorized = authInfo.isAuthorized;
    template.currentUserEmail = authInfo.currentUserEmail;
    template.ownerEmail = authInfo.ownerEmail;
    template.authMessage = authInfo.message;

    return template.evaluate()
      .setTitle('Quản Trị Câu Chuyện — Anh Xin Lỗi Em ❤️')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.SAMEORIGIN);
  }

  var storyTemplate = HtmlService.createTemplateFromFile('Index');
  return storyTemplate.evaluate()
    .setTitle('Anh xin lỗi em ❤️')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 2. HELPER: Nhúng nội dung các file HTML/CSS/JS con vào template chính
 * Sử dụng trong HTML: <?!= include('Styles'); ?> hoặc <?!= include('Scripts'); ?>
 */
function include(filename) {
  var allowedFiles = ['Styles', 'Scripts'];
  if (allowedFiles.indexOf(filename) === -1) {
    throw new Error('File include không hợp lệ: ' + filename);
  }
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 3. PUBLIC API: Lấy cấu hình công khai cho trang người nhận (Index.html)
 * Kết hợp dữ liệu cấu hình, danh sách ảnh và nhạc trong 1 lần gọi để giảm độ trễ.
 */
function getPublicStoryConfig() {
  try {
    var cache = CacheService.getScriptCache();
    var cachedJson = cache.get(PUBLIC_CACHE_KEY);
    if (cachedJson) {
      return JSON.parse(cachedJson);
    }

    var rawConfig = loadRawConfig_();
    var resolvedImages = getStoryImages(rawConfig.driveFolderId, rawConfig.images);
    var resolvedMusic = getMusicConfig(rawConfig);

    var publicPayload = {
      status: 'ok',
      recipientName: rawConfig.recipientName || 'Em yêu',
      senderName: rawConfig.senderName || 'Anh',
      openingText: rawConfig.openingText || 'Em à, anh có điều muốn nói…',
      openingButtonText: rawConfig.openingButtonText || 'Chạm vào đây nhé ❤️',
      openingSubtitle: rawConfig.openingSubtitle || 'Dành riêng cho người con gái anh luôn trân trọng',
      confessionLines: Array.isArray(rawConfig.confessionLines) && rawConfig.confessionLines.length > 0
        ? rawConfig.confessionLines
        : getDefaultConfig_().confessionLines,
      letterTitle: rawConfig.letterTitle || 'Gửi em, người mà anh luôn trân trọng.',
      letterBody: rawConfig.letterBody || getDefaultConfig_().letterBody,
      letterSignOff: rawConfig.letterSignOff || 'Anh xin lỗi em. ❤️',
      finalMessageLine1: rawConfig.finalMessageLine1 || 'Anh không mong em phải tha thứ ngay lúc này.',
      finalMessageLine2: rawConfig.finalMessageLine2 || 'Anh chỉ mong em biết rằng lời xin lỗi này là thật lòng.',
      finalBackgroundFileId: rawConfig.finalBackgroundFileId || '',
      finalBackgroundUrl: resolveSingleImageUrl_(rawConfig.finalBackgroundFileId, resolvedImages),
      theme: {
        primaryPink: (rawConfig.theme && rawConfig.theme.primaryPink) || '#f6bbd0',
        creamWhite: (rawConfig.theme && rawConfig.theme.creamWhite) || '#fff9f5',
        wineRed: (rawConfig.theme && rawConfig.theme.wineRed) || '#6b1d2f',
        sunsetPurple: (rawConfig.theme && rawConfig.theme.sunsetPurple) || '#1c0d26'
      },
      timing: {
        photoDurationMs: clampNumber_(rawConfig.timing && rawConfig.timing.photoDurationMs, 3500, 15000, 5500),
        confessionLineDelayMs: clampNumber_(rawConfig.timing && rawConfig.timing.confessionLineDelayMs, 1800, 8000, 2800),
        transitionStyle: (rawConfig.timing && rawConfig.timing.transitionStyle) || 'cinematic-fade',
        autoAdvancePhotos: rawConfig.timing ? Boolean(rawConfig.timing.autoAdvancePhotos) : true,
        imageFitMode: (rawConfig.timing && rawConfig.timing.imageFitMode) || 'cover'
      },
      images: resolvedImages,
      music: resolvedMusic,
      updatedAt: rawConfig.updatedAt || new Date().toISOString()
    };

    try {
      cache.put(PUBLIC_CACHE_KEY, JSON.stringify(publicPayload), CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      // Bỏ qua nếu payload vượt giới hạn 100KB của CacheService
      Logger.log('Cache warning: ' + cacheErr);
    }

    return publicPayload;
  } catch (err) {
    Logger.log('Error in getPublicStoryConfig: ' + err);
    var fallback = getDefaultConfig_();
    return {
      status: 'fallback',
      errorMessage: 'Đang sử dụng cấu hình mặc định do lỗi tải dữ liệu: ' + err.message,
      recipientName: fallback.recipientName,
      senderName: fallback.senderName,
      openingText: fallback.openingText,
      openingButtonText: fallback.openingButtonText,
      openingSubtitle: fallback.openingSubtitle,
      confessionLines: fallback.confessionLines,
      letterTitle: fallback.letterTitle,
      letterBody: fallback.letterBody,
      letterSignOff: fallback.letterSignOff,
      finalMessageLine1: fallback.finalMessageLine1,
      finalMessageLine2: fallback.finalMessageLine2,
      finalBackgroundFileId: '',
      finalBackgroundUrl: '',
      theme: fallback.theme,
      timing: fallback.timing,
      images: fallback.images,
      music: {
        enabled: true,
        fileId: '',
        title: fallback.music.title,
        directUrl: '',
        fallbackSynth: true,
        defaultVolume: 0.65
      }
    };
  }
}

/**
 * 4. DRIVE IMAGE RESOLVER: Lấy danh sách ảnh từ Google Drive theo thứ tự cấu hình
 * Hỗ trợ cả 2 chế độ:
 * - Chế độ 1: Quét tự động từ Google Drive Folder ID (sắp xếp theo tên file 01.jpg, 02.jpg...)
 * - Chế độ 2: Kết hợp danh sách ảnh & chú thích do Admin cấu hình thủ công
 */
function getStoryImages(folderId, configuredItems) {
  var cleanFolderId = sanitizeDriveId_(folderId);
  var items = Array.isArray(configuredItems) ? configuredItems : [];
  var folderMap = {};
  var folderFilesList = [];

  // Nếu có Folder ID hợp lệ, quét toàn bộ file ảnh trong Folder
  if (cleanFolderId) {
    try {
      var folder = DriveApp.getFolderById(cleanFolderId);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var mime = String(file.getMimeType() || '');
        if (mime.indexOf('image/') === 0 && !file.isTrashed()) {
          var fId = file.getId();
          var fName = file.getName();
          var fileEntry = {
            fileId: fId,
            fileName: fName,
            mimeType: mime,
            sizeBytes: file.getSize(),
            directUrl: buildDriveImageUrl_(fId),
            backupUrl: 'https://lh3.googleusercontent.com/d/' + fId + '=w1600'
          };
          folderMap[fId] = fileEntry;
          folderMap[fName.toLowerCase()] = fileEntry;
          folderFilesList.push(fileEntry);
        }
      }
      // Sắp xếp tự nhiên theo tên file (01.jpg, 02.jpg, 03.jpg...)
      folderFilesList.sort(function(a, b) {
        return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
      });
    } catch (folderErr) {
      Logger.log('Không thể đọc Folder ID (' + cleanFolderId + '): ' + folderErr.message);
    }
  }

  var resultImages = [];

  // Nếu Admin đã khai báo danh sách ảnh/chú thích cụ thể
  if (items.length > 0) {
    for (var i = 0; i < items.length; i++) {
      var item = items[i] || {};
      var rawIdOrName = String(item.fileId || item.fileName || '').trim();
      var matched = null;

      if (rawIdOrName && folderMap[rawIdOrName]) {
        matched = folderMap[rawIdOrName];
      } else if (rawIdOrName && folderMap[rawIdOrName.toLowerCase()]) {
        matched = folderMap[rawIdOrName.toLowerCase()];
      } else if (isValidDriveId_(rawIdOrName)) {
        matched = {
          fileId: rawIdOrName,
          fileName: item.fileName || ('memory_' + (i + 1) + '.jpg'),
          directUrl: buildDriveImageUrl_(rawIdOrName),
          backupUrl: 'https://lh3.googleusercontent.com/d/' + rawIdOrName + '=w1600'
        };
      } else if (folderFilesList[i]) {
        matched = folderFilesList[i];
      }

      resultImages.push({
        order: i + 1,
        fileId: matched ? matched.fileId : '',
        fileName: matched ? matched.fileName : (rawIdOrName || ('Kỷ niệm #' + (i + 1))),
        url: matched ? matched.directUrl : (item.fallbackUrl || ''),
        backupUrl: matched ? matched.backupUrl : '',
        caption: String(item.caption || 'Khoảnh khắc bên em mà anh luôn nhớ mãi.'),
        dateLabel: String(item.dateLabel || ('Cảnh ' + (i + 1)))
      });
    }
  } else if (folderFilesList.length > 0) {
    // Nếu chưa khai báo từng ảnh nhưng có Folder ID, tự động lấy tối đa 15 ảnh trong Folder
    var defaultCaptions = getDefaultConfig_().images;
    var limit = Math.min(folderFilesList.length, 15);
    for (var j = 0; j < limit; j++) {
      var fObj = folderFilesList[j];
      var defCap = defaultCaptions[j % defaultCaptions.length];
      resultImages.push({
        order: j + 1,
        fileId: fObj.fileId,
        fileName: fObj.fileName,
        url: fObj.directUrl,
        backupUrl: fObj.backupUrl,
        caption: defCap ? defCap.caption : 'Một kỷ niệm đẹp của hai đứa mình.',
        dateLabel: defCap ? defCap.dateLabel : fObj.fileName.replace(/\.[^/.]+$/, '')
      });
    }
  } else {
    // Fallback khi chưa cấu hình Drive
    resultImages = getDefaultConfig_().images;
  }

  return resultImages;
}

/**
 * 5. DRIVE MUSIC RESOLVER: Trả về cấu hình nhạc nền
 */
function getMusicConfig(optionalRawConfig) {
  var cfg = optionalRawConfig || loadRawConfig_();
  var musicCfg = cfg.music || {};
  var cleanMusicId = sanitizeDriveId_(musicCfg.fileId || '');

  return {
    enabled: musicCfg.enabled !== false,
    fileId: cleanMusicId,
    title: String(musicCfg.title || 'Giai Điệu Kỷ Niệm — Piano Lãng Mạn'),
    directUrl: cleanMusicId
      ? ('https://drive.google.com/uc?export=download&id=' + cleanMusicId)
      : '',
    defaultVolume: clampNumber_(musicCfg.defaultVolume, 0.1, 1.0, 0.65),
    fallbackSynth: true
  };
}

/**
 * 6. SAFE BASE64 PROXY: Lấy dữ liệu Base64 Data URI cho Ảnh hoặc Nhạc từ Google Drive
 * Giải quyết triệt để trường hợp trình duyệt di động (iOS Safari / Chrome) chặn 3rd-party cookie
 * hoặc chặn stream trực tiếp file MP3/JPG từ drive.google.com.
 * BẢO MẬT: Chỉ cho phép đọc những File ID nằm trong cấu hình câu chuyện hoặc thư mục ảnh đã cấu hình!
 */
function getDriveMediaBase64(fileId) {
  var cleanId = sanitizeDriveId_(fileId);
  if (!cleanId) {
    return { ok: false, error: 'File ID không hợp lệ.' };
  }

  if (!isFileAllowedForPublicProxy_(cleanId)) {
    return {
      ok: false,
      error: 'Từ chối truy cập: File ID không thuộc danh sách ảnh hoặc nhạc của câu chuyện.'
    };
  }

  try {
    var file = DriveApp.getFileById(cleanId);
    if (file.isTrashed()) {
      return { ok: false, error: 'File đã bị đưa vào thùng rác trên Google Drive.' };
    }

    var size = file.getSize();
    if (size > MAX_PROXY_FILE_BYTES) {
      return {
        ok: false,
        error: 'Dung lượng file (' + Math.round(size / 1024 / 1024 * 10) / 10 + 'MB) vượt giới hạn 4MB của luồng proxy. Hãy nén nhỏ file hoặc bật chia sẻ công khai (Anyone with the link).'
      };
    }

    var mime = String(file.getMimeType() || '');
    if (mime.indexOf('image/') !== 0 && mime.indexOf('audio/') !== 0 && mime !== 'application/octet-stream') {
      return { ok: false, error: 'Định dạng file không được hỗ trợ (' + mime + ').' };
    }

    var base64Data = Utilities.base64Encode(file.getBlob().getBytes());
    var safeMime = (mime === 'application/octet-stream') ? 'audio/mpeg' : mime;

    return {
      ok: true,
      fileId: cleanId,
      mimeType: safeMime,
      dataUri: 'data:' + safeMime + ';base64,' + base64Data
    };
  } catch (err) {
    return {
      ok: false,
      error: 'Không thể tải file từ Google Drive: ' + err.message
    };
  }
}

/**
 * 7. ADMIN API: Lấy toàn bộ cấu hình dành cho trang Quản trị (Đã xác thực)
 */
function getAdminConfig() {
  var auth = getAdminAuthStatus_();
  if (!auth.isAuthorized) {
    throw new Error('Truy cập bị từ chối: ' + auth.message);
  }

  var rawConfig = loadRawConfig_();
  var replies = loadLoverReplies_();

  return {
    status: 'ok',
    auth: auth,
    config: rawConfig,
    replies: replies
  };
}

/**
 * 8. ADMIN API: Lưu cấu hình câu chuyện (Chỉ chủ sở hữu / quản trị viên được phép gọi)
 */
function saveStoryConfig(inputData) {
  var auth = getAdminAuthStatus_();
  if (!auth.isAuthorized) {
    throw new Error('Bạn không có quyền lưu cấu hình. ' + auth.message);
  }

  if (!inputData || typeof inputData !== 'object') {
    throw new Error('Dữ liệu cấu hình gửi lên không hợp lệ.');
  }

  var sanitized = sanitizeConfigInput_(inputData);
  sanitized.updatedAt = new Date().toISOString();

  // Lưu vào PropertiesService
  var scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty(CONFIG_STORAGE_KEY, JSON.stringify(sanitized));

  // Nếu có cấu hình Google Sheets ID, đồng bộ sang Google Sheets để dễ theo dõi
  var sheetSyncResult = null;
  if (sanitized.googleSheetId) {
    sheetSyncResult = syncConfigToSheet_(sanitized.googleSheetId, sanitized);
  }

  // Xóa cache công khai để khách truy cập thấy ngay nội dung mới
  CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);

  return {
    ok: true,
    updatedAt: sanitized.updatedAt,
    sheetSync: sheetSyncResult,
    message: 'Đã lưu cấu hình thành công và làm mới bộ nhớ đệm!'
  };
}

/**
 * 9. ADMIN API: Kiểm tra file hoặc thư mục Google Drive có tồn tại và quyền chia sẻ hợp lệ không
 */
function validateDriveFile(idOrUrl, expectedType) {
  var auth = getAdminAuthStatus_();
  if (!auth.isAuthorized) {
    throw new Error('Bạn không có quyền thực hiện kiểm tra này.');
  }

  var cleanId = sanitizeDriveId_(idOrUrl);
  if (!cleanId) {
    return {
      ok: false,
      error: 'Không tìm thấy Google Drive ID hợp lệ. Hãy dán Folder ID, File ID hoặc đường link chia sẻ từ Google Drive.'
    };
  }

  try {
    if (expectedType === 'folder') {
      var folder = DriveApp.getFolderById(cleanId);
      var filesIter = folder.getFiles();
      var imageCount = 0;
      var sampleNames = [];
      while (filesIter.hasNext()) {
        var f = filesIter.next();
        if (String(f.getMimeType() || '').indexOf('image/') === 0 && !f.isTrashed()) {
          imageCount++;
          if (sampleNames.length < 5) {
            sampleNames.push(f.getName());
          }
        }
      }
      var access = String(folder.getSharingAccess());
      return {
        ok: true,
        id: cleanId,
        name: folder.getName(),
        type: 'folder',
        imageCount: imageCount,
        sampleNames: sampleNames,
        sharingAccess: access,
        isPublicLink: access === 'ANYONE_WITH_LINK' || access === 'ANYONE',
        recommendation: (access === 'ANYONE_WITH_LINK' || access === 'ANYONE')
          ? 'Thư mục đã bật chia sẻ link công khai. Ảnh sẽ tải rất nhanh trên điện thoại!'
          : 'Thư mục đang để Riêng tư (Restricted). Website vẫn tải được ảnh qua Proxy Base64 nếu ảnh < 4MB, nhưng nên bật "Anyone with the link -> Viewer" cho thư mục Images để tốc độ nhanh nhất.'
      };
    } else {
      var file = DriveApp.getFileById(cleanId);
      var fAccess = String(file.getSharingAccess());
      var sizeMb = Math.round((file.getSize() / 1024 / 1024) * 100) / 100;
      return {
        ok: true,
        id: cleanId,
        name: file.getName(),
        type: 'file',
        mimeType: file.getMimeType(),
        sizeMb: sizeMb,
        sharingAccess: fAccess,
        isPublicLink: fAccess === 'ANYONE_WITH_LINK' || fAccess === 'ANYONE',
        previewUrl: buildDriveImageUrl_(cleanId),
        recommendation: sizeMb > 4
          ? 'Cảnh báo: Dung lượng file (' + sizeMb + 'MB) khá lớn. Nên nén dưới 2MB (với ảnh) hoặc dưới 4MB (với MP3) và bật "Anyone with the link -> Viewer".'
          : 'File hợp lệ và sẵn sàng sử dụng (' + sizeMb + 'MB).'
      };
    }
  } catch (err) {
    return {
      ok: false,
      id: cleanId,
      error: 'Không tìm thấy hoặc không có quyền truy cập ID này trên Google Drive (' + err.message + ').'
    };
  }
}

/**
 * 10. RECIPIENT INTERACTION API: Lưu lời nhắn phản hồi từ người yêu ở Cảnh 5
 */
function saveLoverReply(replyPayload) {
  if (!replyPayload || typeof replyPayload !== 'object') {
    return { ok: false, error: 'Dữ liệu lời nhắn không hợp lệ.' };
  }

  var text = sanitizeText_(replyPayload.message || '', 1500);
  var mood = sanitizeText_(replyPayload.mood || 'Đã đọc lời xin lỗi ❤️', 120);
  if (!text && !mood) {
    return { ok: false, error: 'Vui lòng nhập lời nhắn hoặc chọn một trạng thái.' };
  }

  var entry = {
    timestamp: new Date().toISOString(),
    mood: mood,
    message: text
  };

  var scriptProps = PropertiesService.getScriptProperties();
  var existing = loadLoverReplies_();
  existing.unshift(entry);
  if (existing.length > 30) {
    existing = existing.slice(0, 30);
  }
  scriptProps.setProperty(REPLIES_STORAGE_KEY, JSON.stringify(existing));

  // Ghi vào Google Sheets nếu có cấu hình
  try {
    var cfg = loadRawConfig_();
    if (cfg.googleSheetId) {
      var ss = SpreadsheetApp.openById(cfg.googleSheetId);
      var sheet = ss.getSheetByName('Replies') || ss.insertSheet('Replies');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Thời gian', 'Trạng thái cảm xúc', 'Lời nhắn của em']);
      }
      sheet.appendRow([entry.timestamp, entry.mood, entry.message]);
    }
  } catch (sheetErr) {
    Logger.log('Không thể ghi lời nhắn vào Google Sheets: ' + sheetErr.message);
  }

  return {
    ok: true,
    message: 'Cảm ơn em. Lời nhắn của em đã được gửi tới anh một cách trân trọng nhất.'
  };
}

/* ============================================================================
 * CÁC HÀM NỘI BỘ (PRIVATE HELPERS)
 * ============================================================================ */

/**
 * Kiểm tra quyền Admin dựa trên tài khoản Google đang đăng nhập (Session)
 * Tuyệt đối KHÔNG dựa vào mật khẩu cứng hay mã bí mật trên URL.
 */
function getAdminAuthStatus_() {
  var activeEmail = '';
  var effectiveEmail = '';
  try {
    activeEmail = String(Session.getActiveUser().getEmail() || '').toLowerCase().trim();
    effectiveEmail = String(Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  } catch (e) {
    Logger.log('Session check warning: ' + e.message);
  }

  var extraAdminsRaw = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '';
  var allowedList = extraAdminsRaw.split(',').map(function(s) {
    return s.toLowerCase().trim();
  }).filter(Boolean);

  if (effectiveEmail) {
    allowedList.push(effectiveEmail);
  }

  // Trường hợp chạy bởi chính chủ sở hữu dự án
  var isOwnerOrAllowed = Boolean(activeEmail && allowedList.indexOf(activeEmail) !== -1);

  return {
    isAuthorized: isOwnerOrAllowed,
    currentUserEmail: activeEmail || '(Ẩn danh do chế độ Anyone Anonymous)',
    ownerEmail: effectiveEmail || '(Chủ sở hữu Script)',
    message: isOwnerOrAllowed
      ? 'Đã xác thực quyền Quản trị (' + activeEmail + ').'
      : 'Khi Web App được deploy ở chế độ "Anyone (kể cả ẩn danh)", Google ẩn danh tính người truy cập để bảo mật. Để chỉnh sửa cấu hình: (1) Mở link chạy thử (/dev) khi đang đăng nhập tài khoản chủ sở hữu, hoặc (2) Chạy hàm setupSampleConfig() trực tiếp trong trình soạn thảo Apps Script.'
  };
}

/**
 * Chỉ cho phép hàm getDriveMediaBase64 đọc các file nằm trong cấu hình câu chuyện
 */
function isFileAllowedForPublicProxy_(fileId) {
  var cfg = loadRawConfig_();
  if (cfg.music && sanitizeDriveId_(cfg.music.fileId) === fileId) {
    return true;
  }
  if (sanitizeDriveId_(cfg.finalBackgroundFileId) === fileId) {
    return true;
  }
  var images = getStoryImages(cfg.driveFolderId, cfg.images);
  for (var i = 0; i < images.length; i++) {
    if (images[i].fileId === fileId) {
      return true;
    }
  }
  return false;
}

/**
 * Tách Drive ID an toàn từ chuỗi ID hoặc URL Google Drive bất kỳ
 */
function sanitizeDriveId_(input) {
  if (!input) return '';
  var str = String(input).trim();
  // Nếu người dùng dán nguyên URL: https://drive.google.com/file/d/XXXX/view hoặc .../folders/XXXX
  var folderMatch = str.match(/\/folders\/([a-zA-Z0-9_-]{10,80})/);
  if (folderMatch && folderMatch[1]) return folderMatch[1];

  var fileMatch = str.match(/\/d\/([a-zA-Z0-9_-]{10,80})/);
  if (fileMatch && fileMatch[1]) return fileMatch[1];

  var idParamMatch = str.match(/[?&]id=([a-zA-Z0-9_-]{10,80})/);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  if (/^[a-zA-Z0-9_-]{10,80}$/.test(str)) {
    return str;
  }
  return '';
}

function isValidDriveId_(str) {
  return /^[a-zA-Z0-9_-]{10,80}$/.test(String(str || '').trim());
}

/**
 * Tạo URL hiển thị ảnh ổn định trên trình duyệt di động (Thumbnail endpoint độ phân giải cao w1600)
 */
function buildDriveImageUrl_(fileId) {
  var clean = sanitizeDriveId_(fileId);
  if (!clean) return '';
  return 'https://drive.google.com/thumbnail?id=' + clean + '&sz=w1600';
}

function resolveSingleImageUrl_(fileId, resolvedImages) {
  var clean = sanitizeDriveId_(fileId);
  if (clean) {
    return buildDriveImageUrl_(clean);
  }
  if (Array.isArray(resolvedImages) && resolvedImages.length > 0) {
    return resolvedImages[resolvedImages.length - 1].url || '';
  }
  return '';
}

function clampNumber_(val, min, max, fallback) {
  var num = Number(val);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeText_(str, maxLen) {
  if (str === null || str === undefined) return '';
  return String(str).trim().slice(0, maxLen || 1000);
}

function sanitizeHexColor_(str, fallback) {
  var s = String(str || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : fallback;
}

/**
 * Làm sạch và giới hạn toàn bộ dữ liệu đầu vào trước khi lưu
 */
function sanitizeConfigInput_(data) {
  var def = getDefaultConfig_();
  var rawLines = Array.isArray(data.confessionLines) ? data.confessionLines : def.confessionLines;
  var cleanLines = rawLines
    .map(function(line) { return sanitizeText_(line, 300); })
    .filter(Boolean)
    .slice(0, 10);

  if (cleanLines.length === 0) {
    cleanLines = def.confessionLines;
  }

  var rawImages = Array.isArray(data.images) ? data.images : [];
  var cleanImages = [];
  for (var i = 0; i < Math.min(rawImages.length, 20); i++) {
    var img = rawImages[i] || {};
    cleanImages.push({
      order: i + 1,
      fileId: sanitizeDriveId_(img.fileId || ''),
      fileName: sanitizeText_(img.fileName || ('0' + (i + 1) + '.jpg'), 120),
      caption: sanitizeText_(img.caption || '', 280),
      dateLabel: sanitizeText_(img.dateLabel || ('Kỷ niệm #' + (i + 1)), 80),
      fallbackUrl: sanitizeText_(img.fallbackUrl || '', 500)
    });
  }

  return {
    recipientName: sanitizeText_(data.recipientName || def.recipientName, 80),
    senderName: sanitizeText_(data.senderName || def.senderName, 80),
    driveFolderId: sanitizeDriveId_(data.driveFolderId || ''),
    googleSheetId: sanitizeDriveId_(data.googleSheetId || ''),
    openingText: sanitizeText_(data.openingText || def.openingText, 200),
    openingButtonText: sanitizeText_(data.openingButtonText || def.openingButtonText, 80),
    openingSubtitle: sanitizeText_(data.openingSubtitle || def.openingSubtitle, 160),
    confessionLines: cleanLines,
    letterTitle: sanitizeText_(data.letterTitle || def.letterTitle, 200),
    letterBody: sanitizeText_(data.letterBody || def.letterBody, 5000),
    letterSignOff: sanitizeText_(data.letterSignOff || def.letterSignOff, 150),
    finalMessageLine1: sanitizeText_(data.finalMessageLine1 || def.finalMessageLine1, 250),
    finalMessageLine2: sanitizeText_(data.finalMessageLine2 || def.finalMessageLine2, 250),
    finalBackgroundFileId: sanitizeDriveId_(data.finalBackgroundFileId || ''),
    theme: {
      primaryPink: sanitizeHexColor_(data.theme && data.theme.primaryPink, def.theme.primaryPink),
      creamWhite: sanitizeHexColor_(data.theme && data.theme.creamWhite, def.theme.creamWhite),
      wineRed: sanitizeHexColor_(data.theme && data.theme.wineRed, def.theme.wineRed),
      sunsetPurple: sanitizeHexColor_(data.theme && data.theme.sunsetPurple, def.theme.sunsetPurple)
    },
    timing: {
      photoDurationMs: clampNumber_(data.timing && data.timing.photoDurationMs, 3500, 15000, 5500),
      confessionLineDelayMs: clampNumber_(data.timing && data.timing.confessionLineDelayMs, 1800, 8000, 2800),
      transitionStyle: sanitizeText_((data.timing && data.timing.transitionStyle) || 'cinematic-fade', 40),
      autoAdvancePhotos: data.timing ? Boolean(data.timing.autoAdvancePhotos) : true,
      imageFitMode: ((data.timing && data.timing.imageFitMode) === 'contain') ? 'contain' : 'cover'
    },
    music: {
      enabled: data.music ? Boolean(data.music.enabled) : true,
      fileId: sanitizeDriveId_(data.music && data.music.fileId),
      title: sanitizeText_((data.music && data.music.title) || def.music.title, 140),
      defaultVolume: clampNumber_(data.music && data.music.defaultVolume, 0.1, 1.0, 0.65)
    },
    images: cleanImages
  };
}

/**
 * Đọc cấu hình từ ScriptProperties (hoặc trả về mặc định nếu chưa khởi tạo)
 */
function loadRawConfig_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_STORAGE_KEY);
  if (!raw) {
    return getDefaultConfig_();
  }
  try {
    var parsed = JSON.parse(raw);
    return sanitizeConfigInput_(parsed);
  } catch (e) {
    return getDefaultConfig_();
  }
}

function loadLoverReplies_() {
  var raw = PropertiesService.getScriptProperties().getProperty(REPLIES_STORAGE_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Đồng bộ cấu hình sang Google Sheets (tùy chọn nếu người dùng nhập Google Sheet ID)
 */
function syncConfigToSheet_(sheetId, configObj) {
  try {
    var ss = SpreadsheetApp.openById(sheetId);
    var cfgSheet = ss.getSheetByName('Config') || ss.insertSheet('Config');
    cfgSheet.clearContents();
    cfgSheet.appendRow(['Trường cấu hình', 'Giá trị']);
    cfgSheet.appendRow(['Người nhận (recipientName)', configObj.recipientName]);
    cfgSheet.appendRow(['Người gửi (senderName)', configObj.senderName]);
    cfgSheet.appendRow(['Drive Folder ID (driveFolderId)', configObj.driveFolderId]);
    cfgSheet.appendRow(['Music File ID (music.fileId)', configObj.music.fileId]);
    cfgSheet.appendRow(['Lời mở đầu (openingText)', configObj.openingText]);
    cfgSheet.appendRow(['Tiêu đề thư (letterTitle)', configObj.letterTitle]);
    cfgSheet.appendRow(['Nội dung thư (letterBody)', configObj.letterBody]);
    cfgSheet.appendRow(['Lời kết 1 (finalMessageLine1)', configObj.finalMessageLine1]);
    cfgSheet.appendRow(['Lời kết 2 (finalMessageLine2)', configObj.finalMessageLine2]);
    cfgSheet.appendRow(['Cập nhật lúc', configObj.updatedAt]);

    var imgSheet = ss.getSheetByName('Images') || ss.insertSheet('Images');
    imgSheet.clearContents();
    imgSheet.appendRow(['Thứ tự', 'Tên file / Nhãn', 'Google Drive File ID', 'Chú thích ảnh']);
    for (var i = 0; i < configObj.images.length; i++) {
      var im = configObj.images[i];
      imgSheet.appendRow([im.order, im.dateLabel, im.fileId, im.caption]);
    }
    return { synced: true, sheetName: ss.getName() };
  } catch (err) {
    return { synced: false, error: err.message };
  }
}

/**
 * Hàm khởi tạo nhanh dữ liệu mẫu từ trình soạn thảo Apps Script (Run -> setupSampleConfig)
 */
function setupSampleConfig() {
  var def = getDefaultConfig_();
  PropertiesService.getScriptProperties().setProperty(CONFIG_STORAGE_KEY, JSON.stringify(def));
  CacheService.getScriptCache().remove(PUBLIC_CACHE_KEY);
  Logger.log('Đã khởi tạo cấu hình mẫu thành công!');
}

/**
 * Cấu hình mặc định chuẩn kịch bản 5 cảnh
 */
function getDefaultConfig_() {
  return {
    recipientName: 'Em yêu của anh',
    senderName: 'Người luôn thương em',
    driveFolderId: '',
    googleSheetId: '',
    openingText: 'Em à, anh có điều muốn nói…',
    openingButtonText: 'Chạm vào đây nhé ❤️',
    openingSubtitle: 'Một thước phim nhỏ anh làm riêng tặng em',
    confessionLines: [
      'Có những lúc anh đã vô tâm…',
      'Có những lời anh nói khiến em buồn…',
      'Anh biết một lời xin lỗi không thể xóa hết mọi chuyện.',
      'Nhưng anh thật lòng muốn lắng nghe và sửa đổi.'
    ],
    letterTitle: 'Gửi em, người mà anh luôn trân trọng.',
    letterBody: [
      'Anh xin lỗi vì đã khiến em buồn. Có thể lúc ấy anh chưa hiểu hết cảm xúc của em, nhưng điều đó không có nghĩa là anh không quan tâm.',
      'Anh không muốn chỉ nói lời xin lỗi cho qua chuyện. Anh muốn học cách lắng nghe em nhiều hơn, hiểu em hơn và thể hiện tình cảm bằng những hành động cụ thể.',
      'Anh biết em có quyền cần thời gian và anh sẽ tôn trọng điều đó.',
      'Cảm ơn em vì những kỷ niệm đẹp mà chúng ta đã có.'
    ].join('\n\n'),
    letterSignOff: 'Anh xin lỗi em. ❤️',
    finalMessageLine1: 'Anh không mong em phải tha thứ ngay lúc này.',
    finalMessageLine2: 'Anh chỉ mong em biết rằng lời xin lỗi này là thật lòng.',
    finalBackgroundFileId: '',
    theme: {
      primaryPink: '#f6bbd0',
      creamWhite: '#fff9f5',
      wineRed: '#6b1d2f',
      sunsetPurple: '#1c0d26'
    },
    timing: {
      photoDurationMs: 5500,
      confessionLineDelayMs: 2800,
      transitionStyle: 'cinematic-fade',
      autoAdvancePhotos: true,
      imageFitMode: 'cover'
    },
    music: {
      enabled: true,
      fileId: '',
      title: 'Giai Điệu Kỷ Niệm — Bản Nhạc Của Hai Đứa',
      defaultVolume: 0.65
    },
    images: [
      {
        order: 1,
        fileId: '',
        fileName: '01.jpg',
        dateLabel: 'Cảnh 01 • Hoàng hôn bên nhau',
        caption: 'Nắm tay em đi qua những chiều hoàng hôn bình yên nhất.',
        url: ''
      },
      {
        order: 2,
        fileId: '',
        fileName: '02.jpg',
        dateLabel: 'Cảnh 02 • Góc quán quen ngày mưa',
        caption: 'Những buổi hẹn dịu dàng bên tách cà phê ấm và tiếng mưa ngoài hiên.',
        url: ''
      },
      {
        order: 3,
        fileId: '',
        fileName: '03.jpg',
        dateLabel: 'Cảnh 03 • Dưới một chiếc ô',
        caption: 'Dù ngoài kia phố xá đông đúc thế nào, đi cạnh em vẫn là nơi ấm áp nhất.',
        url: ''
      },
      {
        order: 4,
        fileId: '',
        fileName: '04.jpg',
        dateLabel: 'Cảnh 04 • Điều ước dưới bầu trời đêm',
        caption: 'Mỗi khoảnh khắc bên em đều là kỷ niệm mà anh luôn muốn giữ gìn.',
        url: ''
      }
    ]
  };
}
