// Cấu hình Hệ thống báo cáo giải ngân vốn đầu tư công (KBNN Khu vực VIII)
export const CONFIG = {
  SUPABASE_URL: 'https://omtcphhbbrizxybmyiuh.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_fF-qdkYisDpmjlATOuixbA_csqgP9K1',
  EMAIL_DOMAIN: 'bc1953.local',
  TEN_DON_VI: 'KBNN KHU VỰC VIII',

  // 2 ô đăng nhập nhanh theo phòng. Có "ma" = vào thẳng không cần mật khẩu; không có "ma" = phải nhập mật khẩu.
  TONGHOP_PHONG: [
    { tai_khoan: 'pnv2', ten: 'Phòng Nghiệp vụ 2', mo_ta: 'Quản trị dữ liệu, tổng hợp báo cáo', bieu_tuong: '🏛️' },   // cần nhập mật khẩu
    { tai_khoan: 'pgd', ten: 'Phòng giao dịch', mo_ta: 'Hoàn thiện thông tin dự án, xem báo cáo', bieu_tuong: '🏢', ma: 'IV7A3YsV0gyYrG5p-i4tb9bT' },
  ],
};
