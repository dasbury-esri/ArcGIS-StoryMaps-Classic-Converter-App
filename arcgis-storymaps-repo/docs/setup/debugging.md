# Debugging

<!-- omit in toc -->

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Real-Time Step Debugging](#real-time-step-debugging)
- [Debugging on mobile (local development)](#debugging-on-mobile-local-development)
  - [Where to find your _your_ computer name](#where-to-find-your-your-computer-name)
  - [macOS specific setup - using Iphone](#macos-specific-setup---using-iphone)
  - [IOS testing with Xcode (macOS only)](#ios-testing-with-xcode-macos-only)
  - [Android setup using Chrome](#android-setup-using-chrome)
- [Debug Modes/Environment Variables](#debug-modesenvironment-variables)
- [React Dev Tools](#react-dev-tools)
- [StoryMaps Inspector](#storymaps-inspector)
  - [Resources](#resources)
- [Additional debugging resources](#additional-debugging-resources)

## Real-Time Step Debugging

In `launch.json`, you'll find these two JSON configurations:

```json
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug ArcGIS StoryMaps",
  "url": "${config:agsmDebuggerUrl}",
  "webRoot": "${workspaceFolder}/packages/storymaps-app"
},
{
  "type": "chrome",
  "request": "launch",
  "name": "Debug StoryMaps Express",
  "url": "${config:smxDebuggerUrl}",
  "webRoot": "${workspaceFolder}/packages/storymaps-express"
}
```

These allow you to perform real-time step debugging of two of our apps: ArcGIS StoryMaps and StoryMaps Express. No extensions are required since the debugger is built into VS Code.

Note that the `url` key expects you to specify your localhost app's URL in your VS Code user settings (JSON):

```json
"url": "${config:agsmDebuggerUrl}"
```

To do this:

1. Open your command palette.
2. Type `preferences` and look for `Preferences: Open Settings (JSON)`.
3. Add the following line somewhere in the JSON settings:

```json
"agsmDebuggerUrl": "https://yourUrl:3443"
```

Be sure to use the right port number for whichever app you're configuring:

- AGSM: 3443
- SMX: 4443

Then, simply access the debugger pane in VS Code and select one of the browsers to launch from the dropdown. You can now place breakpoints in your code and use VS Code's step debugger to interact with our app

## Debugging on mobile (local development)

Locally, we don't support signed-in access of AGSM or SMX on mobile devices (due to domain/cookie restrictions). If you need to test/debug signed-out pages locally (like the viewer of a public story/collection), here are the steps:

1. Make sure that _your_ URL (`https://YOUR_COMPUTER_NAME.esri.com`) is working. You should be able see the locally hosted pages that don't require sign-in up and running at `https://YOUR_COMPUTER_NAME.esri.com:3443`

- If `https://YOUR_COMPUTER_NAME.esri.com:3443` is not working, you'll need to modify your hosts file to include _your_ URL. There are steps on how to under [Getting Started](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/docs/setup/getting-started.md#desktop). Instead of `YOUR_SUBDOMAIN_HERE.arcgis.com` use `YOUR_COMPUTER_NAME.esri.com`.

2. Ensure you are on the same network on both desktop and mobile device (i.e. both on the same VPN or wifi network).

3. Open the URL mentioned above in step 1 on your iOS device (don't forget you can [AirDrop the URL](https://apple.stackexchange.com/a/356311)) and sign in. You should be able see all the locally hosted pages (if _your_ URL doesn't work, try using your computers IP address).

### Where to find your _your_ computer name

In case you prefer a different name, then you need to go to Service Desk to make the change.

#### Windows

> Control Panel > System and Security > System > Computer name, domain, and workgroup settings

#### macOS

> System Preferences > Sharing

### macOS specific setup - using Iphone

1. Spin up the desired local dev environment on your computer (yarn dev:smx etc)

2. Connect your phone to your Mac
   Click “Trust this device” on your phone

3. Make sure your phone and mac are connected to the same WiFi network

4. On your Mac, go to System Preferences > General > Sharing

5. Uncheck the `Internet Sharing` checkbox if it is enabled

6. Click the `i` icon on the right of the "Internet Sharing" option and in `To computers using`, select iPhone USB

7. Turn on the Internet Sharing checkbox again. It will prompt you. Click yes.

8. In this same Sharing settings page, you'll find a Local hostname at the bottom, navigate to that on your phone browser in a private tab like: (`https://[LOCAL_HOST_NAME].local:[PORT_NUMBER]`) where `PORT_NUMBER` is `4443` for SMX and `3443` for AGSM

NOTE: This will only work if you are using a private browser/incognito on your phone

### IOS testing with Xcode (macOS only)

This method will allow you to signed-in to both SMX and AGSM

1. Spin up the desired local dev environment on your computer (yarn dev:smx etc)

2. Download Xcode

3. With Xcode open, open the Xcode menu in the top bar

4. Go into `Open developer tool` and select `Simulator`

5. In the simulator navigate to your local dev environment from the Safari app

### Android setup using Chrome

Based on these two articles:

- [Remote debug Android devices](https://developer.chrome.com/docs/devtools/remote-debugging)
- [Access local servers and Chrome instances with port forwarding](https://developer.chrome.com/docs/devtools/remote-debugging/local-server#usb-port-forwarding)

If you don't have an Android device you can also try using an emulator in Android Studio:

- [Run apps on the Android Emulator](https://developer.android.com/studio/run/emulator)

a. Connecting your Android device to your machine

1. Check if your Android device has its `Developer options` available under `Settings`.
   If not, you'll need to enable it. You can learn more about how to enable this here: https://developer.android.com/studio/debug/dev-options.html#enable.

2. Open the `Developer Options` screen and select `Enable USB Debugging`.

3. On your machine, open Chrome and go to [`chrome://inspect#devices`](chrome://inspect#devices)

4. Make sure `Discover USB devices` is checked.

5. Connect your Android device to your machine using a USB cable.

6. On the Chrome tab, your device might show up as "Offline" and that it's pending authentication. In this case you should accept the prompt showing on your device's screen.

7. If you see the model name of your Android device on the Chrome tab, then the connection was successful.

b. Accessing local dev on your Android device using port forwarding

1. Open [`chrome://inspect#devices`](chrome://inspect#devices) Chrome tab.

2. Make sure `Discover USB devices` is checked.

3. Click `Port Forwarding`.

4. A modal should open called "Port Forwarding Settings". `localhost:8080` is set up by default.

5. On the second row type in the port then the IP address and port of the app you want to access.
   |app|port|IP address and port|
   |-|-|-|
   |agsm|3443|localhost:3443 |
   |smx|4443|localhost:4443|

6. Click `Done`

7. Port forwarding is now set up.

c. Once steps `a` and `b` are done you can access the the app on your Android device. Open the Chrome Browser and go to the `localhost` you specified in the `IP address and port` field. If that does not work try replacing "localhost" with your machine's IP address.

## Debug Modes/Environment Variables

Both `storymaps-app` and `storymaps-express` have `.env.development` and `.env` files that enable special debug env variables for specifc development/debugging uses.

- `ENABLE_SUSPENSE_DEBUG` enables the `SuspenseDebugFallback` component in [packages/storymaps-builder/src/render/index.tsx](../packages/storymaps-builder/src/render/index.tsx), which renders a large, red fallback div and logs info on which Blocks and Components trigger Suspense boundaries. Read more about 🔗 [`<Suspense>` on the React Docs](https://beta.reactjs.org/reference/react/Suspense).

- `ENABLE_MOUSELESS_MONDAY` [FIXME] [TBD] [TODO] [DOCME]
- `ENABLE_CONSOLE` forces console logs to be enabled on both server and client regardless of dev/prod build.
- `ENABLE_SOURCE_MAPS` enables source maps for debugging production builds. This flag controls the
  🔗 [`productionBrowserSourceMaps` option on Next.js](https://nextjs.org/docs/app/api-reference/next-config-js/productionBrowserSourceMaps) and [`devtool`](https://webpack.js.org/configuration/devtool/) on webpack, which is used for server bundles. See 🔗
  [Debug your original code instead of deployed with source maps](https://developer.chrome.com/docs/devtools/javascript/source-maps) for a guide on how to use source maps.

## React Dev Tools

Essential extension for debugging React apps. Adds Components and Profiler views to Chrome DevTools.

- 🔗 [React Developer Tools on Chrome Web Store](https://chromewebstore.google.com/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi)
- 🔗 [React Developer Tools Guide](https://react.dev/learn/react-developer-tools)

## StoryMaps Inspector

Private Chrome extension for inspecting StoryMaps data model content. Requires special permissions to install; contact:

- Yankuan Zhang <yank8713@esri.com>
- Tony Batts <ton12618@esri.com>
- Rudi Pretorious <rpretorius@esri.com>

### Resources

- 🔗 [StoryMaps Inspector - Chrome Web Store](https://chromewebstore.google.com/detail/storymaps-inspector/imjlijefkgpgbjdelaafapgdijjcclmd?hl=en)
- 🔗 [StoryMaps Inspector Overview (Requires login)](https://storymaps.arcgis.com/briefings/13a2873625904dc2b783fdae830ecc36)

## Additional debugging resources

- 🔗 [JavaScript debugging reference  |  DevTools  |  Chrome for Developers](https://developer.chrome.com/docs/devtools/javascript/reference#stepping)

- 🔗 [Debugging in Visual Studio Code](https://code.visualstudio.com/docs/editor/debugging)
- 🔗 [Chrome DevTools  |  Chrome for Developers](https://developer.chrome.com/docs/devtools)
- 🔗 [Open Chrome DevTools  |  Chrome for Developers](https://developer.chrome.com/docs/devtools/open)
- 🔗 [Firefox DevTools User Docs — Firefox Source Docs documentation](https://firefox-source-docs.mozilla.org/devtools-user/)
- 🔗 [debugger - JavaScript | MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger)
- Use the ignore list and "Group files by Authored/Deployed" view to ignore/skip over library code in debug sessions: 🔗 [JavaScript debugging reference  |  DevTools  |  Chrome for Developers](https://developer.chrome.com/docs/devtools/javascript/reference#ignore-list)
- 🔗 [Skipping Uninteresting Code - Debug Node.js Apps using Visual Studio Code](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_skipping-uninteresting-code)

---

[StoryMaps Documentation (Home)](../../README.md)
