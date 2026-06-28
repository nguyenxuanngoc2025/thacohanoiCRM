import {
  Megaphone, Globe, MessageCircle, Search, Music2, Phone, Mail, MessagesSquare, Store,
} from 'lucide-react';
import type { ElementType } from 'react';

export type ConnectorState = 'active' | 'soon';

export interface Platform {
  key: string;
  name: string;
  desc: string;
  icon: ElementType;
  color: string;
  state: ConnectorState;
  /** Đơn vị đăng ký (trang / biểu mẫu / OA…) */
  unit: string;
  /** Kênh digital (online) — true thì hiện trong danh mục Nguồn của form thêm lead. */
  digital: boolean;
}

/**
 * Danh mục kênh / nguồn lead dùng CHUNG cho:
 * - Settings → Tích hợp & Nguồn lead (IntegrationsCatalog)
 * - Form thêm lead thủ công (chỉ lấy các kênh digital)
 * Thêm/bớt nguồn = sửa danh mục này tại một chỗ duy nhất.
 */
export const PLATFORMS: Platform[] = [
  { key: 'facebook', name: 'Facebook',          desc: 'Lead Ads · Messenger · bình luận',     icon: Megaphone,      color: '#1877F2', state: 'active', unit: 'fanpage',  digital: true },
  { key: 'website',  name: 'Website form',       desc: 'Form trên web · landing page',         icon: Globe,          color: '#004B9B', state: 'active', unit: 'biểu mẫu', digital: true },
  { key: 'zalo',     name: 'Zalo OA',            desc: 'Tin nhắn OA · quảng cáo Zalo Lead',    icon: MessageCircle,  color: '#0068FF', state: 'active', unit: 'OA',       digital: true },
  { key: 'google',   name: 'Google form / Ads',  desc: 'Lead form Google Ads · Google Form',   icon: Search,         color: '#EA4335', state: 'soon',   unit: 'form',     digital: true },
  { key: 'tiktok',   name: 'TikTok Lead',        desc: 'TikTok Lead Generation',               icon: Music2,         color: '#010101', state: 'soon',   unit: 'form',     digital: true },
  { key: 'email',    name: 'Email',              desc: 'Hộp thư thu lead',                     icon: Mail,           color: '#0EA5E9', state: 'soon',   unit: 'hộp thư',  digital: true },
  { key: 'livechat', name: 'Live chat',          desc: 'Chat trực tuyến trên web',             icon: MessagesSquare, color: '#8B5CF6', state: 'soon',   unit: 'widget',   digital: true },
  { key: 'hotline',  name: 'Hotline / Tổng đài', desc: 'Cuộc gọi đến · ghi nhận lead',         icon: Phone,          color: '#16a34a', state: 'soon',   unit: 'số',       digital: false },
  { key: 'walkin',   name: 'Khách tới showroom', desc: 'Khách vãng lai · ghi nhận tại quầy',   icon: Store,          color: '#F59E0B', state: 'soon',   unit: 'điểm',     digital: false },
];

/** Tên các kênh digital — dùng làm danh mục "Nguồn" cho form thêm lead thủ công. */
export const DIGITAL_SOURCES = PLATFORMS.filter((p) => p.digital).map((p) => p.name);

export const DEFAULT_SOURCE = DIGITAL_SOURCES[0];

/** Kênh digital dạng {key, name} — form thêm lead chọn theo key để map sang phân nhánh. */
export const DIGITAL_PLATFORMS = PLATFORMS.filter((p) => p.digital).map((p) => ({ key: p.key, name: p.name }));

export const DEFAULT_PLATFORM_KEY = DIGITAL_PLATFORMS[0].key;
