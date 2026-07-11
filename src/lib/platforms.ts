import {
  Megaphone, Globe, MessageCircle, Search, Music2, PhoneCall,
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
  { key: 'website',  name: 'Website form',       desc: 'Form trên web · landing page',         icon: Globe,          color: 'var(--color-brand)', state: 'active', unit: 'biểu mẫu', digital: true },
  { key: 'zalo',     name: 'Zalo OA',            desc: 'Tin nhắn OA · quảng cáo Zalo Lead',    icon: MessageCircle,  color: '#0068FF', state: 'active', unit: 'OA',       digital: true },
  { key: 'google_sheet', name: 'Google Sheet',     desc: 'Hút lead từ Google Sheet agency chia sẻ', icon: Search,         color: '#0F9D58', state: 'active', unit: 'sheet',    digital: true },
  { key: 'google',   name: 'Google (gọi hotline)', desc: 'Khách tìm qua Google rồi gọi hotline',  icon: PhoneCall,      color: '#EA4335', state: 'active', unit: 'cuộc gọi', digital: true },
  { key: 'tiktok',   name: 'TikTok Lead',        desc: 'TikTok Lead Generation',               icon: Music2,         color: '#010101', state: 'soon',   unit: 'form',     digital: true },
];

/** Kênh digital dạng {key, name} — form thêm lead chọn theo key để map sang phân nhánh. */
export const DIGITAL_PLATFORMS = PLATFORMS.filter((p) => p.digital).map((p) => ({ key: p.key, name: p.name }));

export const DEFAULT_PLATFORM_KEY = DIGITAL_PLATFORMS[0].key;
