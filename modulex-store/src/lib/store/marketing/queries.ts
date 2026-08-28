import { cache } from "react";
import { callPublicRpc } from "@/lib/supabase/public-rest";

export type StoreMarketingSettings = {
  trackingEnabled: boolean;
  consentBannerEnabled: boolean;
  respectDoNotTrack: boolean;
  googleTagManagerId: string | null;
  googleAnalyticsMeasurementId: string | null;
  consentTitle: string;
  consentDescription: string;
  acceptAllLabel: string;
  rejectOptionalLabel: string;
  manageChoicesLabel: string;
  saveChoicesLabel: string;
  privacyPolicyHref: string | null;
  updatedAt: string | null;
};

type StoreMarketingSettingsRpc = {
  tracking_enabled: boolean;
  consent_banner_enabled: boolean;
  respect_do_not_track: boolean;
  google_tag_manager_id: string | null;
  google_analytics_measurement_id: string | null;
  consent_title: string;
  consent_description: string;
  accept_all_label: string;
  reject_optional_label: string;
  manage_choices_label: string;
  save_choices_label: string;
  privacy_policy_href: string | null;
  updated_at: string | null;
};

export const getStoreMarketingSettings = cache(async (): Promise<StoreMarketingSettings | null> => {
  const row = await callPublicRpc<StoreMarketingSettingsRpc | null>(
    "get_store_marketing_settings",
    {},
    { revalidate: 300 }
  );

  if (!row) return null;

  return {
    trackingEnabled: row.tracking_enabled,
    consentBannerEnabled: row.consent_banner_enabled,
    respectDoNotTrack: row.respect_do_not_track,
    googleTagManagerId: row.google_tag_manager_id,
    googleAnalyticsMeasurementId: row.google_analytics_measurement_id,
    consentTitle: row.consent_title,
    consentDescription: row.consent_description,
    acceptAllLabel: row.accept_all_label,
    rejectOptionalLabel: row.reject_optional_label,
    manageChoicesLabel: row.manage_choices_label,
    saveChoicesLabel: row.save_choices_label,
    privacyPolicyHref: row.privacy_policy_href,
    updatedAt: row.updated_at,
  };
});
