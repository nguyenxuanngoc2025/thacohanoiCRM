# zca-bot — cầu nối gửi thông báo Zalo cho CRM Thaco Auto

Gửi thông báo vận hành (lead mới, nhắc quá hạn, báo cáo) vào các nhóm Zalo của
showroom + nhóm BLĐ, bằng 1 tài khoản Zalo "bot" do doanh nghiệp sở hữu.

## Cài trên VPS (145.79.8.92)
1. `mkdir -p /opt/zca-bot && cd /opt/zca-bot` rồi copy index.mjs + package.json.
2. `cp .env.example .env` và điền SUPABASE_SERVICE_ROLE_KEY (lấy từ .env.master).
3. `npm install`
4. Lần đầu chạy tay để quét QR: `node index.mjs` → lưu mã QR ra file `qr.png`
   (đường dẫn đổi bằng env `ZALO_QR_PATH`). Tải `qr.png` về máy (scp) mở ra, dùng
   app Zalo của tài khoản bot → Quét QR. Xong cred lưu ở `zalo-cred.json`, Ctrl-C dừng,
   rồi bật service. (Trên SSH không màn hình: `scp crm... :/opt/zca-bot/qr.png .`)
5. Cài service: `cp zca-bot.service /etc/systemd/system/ && systemctl daemon-reload`
   `systemctl enable --now zca-bot` → `journalctl -u zca-bot -f` để xem log.

## Khi rớt phiên (log báo cred hỏng / không gửi được)
- Xoá `zalo-cred.json`, `systemctl restart zca-bot`, xem log lấy QR, quét lại.

## Lấy group_id
1. Đăng nhập bot (quét QR, có `zalo-cred.json`).
2. Dùng app Zalo của tài khoản bot vào TỪNG nhóm (bot phải là thành viên).
3. `node list-groups.mjs` → in `group_id  <tab>  tên nhóm` từng nhóm.
4. Dán group_id vào trang Cài đặt > Kênh thông báo (ô "Đích gửi") cho đúng nhóm.

## Cron (systemd timer)
1. Tạo `/opt/zca-bot/.cron.env` chứa `CRON_SECRET=...` (khớp env CRM trên Hostinger).
2. Sửa `<DOMAIN_CRM>` trong cron-reminders.service thành domain CRM thật.
3. `cp cron-reminders.* /etc/systemd/system/ && systemctl daemon-reload`
   `systemctl enable --now cron-reminders.timer` → `systemctl list-timers | grep reminders`.

## Cron báo cáo ngày
- `cp cron-daily-report.* /etc/systemd/system/ && systemctl daemon-reload`
  `systemctl enable --now cron-daily-report.timer`. Đổi `<DOMAIN_CRM>` như trên.
