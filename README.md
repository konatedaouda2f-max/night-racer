# Night Racer

Night Racer is a mobile-friendly racing game for the web and Android.

## Run on Android

Install Node.js 22+ and Android Studio with the Android SDK, then run:

```sh
npm install
npm run android:add
npm run android:sync
npm run android:open
```

In Android Studio, select an emulator or connected Android phone and press **Run**.

To prepare a Play Store release, use **Build > Generate Signed Bundle / APK** in Android Studio and choose **Android App Bundle**. Create and keep the upload key in a safe place; never commit it or share its passwords. Google Play requires a signed release bundle.

## Automated Android build

The **Build Night Racer for Android** GitHub Actions workflow creates a debug APK and an unsigned release bundle. Download them from the workflow run's artifacts. The unsigned bundle is for testing only; sign the release bundle with your private upload key before submitting it to Google Play.

## Privacy

The game's privacy policy is available at [`public/privacy.html`](public/privacy.html). Progress and settings are stored locally on the device.
