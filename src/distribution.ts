export interface DistributionIdentity {
  name: string;
  productName: string;
  binaryName: string;
  identifier: string;
  publisher: string;
  website: string;
  supportUrl: string;
  dataDirectory: string;
}

export interface DistributionBranding {
  logo: string | null;
  icon: string | null;
  primaryColor: string | null;
  uiStyle: string | null;
  documentTheme: string | null;
}

export interface DistributionRuntime {
  schemaVersion: number;
  kind: "official" | "organization";
  id: string;
  identity: DistributionIdentity;
  branding: DistributionBranding;
  defaults: {
    language: string;
    uiMode: string;
    documentTheme: string;
    checkForUpdates: boolean;
  };
  legal: {
    copyright: string | null;
    upstreamLicense: string;
    distributionLicense: string | null;
    notice: Record<string, string | null>;
  };
  updates: {
    manifestUrl: string | null;
    releasePrefix: string | null;
    releasePage: string | null;
  };
  onboarding: {
    mode: string;
    guide: Record<string, string | null>;
    fallbackLocale: string;
    title: Record<string, string>;
  };
  resources?: Record<string, unknown>;
}

declare const __NOTA_DISTRIBUTION__: DistributionRuntime | undefined;

const officialFallback: DistributionRuntime = {
  schemaVersion: 1,
  kind: "official",
  id: "official",
  identity: {
    name: "Nota",
    productName: "Nota",
    binaryName: "nota",
    identifier: "io.github.nota.Nota",
    publisher: "Leo Lee",
    website: "https://nota-md.github.io/",
    supportUrl: "https://github.com/Nota-MD/Nota/issues",
    dataDirectory: "nota",
  },
  branding: {
    logo: null,
    icon: null,
    primaryColor: "#0f62fe",
    uiStyle: "adwaita",
    documentTheme: null,
  },
  defaults: {
    language: "auto",
    uiMode: "auto",
    documentTheme: "",
    checkForUpdates: false,
  },
  legal: {
    copyright: null,
    upstreamLicense: "LICENSE",
    distributionLicense: null,
    notice: {},
  },
  updates: {
    manifestUrl: "https://github.com/Nota-MD/Nota/releases/latest/download/latest.json",
    releasePrefix: "https://github.com/Nota-MD/Nota/releases/download/",
    releasePage: "https://github.com/Nota-MD/Nota/releases",
  },
  onboarding: {
    mode: "default",
    guide: {},
    fallbackLocale: "en",
    title: {},
  },
};

export const distribution: DistributionRuntime =
  typeof __NOTA_DISTRIBUTION__ === "undefined" ? officialFallback : __NOTA_DISTRIBUTION__;

export function distributionName(): string {
  return distribution.identity.productName;
}
