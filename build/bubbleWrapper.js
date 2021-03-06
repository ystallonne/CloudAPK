"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const TwaGenerator_1 = require("@bubblewrap/core/dist/lib/TwaGenerator");
const TwaManifest_1 = require("@bubblewrap/core/dist/lib/TwaManifest");
const util_1 = require("@bubblewrap/core/dist/lib/util");
const Config_1 = require("@bubblewrap/core/dist/lib/Config");
const AndroidSdkTools_1 = require("@bubblewrap/core/dist/lib/androidSdk/AndroidSdkTools");
const JdkHelper_1 = require("@bubblewrap/core/dist/lib/jdk/JdkHelper");
const GradleWrapper_1 = require("@bubblewrap/core/dist/lib/GradleWrapper");
const fs_extra_1 = __importDefault(require("fs-extra"));
const constants_1 = __importDefault(require("../constants"));
const KeyTool_1 = require("@bubblewrap/core/dist/lib/jdk/KeyTool");
/*
 * Wraps Google's bubblewrap to build a signed APK from a PWA.
 * https://github.com/GoogleChromeLabs/bubblewrap/tree/master/packages/core
 */
class BubbleWrapper {
    /**
     *
     * @param pwaSettings The settings for the PWA.
     * @param projectDirectory The directory where to generate the project files and signed APK.
     * @param signingKeyInfo Information about the signing key.
     * @param jdkPath The path to the JDK.
     * @param androidToolsPath The path to the Android Build tooks.
     */
    constructor(pwaSettings, projectDirectory, signingKeyInfo) {
        this.pwaSettings = pwaSettings;
        this.projectDirectory = projectDirectory;
        this.signingKeyInfo = signingKeyInfo;
        this.javaConfig = new Config_1.Config(constants_1.default.JDK_PATH, constants_1.default.ANDROID_TOOLS_PATH);
        this.jdkHelper = new JdkHelper_1.JdkHelper(process, this.javaConfig);
        this.androidSdkTools = new AndroidSdkTools_1.AndroidSdkTools(process, this.javaConfig, this.jdkHelper);
    }
    /**
     * Generates a signed APK from the PWA.
     */
    async generateApk() {
        const unsignedApkPath = await this.generateUnsignedApk();
        const signedApkPath = await this.signApk(unsignedApkPath);
        return signedApkPath;
    }
    /**
     * Generates an unsigned APK from the PWA.
     */
    async generateUnsignedApk() {
        await this.generateTwaProject();
        const apkPath = await this.buildApk();
        const optimizedApkPath = await this.optimizeApk(apkPath);
        return optimizedApkPath;
    }
    async generateTwaProject() {
        const twaGenerator = new TwaGenerator_1.TwaGenerator();
        const twaManifestJson = this.createManifestSettings(this.pwaSettings, this.signingKeyInfo);
        const twaManifest = new TwaManifest_1.TwaManifest(twaManifestJson);
        twaManifest.generatorApp = "PWABuilder";
        await twaGenerator.createTwaProject(this.projectDirectory, twaManifest);
        return twaManifest;
    }
    async createSigningKey() {
        // Delete existing signing key.
        if (fs_extra_1.default.existsSync(this.signingKeyInfo.keyStorePath)) {
            await fs_extra_1.default.promises.unlink(this.signingKeyInfo.keyStorePath);
        }
        const keyTool = new KeyTool_1.KeyTool(this.jdkHelper);
        const overwriteExisting = true;
        const keyOptions = {
            path: this.signingKeyInfo.keyStorePath,
            password: this.signingKeyInfo.keyStorePassword,
            keypassword: this.signingKeyInfo.keyPassword,
            alias: this.signingKeyInfo.keyAlias,
            fullName: this.signingKeyInfo.firstAndLastName,
            organization: this.signingKeyInfo.organization,
            organizationalUnit: this.signingKeyInfo.organizationalUnit,
            country: this.signingKeyInfo.countryCode
        };
        await keyTool.createSigningKey(keyOptions, overwriteExisting);
    }
    async buildApk() {
        const gradleWrapper = new GradleWrapper_1.GradleWrapper(process, this.androidSdkTools, this.projectDirectory);
        await gradleWrapper.assembleRelease();
        return `${this.projectDirectory}/app/build/outputs/apk/release/app-release-unsigned.apk`;
    }
    async optimizeApk(apkFilePath) {
        console.log("Optimizing the APK...");
        const optimizedApkPath = `${this.projectDirectory}/app-release-unsigned-aligned.apk`;
        await this.androidSdkTools.zipalign(apkFilePath, // input file
        optimizedApkPath);
        return optimizedApkPath;
    }
    async signApk(apkFilePath) {
        await this.createSigningKey();
        const outputFile = `${this.projectDirectory}/app-release-signed.apk`;
        console.log("Signing the APK...");
        await this.androidSdkTools.apksigner(this.signingKeyInfo.keyStorePath, this.signingKeyInfo.keyStorePassword, this.signingKeyInfo.keyAlias, this.signingKeyInfo.keyPassword, apkFilePath, outputFile);
        return outputFile;
    }
    createManifestSettings(pwaSettings, signingKeyInfo) {
        // Bubblewrap expects a TwaManifestJson object.
        // We create one using our settings and signing key.
        const signingKey = {
            path: signingKeyInfo.keyStorePath,
            alias: signingKeyInfo.keyAlias
        };
        const manifestJson = {
            ...pwaSettings,
            shortcuts: this.createShortcuts(pwaSettings.shortcuts, pwaSettings.webManifestUrl),
            signingKey: signingKey
        };
        return manifestJson;
    }
    createShortcuts(shortcutsJson, manifestUrl) {
        if (!manifestUrl) {
            console.warn("Skipping app shortcuts due to empty manifest URL", manifestUrl);
            return [];
        }
        const maxShortcuts = 4;
        return shortcutsJson
            .filter(s => this.isValidShortcut(s))
            .map(s => this.createShortcut(s, manifestUrl))
            .slice(0, 4);
    }
    createShortcut(shortcut, manifestUrl) {
        const shortNameMaxSize = 12;
        const name = shortcut.name || shortcut.short_name;
        const shortName = shortcut.short_name || shortcut.name.substring(0, shortNameMaxSize);
        const url = new URL(shortcut.url, manifestUrl).toString();
        const suitableIcon = util_1.findSuitableIcon(shortcut.icons, "any");
        const iconUrl = new URL(suitableIcon.src, manifestUrl).toString();
        return new TwaManifest_1.ShortcutInfo(name, shortName, url, iconUrl);
    }
    isValidShortcut(shortcut) {
        if (!shortcut) {
            console.warn("Shortcut is invalid due to being null or undefined", shortcut);
            return false;
        }
        if (!shortcut.icons) {
            console.warn("Shorcut is invalid due to not having any icons specified", shortcut);
            return false;
        }
        if (!shortcut.url) {
            console.warn("Shortcut is invalid due to not having a URL", shortcut);
            return false;
        }
        if (!shortcut.name && !shortcut.short_name) {
            console.warn("Shortcut is invalid due to having neither a name nor short_name", shortcut);
            return false;
        }
        if (!util_1.findSuitableIcon(shortcut.icons, 'any')) {
            console.warn("Shortcut is invalid due to not finding a suitable icon", shortcut.icons);
            return false;
        }
        return true;
    }
}
exports.BubbleWrapper = BubbleWrapper;
//# sourceMappingURL=bubbleWrapper.js.map