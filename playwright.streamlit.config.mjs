import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  testMatch: /streamlit-bridge\.spec\.mjs/,
  workers: 1,
  timeout: 120_000,
  use: { viewport: {width: 1400, height: 1000}, headless: true },
  webServer: {
    command: "python -m streamlit run streamlit_app.py --server.headless=true --server.port=8501",
    url: "http://127.0.0.1:8501/_stcore/health",
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
