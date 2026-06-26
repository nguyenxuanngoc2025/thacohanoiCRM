export interface PlatformBrand {
  id: string;
  name: string;
  slug: string;
}

export interface PlatformCompany {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  custom_domain: string | null;
  plan_status: string;
  max_showrooms: number;
  showroom_used: number;
  user_count: number;
  brand_ids: string[];
}
