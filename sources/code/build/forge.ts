/*
 * Electron Forge Config (configForge.js)
 */

// Let's import some keys from the package.json:

import type { buildInfo } from "../common/global";
import packageJson, { Person } from "../common/modules/package";
import { existsSync } from "fs";
import { readFile, writeFile, rm } from "fs/promises";
import { resolve } from "path";
import type { ForgeConfigFile, ForgePlatform } from "./forge.d";
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";

const projectPath = resolve(__dirname, "../../..");
const AppUserModelId = process.env["WEBCORD_WIN32_APPID"];
const FlatpakId = process.env["WEBCORD_FLATPAK_ID"]?.toLowerCase() ??
  "io.github.spacingbat3.webcord";

// Global variables in the config:
const iconFile = "sources/assets/icons/app";
const desktopGeneric = "Internet Messenger";
const desktopCategories = (["Network", "InstantMessaging"] as unknown as ["Network"]);

// Some custom functions

async function getCommit():Promise<string | null> {
  const refsPath = (await readFile(resolve(projectPath, ".git/HEAD")))
    .toString()
    .split(": ")[1]
    ?.trim();
  if(refsPath !== undefined)
    return (await readFile(resolve(projectPath, ".git", refsPath)))
      .toString()
      .trim();
  return null;
}

const env = {
  asar: process.env["WEBCORD_ASAR"]?.toLowerCase() !== "false",
  build: process.env["WEBCORD_BUILD"]?.toLowerCase()
};

function getElectronPath(platform:ForgePlatform) {
  switch (platform) {
    case "darwin":
      return "Electron.app/Contents/MacOS/Electron";
    case "win32":
      return "electron.exe";
    default:
      return "electron";
  }
}

function getBuildID() {
  switch(env.build) {
    case "release":
    case "stable":
      return "release";
    default:
      return "devel";
  }
}

const config: ForgeConfigFile = {
  buildIdentifier: getBuildID,
  packagerConfig: {
    executableName: packageJson.data.name, // name instead of the productName
    asar: env.asar,
    icon: iconFile, // used in Windows and MacOS binaries
    extraResource: [
      "LICENSE"
    ],
    quiet: true,
    ignore: [
      // Directories:
      /sources\/app\/.build/,
      /out\//,
      /schemas\//,
      // Files:
      /\.eslintrc\.json$/,
      /tsconfig\.json$/,
      /sources\/app\/forge\/config\..*/,
      /sources\/code\/.*/,
      /sources\/assets\/icons\/app\.icns$/,
      // Hidden (for *nix OSes) files:
      /^\.[a-z]+$/,
      /.*\/\.[a-z]+$/
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: "This lets this app to internally manage the microphone access.",
      NSCameraUsageDescription: "This lets this app to internally manage the camera access."
    }
  },
  makers: [
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"]
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        icon: iconFile + ".icns",
        debug: getBuildID() === "devel"
      }
    },
    {
      name: "@reforged/maker-appimage",
      config: {
        options: {
          icon: iconFile + ".png",
          genericName: desktopGeneric,
          categories: desktopCategories
        }
      }
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          icon: iconFile + ".png",
          section: "web",
          genericName: desktopGeneric,
          categories: desktopCategories
        }
      }
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {
        options: {
          icon: iconFile + ".png",
          genericName: desktopGeneric,
          categories: desktopCategories
        }
      }
    }
    /* Snaps are disabled until maker will be fixed to work without the
       multipass.
    {
      name: "@electron-forge/maker-snap",
      config: {
        features: {
          audio: true,
          browserSandbox: true
        },
        grade: (getBuildID() === "release" ? "stable" : "devel"),
      }
    },
    */
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        prerelease: getBuildID() === "devel",
        repository: {
          owner: packageJson.data.author !== undefined ? new Person(packageJson.data.author).name : "SpacingBat3",
          name: "WebCord"
        },
        draft: false
      }
    }
  ],
  hooks: {
    packageAfterCopy: async (_ForgeConfig, path:string, _electronVersion: string, platform: ForgePlatform) => {
      /** Generates `buildInfo.json` file and saves it somewhe. */
      async function writeBuildInfo() {
        const buildConfig: buildInfo = {
          ...(platform === "win32" && AppUserModelId !== undefined ? { AppUserModelId } : {}),
          type: getBuildID(),
          commit: getBuildID() === "devel" ? (await getCommit())??undefined : undefined,
          features: {
            updateNotifications: process.env["WEBCORD_UPDATE_NOTIFICATIONS"] !== "false"
          }
        };
        await writeFile(resolve(path, "buildInfo.json"), JSON.stringify(buildConfig, null, 2));
      }
      /** Removes data that is useless for specific platforms */
      async function removeUselessPlatformData() {
        const ext = platform === "win32" ? ".png" : ".ico";
        const icon = resolve(path, iconFile+ext);
        if(existsSync(icon))
          await rm(icon);
      }
      return Promise.all([
        writeBuildInfo(),
        removeUselessPlatformData()
      ]);
    },
    // Hardened Electron binary via Electron Fuses feature.
    packageAfterExtract: (_ForgeConfig, path:string, _electronVersion: string, platform: ForgePlatform) =>
      flipFuses(resolve(path, getElectronPath(platform)), {
        version: FuseVersion.V1,
        [FuseV1Options.OnlyLoadAppFromAsar]: env.asar,
        [FuseV1Options.RunAsNode]: getBuildID() === "devel",
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: getBuildID() === "devel",
        [FuseV1Options.EnableNodeCliInspectArguments]: getBuildID() === "devel"
      })
  }
};

/*
 * Since `maker-flatpak` is still silently failing, giving at normal
 * circumstances an inadequate information about the error itself (only useless
 * exit code), it is why I have it disabled by the default. Simply, I don't want
 * to cause a confusion just because someone has not added a flathub repository
 * for their user-wide Flathub environment.
 * 
 * It will stay as it is until either official maker will resolve this or my
 * own maker implementation will be mature enough to be released.
 */
if(process.env["WEBCORD_FLATPAK"]?.toLowerCase() === "true")
  config.makers?.push({
    name: "@electron-forge/maker-flatpak",
    config: {
      options: {
        id: FlatpakId,
        genericName: desktopGeneric,
        categories: desktopCategories,
        runtimeVersion: "21.08",
        baseVersion: "21.08",
        files: [
          [
            projectPath+"/docs",
            "/share/docs/"+packageJson.data.name
          ],
          [
            projectPath+"/LICENSE",
            "/share/licenses/"+packageJson.data.name+"/LICENSE.txt"
          ]
        ],
        icon: iconFile + ".png"
      }
    }
  });

module.exports = config;