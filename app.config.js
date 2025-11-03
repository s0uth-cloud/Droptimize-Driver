import "dotenv/config";

export default {
  expo: {
    name: "Droptimize",
    slug: "droptimize",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "droptimize",
    userInterfaceStyle: "automatic",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.droptimize.app",
    },

    android: {
      package: "com.droptimize.app",
      adaptiveIcon: {
        foregroundImage: "./assets/images/icon.png",
        backgroundColor: "#ffffff",
      },
      edgeToEdgeEnabled: true,
      permissions: [
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },

    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },

    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      "expo-asset",
      [
        "expo-font",
        {
          "fonts": [
            "./assets/fonts/LEMONMILK-Bold.otf",
            "./assets/fonts/Lexend-Regular.ttf",
            "./assets/fonts/Lexend-Medium.ttf",
            "./assets/fonts/Lexend-Bold.ttf"
          ]
        },
      ],
      "expo-web-browser",
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to access your location.",
          locationWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to access your location.",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission: "Allow $(PRODUCT_NAME) to access your photos.",
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera.",
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to access your camera.",
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      router: {},
      eas: {
        projectId: "44978017-980f-4cee-b096-ec7d5f985263",
      },
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      firebase: {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
      },
    },

    owner: "nagum0",
  },
};