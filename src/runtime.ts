export const standalone = typeof window !== "undefined" &&
  (window as Window & { fieldtripStandalone?: boolean }).fieldtripStandalone === true;
