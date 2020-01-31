import { Request } from "express";
import express from "express";
import { LlamaPackWrapper } from "../build/llamaPackWrapper";
import { PwaSettings } from "../build/pwaSettings";
import { tmpdir } from "os";
import path from "path";
import passwordGenerator from "generate-password";
import tmp from "tmp";
import archiver from "archiver";
import fs from "fs-extra";

const router = express.Router();

/**
 * Generates and sends back a signed .apk. Expects a POST body containing @see PwaSettings object.
 */
router.post("/generateSignedApk", async function (request: express.Request, response: express.Response) {
  const pwaSettings: PwaSettings = request.body;
  const validationErrors = validateSettings(pwaSettings);
  if (validationErrors.length > 0) {
    response.status(500).send("Invalid PWA settings: " + validationErrors.join(", "));
    return;
  }

  try {
    const { apkPath, signingInfo } = await createSignedApk(pwaSettings);
    response.sendFile(apkPath);
    console.log("Process completed successfully.");
  } catch (err) {
    console.log("Error generating signed APK", err);
    response.status(500).send("Error generating signed APK: " + err);
  }
});

/**
 * Generates a signed .apk and zips it up along with the signing key info. Sends back the zip file. Expects a POST body containing @see PwaSettings object.
 */
router.post("/generateSignedApkZip", async function (request: express.Request, response: express.Response) {
  const pwaSettings: PwaSettings = request.body;
  const validationErrors = validateSettings(pwaSettings);
  if (validationErrors.length > 0) {
    response.status(500).send("Invalid PWA settings: " + validationErrors.join(", "));
    return;
  }

  try {
    const { apkPath, signingInfo } = await createSignedApk(pwaSettings);

    // Zip up the APK, signing key, and readme.txt
    const zipFile = await zipApkAndKey(apkPath, pwaSettings, signingInfo);

    if (zipFile) {
      response.sendFile(zipFile);
    }
    console.log("Process completed successfully.");
  } catch (err) {
    console.log("Error generating signed APK", err);
    response.status(500).send("Error generating signed APK: " + err);
  }
});

function validateSettings(settings?: PwaSettings): string[] {
  if (!settings) {
    return ["No settings supplied"];
  }

  const requiredFields: Array<keyof PwaSettings> = ["name", "host", "packageId", "iconUrl", "startUrl", "signingInfo", "appVersion"];
  return requiredFields
    .filter(f => !settings[f])
    .map(f => `${f} is required`);
}

async function createSignedApk(pwaSettings: PwaSettings): Promise<{ apkPath: string, signingInfo: SigningKeyInfo }> {
  tmp.setGracefulCleanup();
  let projectDir: tmp.DirResult | null = null;
  try {
    projectDir = tmp.dirSync({ prefix: "pwabuilder-cloudapk-" });
    const projectDirPath = projectDir.name;

    // For now, we generate a signing key on behalf of the user. 
    // In the future, we may allow the user to pass in an existing key.
    const signingInfo = createSigningKeyInfo(projectDirPath, pwaSettings);

    // Generate the signed APK.
    const llama = new LlamaPackWrapper(pwaSettings, projectDirPath, signingInfo);
    const apkPath = await llama.generateApk();
    return {
      apkPath,
      signingInfo
    };
  } finally {
    // Cleanup after ourselves.
    projectDir?.removeCallback();
  }
}

function createSigningKeyInfo(projectDirectory: string, pwaSettings: PwaSettings): SigningKeyInfo {
  return {
    keyStorePath: path.join(projectDirectory, "my-signing-key.keystore"),
    keyStorePassword: passwordGenerator.generate({ length: 12, numbers: true }),
    keyAlias: "my-key-alias",
    keyPassword: passwordGenerator.generate({ length: 12, numbers: true }),
    firstAndLastName: pwaSettings.signingInfo.fullName,
    organization: pwaSettings.signingInfo.organization,
    organizationalUnit: pwaSettings.signingInfo.organizationalUnit,
    countryCode: pwaSettings.signingInfo.countryCode
  }
}

/***
 * Creates a zip file containing the signed APK, key store and key store passwords.
 */
async function zipApkAndKey(signedApkPath: string, pwaSettings: PwaSettings, signingKey: SigningKeyInfo): Promise<string | void> {
  console.log("Zipping signed APK and key info...");
  const apkName = `${pwaSettings.name}-signed.apk`;

  return new Promise((resolve, reject) => {
    try {
      const archive = archiver('zip', {
        zlib: { level: 9 } // Sets the compression level.
      });

      const filename = tmp.tmpNameSync({
        prefix: "pwabuilder-cloudapk-",
        postfix: ".zip"
      });
      const output = fs.createWriteStream(filename);

      archive.pipe(output);

      archive.file(signedApkPath, { name: apkName });
      archive.file(signingKey.keyStorePath, { name: "signing-keystore.keystore" });
      archive.file("./Next-steps.md", { name: "Next-steps.md" });

      archive.append(signingKey.keyStorePassword, { name: "key-store-password.txt" });
      archive.append(signingKey.keyPassword, { name: "key-password.txt" });
      archive.append(signingKey.keyAlias, { name: "key-alias.txt" });

      archive.finalize();

      output.on('close', () => {
        resolve(filename);
      });
    }
    catch (err) {
      reject(err);
    }
  })
}

module.exports = router;