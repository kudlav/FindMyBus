import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.kudlav.gtfsrealtimemap',
  appName: 'FindMyBus',
  webDir: 'build',
  overrideUserAgent: 'findmybus-app',
  plugins: {
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
