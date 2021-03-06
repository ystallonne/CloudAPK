# Next steps for getting your PWA into the Google Play Store
You've successfully generated an Google Play app package (.apk) for your PWA. This app package can be submitted to Google Play Store.

## Digital Asset Links

To validate that you own your PWA's domain, you'll need to deploy a Digital Asset Links file to your server. The [TWA Quick Start Guide](https://developers.google.com/web/updates/2019/08/twas-quickstart#creating-your-asset-link-file) explains how.

**Digital asset links are required for your PWA to load without the browser address bar**. If you're seeing a browser address bar in your app on Android, you likely forgot to generate your digital asset links file.

## Submitting your APK

The zip file generated by this tool contains a signed APK. This APK can be submitted directly to the Play Store through the [Google Play Console](https://developer.android.com/distribute/console).

## Save your signing key

This tool will create a signing key for you; it's included in the zip file. If you need to resumbit your app in the future, you'll need to sign it with this same key, so be sure to keep it in a safe place. You can read more [here](https://developer.android.com/studio/publish/app-signing#opt-out) about securing your key and opting into App Signing by Google Play. We strongly recommend using App Signing By Google Play as this lessens the risk of losing your signing key.