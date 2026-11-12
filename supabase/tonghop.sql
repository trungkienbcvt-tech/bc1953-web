-- =====================================================================
--  TỔNG HỢP BÁO CÁO THEO CHỦ ĐẦU TƯ (thay file Excel "BC Chu dau tu 2026")
--  Đầu vào : sheet CDT, BC TT 85, BC TT 15
--  Đầu ra  : BC tuần CT (TT15), BC tuần CT (TT85), BC giải ngân tháng
--  Chạy 1 lần trong Supabase → SQL Editor (sau schema.sql)
-- =====================================================================

-- Quyền: xem = ADMIN, KBNN, tài khoản tổng hợp; sửa = ADMIN, KBNN
create or replace function public.th_xem() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vai_tro() in ('ADMIN','KBNN_NHAN','KBNN_DUYET','XEM'), false)
$$;
create or replace function public.th_sua() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vai_tro() in ('ADMIN','KBNN_NHAN','KBNN_DUYET'), false)
$$;

-- Sheet CDT: mã dự án → chủ đầu tư
create table if not exists public.th_cdt (
  ma_da    text primary key,
  ten_da   text,
  cdt      text,      -- cột C "Đơn vị/ Chủ đầu tư"  (dùng cho BC tháng)
  cdt2     text,      -- cột D "Đơn vị/ Chủ đầu tư2" (dùng cho BC tuần TT15, TT85)
  kbnn     text,      -- cột E "KBNN giao dịch"
  dac_thu  text,
  ctmt     text,
  thu_tu   int not null default 0
);

-- Lần tải file nguồn gần nhất
create table if not exists public.th_nguon_file (
  loai     text primary key check (loai in ('CDT','TT85','TT15')),
  ten_file text,
  ky_in    text,          -- "Báo cáo in từ ngày ... đến ngày ..."
  so_dong  int,
  tai_luc  timestamptz not null default now(),
  tai_boi  text
);

-- Dòng dự án của sheet BC TT 85 / BC TT 15 (đồng)
create table if not exists public.th_nguon (
  id        bigint generated always as identity primary key,
  loai      text not null check (loai in ('TT85','TT15')),
  dong      int,
  ma_da     text not null,
  dia_diem  text,
  ten       text,
  so        jsonb not null default '{}'::jsonb
);
create index if not exists idx_th_nguon_loai on public.th_nguon(loai);

-- "Cộng thêm" (triệu đồng) vào 1 ô của báo cáo
create table if not exists public.th_dieu_chinh (
  id        bigint generated always as identity primary key,
  bao_cao   text not null check (bao_cao in ('TT15','TT85','THANG')),
  dong      int  not null,           -- chỉ số dòng trong mẫu báo cáo
  ten_dong  text,
  cot       text not null,
  so_tien   numeric(20,6) not null default 0,
  ghi_chu   text,
  su_dung   boolean not null default true,
  cap_nhat_luc timestamptz not null default now()
);

-- Kỳ báo cáo đã lập (lưu toàn bộ số liệu đầu ra; kỳ đã chốt dùng làm "tuần trước")
create table if not exists public.th_ky (
  id         bigint generated always as identity primary key,
  bao_cao    text not null check (bao_cao in ('TT15','TT85','THANG')),
  ten        text not null,
  dong_tieu_de text,                  -- vd "Từ ngày 26/10/2026 Đến ngày 01/11/2026"
  so_van_ban text,
  ky_truoc_id bigint references public.th_ky(id) on delete set null,
  so_lieu    jsonb not null,          -- mảng giá trị theo dòng mẫu
  anh_chup   jsonb,                   -- lũy kế Q..Y để làm kỳ trước
  chot       boolean not null default false,
  tao_boi    text,
  tao_luc    timestamptz not null default now()
);
create index if not exists idx_th_ky on public.th_ky(bao_cao, tao_luc desc);

alter table public.th_cdt        enable row level security;
alter table public.th_nguon_file enable row level security;
alter table public.th_nguon      enable row level security;
alter table public.th_dieu_chinh enable row level security;
alter table public.th_ky         enable row level security;

do $$ declare t text; begin
  foreach t in array array['th_cdt','th_nguon_file','th_nguon','th_dieu_chinh','th_ky'] loop
    execute format('drop policy if exists %I on public.%I', t||'_xem', t);
    execute format('drop policy if exists %I on public.%I', t||'_sua', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.th_xem())', t||'_xem', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.th_sua()) with check (public.th_sua())', t||'_sua', t);
  end loop;
end $$;

-- Thay toàn bộ dữ liệu 1 sheet nguồn trong 1 giao dịch
create or replace function public.th_thay_nguon(p_loai text, p_rows jsonb, p_ten_file text, p_ky_in text)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_ten text;
begin
  if not public.th_sua() then raise exception 'Không có quyền cập nhật dữ liệu'; end if;
  select ho_ten into v_ten from public.profiles where id = auth.uid();
  if p_loai = 'CDT' then
    delete from public.th_cdt where true;
    insert into public.th_cdt (ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, ctmt, thu_tu)
    select distinct on (x.ma_da) x.ma_da, x.ten_da, x.cdt, x.cdt2, x.kbnn, x.dac_thu, x.ctmt, e.ord::int
      from jsonb_array_elements(p_rows) with ordinality as e(j, ord)
      cross join lateral jsonb_to_record(e.j) as x(ma_da text, ten_da text, cdt text, cdt2 text, kbnn text, dac_thu text, ctmt text)
     where coalesce(x.ma_da,'') <> ''
     order by x.ma_da, e.ord;            -- trùng mã: giữ dòng đầu (như VLOOKUP)
  elsif p_loai in ('TT85','TT15') then
    delete from public.th_nguon where loai = p_loai;
    insert into public.th_nguon (loai, dong, ma_da, dia_diem, ten, so)
    select p_loai, (j->>'dong')::int, j->>'ma_da', j->>'dia_diem', j->>'ten', coalesce(j->'so','{}'::jsonb)
      from jsonb_array_elements(p_rows) j;
  else
    raise exception 'Loại không hợp lệ';
  end if;
  get diagnostics n = row_count;
  insert into public.th_nguon_file (loai, ten_file, ky_in, so_dong, tai_luc, tai_boi)
  values (p_loai, p_ten_file, p_ky_in, n, now(), v_ten)
  on conflict (loai) do update set ten_file = excluded.ten_file, ky_in = excluded.ky_in,
    so_dong = excluded.so_dong, tai_luc = excluded.tai_luc, tai_boi = excluded.tai_boi;
  return n;
end $$;
grant execute on function public.th_thay_nguon(text, jsonb, text, text) to authenticated;

-- ---------- Bổ sung: đối chiếu tổng số (số tổng của file hệ thống + KBNN của từng dòng) ----------
alter table public.th_nguon_file add column if not exists tong jsonb;
alter table public.th_nguon add column if not exists kb text;
drop function if exists public.th_thay_nguon(text, jsonb, text, text);
create or replace function public.th_thay_nguon(p_loai text, p_rows jsonb, p_ten_file text, p_ky_in text, p_tong jsonb default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_ten text;
begin
  if not public.th_sua() then raise exception 'Không có quyền cập nhật dữ liệu'; end if;
  select ho_ten into v_ten from public.profiles where id = auth.uid();
  if p_loai = 'CDT' then
    delete from public.th_cdt where true;
    insert into public.th_cdt (ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, ctmt, thu_tu)
    select distinct on (x.ma_da) x.ma_da, x.ten_da, x.cdt, x.cdt2, x.kbnn, x.dac_thu, x.ctmt, e.ord::int
      from jsonb_array_elements(p_rows) with ordinality as e(j, ord)
      cross join lateral jsonb_to_record(e.j) as x(ma_da text, ten_da text, cdt text, cdt2 text, kbnn text, dac_thu text, ctmt text)
     where coalesce(x.ma_da,'') <> ''
     order by x.ma_da, e.ord;
  elsif p_loai in ('TT85','TT15') then
    delete from public.th_nguon where loai = p_loai;
    insert into public.th_nguon (loai, dong, ma_da, dia_diem, kb, ten, so)
    select p_loai, (j->>'dong')::int, j->>'ma_da', j->>'dia_diem', j->>'kb', j->>'ten', coalesce(j->'so','{}'::jsonb)
      from jsonb_array_elements(p_rows) j;
  else
    raise exception 'Loại không hợp lệ';
  end if;
  get diagnostics n = row_count;
  insert into public.th_nguon_file (loai, ten_file, ky_in, so_dong, tai_luc, tai_boi, tong)
  values (p_loai, p_ten_file, p_ky_in, n, now(), v_ten, p_tong)
  on conflict (loai) do update set ten_file = excluded.ten_file, ky_in = excluded.ky_in,
    so_dong = excluded.so_dong, tai_luc = excluded.tai_luc, tai_boi = excluded.tai_boi, tong = excluded.tong;
  return n;
end $$;
grant execute on function public.th_thay_nguon(text, jsonb, text, text, jsonb) to authenticated;

-- ---------- Bổ sung: Danh mục dự án (Loại CT, đánh dấu sửa/thêm trên web) ----------
alter table public.th_cdt add column if not exists loai_ct text;
alter table public.th_cdt add column if not exists sua_tay boolean not null default false;
alter table public.th_cdt add column if not exists them_tay boolean not null default false;
alter table public.th_cdt add column if not exists cap_nhat_luc timestamptz;
alter table public.th_cdt add column if not exists cap_nhat_boi text;
-- Bản mới nhất của th_thay_nguon: giữ phân loại sửa tay + dự án thêm tay khi tải lại sheet CDT
create or replace function public.th_thay_nguon(p_loai text, p_rows jsonb, p_ten_file text, p_ky_in text, p_tong jsonb default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int; v_ten text;
begin
  if not public.th_sua() then raise exception 'Không có quyền cập nhật dữ liệu'; end if;
  select ho_ten into v_ten from public.profiles where id = auth.uid();
  if p_loai = 'CDT' then
    create temp table _cu on commit drop as
      select * from public.th_cdt where sua_tay or them_tay;
    delete from public.th_cdt where true;
    insert into public.th_cdt (ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, loai_ct, ctmt, thu_tu)
    select distinct on (x.ma_da) x.ma_da, x.ten_da, x.cdt, x.cdt2, x.kbnn, x.dac_thu, x.loai_ct, x.ctmt, e.ord::int
      from jsonb_array_elements(p_rows) with ordinality as e(j, ord)
      cross join lateral jsonb_to_record(e.j) as x(ma_da text, ten_da text, cdt text, cdt2 text, kbnn text, dac_thu text, loai_ct text, ctmt text)
     where coalesce(x.ma_da,'') <> ''
     order by x.ma_da, e.ord;
    get diagnostics n = row_count;
    update public.th_cdt t set dac_thu = o.dac_thu, loai_ct = o.loai_ct, ctmt = o.ctmt,
           sua_tay = true, cap_nhat_luc = o.cap_nhat_luc, cap_nhat_boi = o.cap_nhat_boi
      from _cu o where o.ma_da = t.ma_da and o.sua_tay;
    insert into public.th_cdt (ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, loai_ct, ctmt, thu_tu, sua_tay, them_tay, cap_nhat_luc, cap_nhat_boi)
    select o.ma_da, o.ten_da, o.cdt, o.cdt2, o.kbnn, o.dac_thu, o.loai_ct, o.ctmt, 999999, o.sua_tay, true, o.cap_nhat_luc, o.cap_nhat_boi
      from _cu o where o.them_tay and not exists (select 1 from public.th_cdt t where t.ma_da = o.ma_da);
  elsif p_loai in ('TT85','TT15') then
    delete from public.th_nguon where loai = p_loai;
    insert into public.th_nguon (loai, dong, ma_da, dia_diem, kb, ten, so)
    select p_loai, (j->>'dong')::int, j->>'ma_da', j->>'dia_diem', j->>'kb', j->>'ten', coalesce(j->'so','{}'::jsonb)
      from jsonb_array_elements(p_rows) j;
    get diagnostics n = row_count;
  else
    raise exception 'Loại không hợp lệ';
  end if;
  insert into public.th_nguon_file (loai, ten_file, ky_in, so_dong, tai_luc, tai_boi, tong)
  values (p_loai, p_ten_file, p_ky_in, n, now(), v_ten, p_tong)
  on conflict (loai) do update set ten_file = excluded.ten_file, ky_in = excluded.ky_in,
    so_dong = excluded.so_dong, tai_luc = excluded.tai_luc, tai_boi = excluded.tai_boi, tong = excluded.tong;
  return n;
end $$;

-- ---------- Bổ sung: tài khoản theo phòng cho trang tổng hợp ----------
--   TH_PGD = Phòng giao dịch (chỉ xem Danh mục dự án), TH_NV2 = Phòng Nghiệp vụ 2 (toàn quyền trang tổng hợp)
--   Hai vai trò này KHÔNG có quyền gì trong hệ thống CV 1953.
--   Tài khoản pgd / pnv2 đã tạo trên Supabase; mã đăng nhập để ở config.js (TONGHOP_PHONG).
alter table public.profiles drop constraint if exists profiles_vai_tro_check;
alter table public.profiles add constraint profiles_vai_tro_check check (vai_tro in
  ('ADMIN','CDT_NHAP','CDT_DUYET','KBNN_NHAN','KBNN_DUYET','STC_NHAN','STC_DUYET','XEM','TH_PGD','TH_NV2'));
create or replace function public.th_xem() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vai_tro() in ('ADMIN','KBNN_NHAN','KBNN_DUYET','XEM','TH_PGD','TH_NV2'), false)
$$;
create or replace function public.th_sua() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vai_tro() in ('ADMIN','KBNN_NHAN','KBNN_DUYET','TH_NV2'), false)
$$;
create or replace function public.ds_tai_khoan()
returns table (username text, ho_ten text, vai_tro text)
language sql stable security definer set search_path = public as $$
  select username, ho_ten, vai_tro from public.profiles where hoat_dong and vai_tro not like 'TH\_%' order by vai_tro, username
$$;

-- ---------- Bổ sung: Phòng giao dịch được sửa / thêm dự án trong Danh mục dự án ----------
create or replace function public.th_sua_dm() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.vai_tro() in ('ADMIN','KBNN_NHAN','KBNN_DUYET','TH_NV2','TH_PGD'), false)
$$;
drop policy if exists th_cdt_pgd_them on public.th_cdt;
drop policy if exists th_cdt_pgd_sua on public.th_cdt;
create policy th_cdt_pgd_them on public.th_cdt for insert to authenticated with check (public.th_sua_dm());
create policy th_cdt_pgd_sua on public.th_cdt for update to authenticated using (public.th_sua_dm()) with check (public.th_sua_dm());
-- Mật khẩu Phòng NV2 đặt trong Supabase → Authentication → Users (pnv2@bc1953.local)

-- ---------- Bổ sung: tải nhanh – toàn bộ dữ liệu trong 1 lần gọi, dạng mảng gọn ----------
create or replace function public.th_tai_du_lieu(p_co_nguon boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.th_xem() then raise exception 'Không có quyền xem dữ liệu'; end if;
  select jsonb_build_object(
    'cdt', coalesce((select jsonb_agg(jsonb_build_array(ma_da, ten_da, cdt, cdt2, kbnn, dac_thu, loai_ct, ctmt, thu_tu,
                       sua_tay, them_tay, cap_nhat_luc, cap_nhat_boi) order by thu_tu, ma_da) from public.th_cdt), '[]'::jsonb),
    'nguon', case when p_co_nguon then coalesce((
        select jsonb_agg(jsonb_build_array(n.loai, n.ma_da, n.dia_diem, n.kb, n.so,
                 case when c.ma_da is null then n.ten end) order by n.id)
          from public.th_nguon n left join public.th_cdt c on c.ma_da = n.ma_da), '[]'::jsonb) else '[]'::jsonb end
  ) into v;
  return v;
end $$;
grant execute on function public.th_tai_du_lieu(boolean) to authenticated;

-- ---------- Bổ sung: Dự án đã phát sinh số liệu nhưng chưa vào được báo cáo (để Phòng giao dịch hoàn thiện) ----------
create or replace function public.th_du_an_can_hoan_thien(p_ten_mau text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare kq jsonb;
begin
  if not public.th_xem() then raise exception 'Không có quyền xem dữ liệu'; end if;
  with mau as (select lower(trim(x)) t from unnest(p_ten_mau) x),
  kbten as (
    select e.key k, case when e.value->>'ten' ilike '%nghiệp vụ 2%' then 'Phòng Nghiệp vụ 2'
                   else regexp_replace(e.value->>'ten', '^.*PGD\s*số\s*', 'Phòng giao dịch số ') end ten
      from public.th_nguon_file f, jsonb_each(f.tong->'kb') e
     where f.loai in ('TT85','TT15')),
  kbten1 as (select k, max(ten) ten from kbten group by k),
  ng as (
    select n.ma_da, max(n.ten) ten, max(coalesce(nullif(n.dia_diem, ''), n.kb)) kb,
           bool_or(n.loai = 'TT85') co85, bool_or(n.loai = 'TT15') co15,
           sum(case when n.loai = 'TT85' then coalesce((n.so->>'J')::numeric,0) + coalesce((n.so->>'P')::numeric,0) else 0 end) khv85,
           sum(case when n.loai = 'TT15' then coalesce((n.so->>'F')::numeric,0) + coalesce((n.so->>'H')::numeric,0) else 0 end) khv15,
           sum(case when n.loai = 'TT85' then coalesce((n.so->>'L')::numeric,0) + coalesce((n.so->>'M')::numeric,0)
                                             + coalesce((n.so->>'R')::numeric,0) + coalesce((n.so->>'S')::numeric,0) else 0 end) gn85,
           sum(case when n.loai = 'TT15' then coalesce((n.so->>'K')::numeric,0) + coalesce((n.so->>'L')::numeric,0)
                                             + coalesce((n.so->>'N')::numeric,0) + coalesce((n.so->>'O')::numeric,0) else 0 end) gn15
      from public.th_nguon n group by n.ma_da)
  select coalesce(jsonb_agg(jsonb_build_object(
           'ma_da', ng.ma_da, 'ten', coalesce(nullif(c.ten_da, ''), regexp_replace(ng.ten, '^\s*' || ng.ma_da || '\s*-\s*', '')),
           'loi', case when c.ma_da is null then 'CHUA_CO' else 'CDT_SAI' end,
           'cdt', c.cdt, 'cdt2', c.cdt2, 'kbnn', coalesce(nullif(c.kbnn, ''), kt.ten), 'kb', ng.kb,
           'co85', ng.co85, 'co15', ng.co15, 'khv', greatest(ng.khv85, ng.khv15), 'gn', greatest(ng.gn85, ng.gn15))
         order by (c.ma_da is null) desc, greatest(ng.gn85, ng.gn15) desc), '[]'::jsonb)
    into kq
    from ng
    left join public.th_cdt c on c.ma_da = ng.ma_da
    left join kbten1 kt on kt.k = ng.kb
   where (ng.gn85 <> 0 or ng.gn15 <> 0 or ng.khv85 <> 0 or ng.khv15 <> 0)
     and (c.ma_da is null
          or lower(trim(coalesce(c.cdt2, ''))) not in (select t from mau)
          or lower(trim(coalesce(c.cdt, ''))) not in (select t from mau));
  return kq;
end $$;
grant execute on function public.th_du_an_can_hoan_thien(text[]) to authenticated;

-- ---------- Bổ sung: Ghi chú theo dòng chủ đầu tư (báo cáo + bảng so sánh) ----------
create table if not exists public.th_ghi_chu (
  bao_cao  text not null check (bao_cao in ('TT15','TT85','THANG','SS')),
  dong     int  not null,
  ten_dong text,
  noi_dung text,
  cap_nhat_boi text,
  cap_nhat_luc timestamptz not null default now(),
  primary key (bao_cao, dong)
);
alter table public.th_ghi_chu enable row level security;
drop policy if exists th_ghi_chu_xem on public.th_ghi_chu;
drop policy if exists th_ghi_chu_sua on public.th_ghi_chu;
create policy th_ghi_chu_xem on public.th_ghi_chu for select to authenticated using (public.th_xem());
create policy th_ghi_chu_sua on public.th_ghi_chu for all to authenticated using (public.th_sua_dm()) with check (public.th_sua_dm());

-- ---------- Bổ sung: cột CTMTQG giai đoạn 2026-2030 (ctmt = giai đoạn 2021-2025) ----------
alter table public.th_cdt add column if not exists ctmt_2630 text;
-- th_tai_du_lieu trả thêm phần tử thứ 14 = ctmt_2630; th_thay_nguon đọc ctmt_2630 (nếu sheet CDT có cột tiêu đề "…2026-2030")
-- và giữ giá trị đã nhập trên web khi tải lại sheet CDT. Xem migration "tonghop_ctmt_2026_2030" trên Supabase.
