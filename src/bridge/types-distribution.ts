export interface DistributionOnboarding {
  mode: "default" | "before-default" | "after-default" | "replace-welcome" | "disabled";
  locale: string;
  title: string | null;
  html: string | null;
}

export interface DistributionLegal {
  locale: string;
  copyright: string | null;
  distribution_license: string | null;
  notice: string | null;
}

export interface DistributionBranding {
  logo_svg: string | null;
  primary_color: string | null;
}
