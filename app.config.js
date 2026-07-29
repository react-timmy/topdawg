// app.config.js
export default ({ config }) => ({
  ...config,
  name: "FilmSort",
  slug: "filmsort",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#000000",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "app.filmsorter.filmsort",
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
      "expo-media-library",
      {
        photosPermission: "Allow FilmSort to scan your local videos and build your media library.",
        savePhotosPermission: "Allow FilmSort to save media when you choose to export or import files.",
        granularPermissions: ["video"],
      },
    ],
    "expo-font",
    "expo-screen-orientation",
  ],
  extra: {
    eas: {
      projectId: "3a0b553f-3175-4b67-999b-8c95abf703dd",
    },
    tmdbApiKey: process.env.TMDB_API_KEY ?? "25f581e42a744b10a56e5d443cac2300",
    geminiApiKey: process.env.GEMINI_API_KEY ?? "AQ.Ab8RN6ImSaSrCS_WWAewNQzuBK1ytQA9mWLMjmNLigxY4z-Fag",
  },
  owner: "solotimmy",
});
