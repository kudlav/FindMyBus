import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jakubhlavacek.gtfsrealtimemap',
  appName: 'FindMyBus',
  webDir: 'build',
  plugins: {
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
