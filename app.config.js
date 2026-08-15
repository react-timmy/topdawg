// app.config.js
export default ({ config }) => ({
  ...config,
  name: "FilmSort",
  slug: "filmsort",
  scheme: "filmsort",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  updates: {
    url: "https://u.expo.dev/d9ce499e-9bc0-48a6-8fa2-f19bd6c7b0b4"
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#000000",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.filmsorter.filmsort",
    googleServicesFile: "./GoogleService-Info.plist",
  },
  android: {
    // Uses EAS file secret during cloud builds, falls back to local file in dev
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#000000",
    },
    package: "app.filmsorter.filmsort",
    permissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "@react-native-google-signin/google-signin",
    "@react-native-firebase/app",
    "expo-video",
    [
      "react-native-google-cast",
      {
        // Receiver app ID — use the default media receiver for now.
        // Replace with your custom receiver ID once you publish one.
        receiverAppID: "CC1AD845",
        // iOS: request local-network permission for Cast device discovery
        startDiscoveryAfterFirstTapOnCastButton: false,
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Allow FilmSort to scan your local videos and build your media library.",
        savePhotosPermission: "Allow FilmSort to save media when you choose to export or import files.",
        granularPermissions: ["video"],
      },
    ],
    "expo-font",
    "expo-file-system",
    "expo-screen-orientation",
  ],
  extra: {
    eas: {
      projectId: "d9ce499e-9bc0-48a6-8fa2-f19bd6c7b0b4",
    },
    // Proxy base URL — the ONLY runtime value the app needs.
    // Real keys (TMDB, Gemini) live in Cloudflare Worker Secrets, never here.
    // Format: https://filmsort-proxy.<your-subdomain>.workers.dev
    // Set EXPO_PUBLIC_PROXY_BASE_URL in .env after deploying the worker.
    proxyBaseUrl: process.env.EXPO_PUBLIC_PROXY_BASE_URL ?? "",
  },
  owner: "solodevtimmys-team",
});
