# react-native-metro-port

Makes debug builds connect to the Metro port your project is really using, on iOS and Android, even with prebuilt React Core and even when you build from Xcode or Android Studio.

Install it as a dev dependency. There is nothing to configure and no native code to edit.

## The problem

You have two React Native projects open. The first one's Metro holds port 8081, so the second one's Metro runs on 8082, and the app still connects to 8081:

- If nothing is on 8081, the app can't find Metro.
- If another project's Metro is on 8081, the app **loads that project's JavaScript**, which usually shows up as confusing errors, not as a connection failure.

### Why it happens on iOS

React Native's default Metro port is a compile-time constant:

```objc
const NSUInteger kRCTBundleURLProviderDefaultPort = RCT_METRO_PORT;
```

The CLI passes your port to `xcodebuild` as `RCT_METRO_PORT`, and that value only takes effect when React Core is compiled from source. Prebuilt React Core ships as a finished `React.xcframework`, so the constant was fixed at 8081 before your build started. The CLI is doing its job; the value has nowhere to go. `--port 8082` doesn't help either.

### Why it happens on Android

The port is stored in app resources, so `react-native run-android --port 8082` works. But only the CLI passes a port. **Android Studio's Run button doesn't**, so that build gets 8081, and it doesn't run `adb reverse` either. On an emulator the app then loads whichever Metro holds 8081. On a USB device it finds no Metro, or the wrong one if an old `adb reverse` is still in place.

### Both platforms, before CLI 20.2

If you accept the "use another port?" prompt, older CLI versions start Metro on the new port but still build the app with the old one. That's React Native 0.86 and earlier with their default CLI.

## Install

```sh
yarn add --dev react-native-metro-port
cd ios && bundle exec pod install
```

Then build as usual, from the command line, Xcode or Android Studio:

```sh
yarn ios
yarn android
# or, to choose the port yourself
yarn ios --port 8082
```

## How it works

**At build time, on your machine**, an Xcode script phase or Gradle task picks the port:

1. The port the CLI passed, if the Metro there reports this project as its root, through the `X-React-Native-Project-Root` header.
2. Otherwise, the Metro on ports 8081–8090 that reports this project. This covers building from Xcode or Android Studio, and a stale port from an older CLI, and it means another project's Metro is never mistaken for yours.
3. Otherwise, the port the CLI passed. Metro may not have started yet.

On Android it also runs `adb reverse` for that port on every connected device, which a build from Android Studio otherwise wouldn't get.

**At launch**, a small hook writes that port to the setting behind the dev menu: `jsLocation` (**Configure Bundler**) on iOS and `debug_http_host` (**Change Bundle Location**) on Android. The bundle, Fast Refresh and the terminal's reload command all follow it.

If the port is 8081, or no Metro is found, nothing is set and React Native behaves as it always does.

## What it won't touch

- **Release builds.** On iOS the pod is linked in the `Debug` configuration only, its code is wrapped in `#if DEBUG`, and the script phase does nothing without `DEBUG`. On Android the Gradle task and the startup hook exist in the debug variant only. Autolinking needs a `ReactPackage` to exist in every build type, so a release APK contains one empty class that does nothing.
- **Launch performance.** There are no network calls at launch. The port is decided during the build.
- **Your choice in the dev menu.** An address you set by hand stays in place. Clear it there to hand control back.

## Limitations

- **The port is fixed at build time.** If Metro moves to another port, rebuild, or set it once through the dev menu.
- **From Xcode or Android Studio, start Metro first.** The build can only find a Metro that's already running.
- **Before React Native 0.73, Metro doesn't report its project.** Nothing can be found by scanning, so builds from Xcode or Android Studio keep the default. Ports passed by the CLI still work.
- **Android needs `bash` and `curl`.** Without them, as on most Windows machines, the build carries on and the app keeps React Native's default. Windows hasn't been tested.
- **Custom Android build types get nothing.** Only the library's `debug` variant has the hook, so a `staging` type falling back to `release` behaves as if this package weren't installed.
- **Custom debug configurations need listing.** If yours isn't named `Debug`, add it in your app's `react-native.config.js`:

  ```js
  module.exports = {
    dependencies: {
      'react-native-metro-port': {
        platforms: { ios: { configurations: ['Debug', 'Staging.Debug'] } },
      },
    },
  };
  ```

- **Expo isn't covered.** This is for bare React Native projects.

## Checking that it worked

The Xcode build log, or the Gradle output for `:react-native-metro-port:resolveMetroPort`, shows one of these:

```
note: react-native-metro-port: this build will use Metro on port 8082
note: react-native-metro-port: no custom port, leaving React Native's default in place
```

## Compatibility

Tested with Xcode 27.1, CocoaPods 1.15.2, Node 24.21 and an API 35 emulator, with another project's Metro on 8081 and this project's on another port. "App run" means the app was launched and the bundle was confirmed to come from this project's Metro.

| React Native | iOS | Android |
| --- | --- | --- |
| 0.88.1 | App run: dynamic frameworks | App run: new architecture |
| 0.87.1 | App run: static libraries | Not tested |
| 0.86.3 | App run: static libraries | App run: new architecture, with 0.86.2 native binaries |
| 0.85.3 | App run: static libraries | Not tested |
| 0.84 and 0.74 to 0.83 | Not tested | Not tested |
| 0.73.11 | Not tested | App run: old architecture |
| 0.72.17 | Not tested | CLI builds work. Android Studio builds keep the default port, because Metro doesn't report its project |
| 0.71.19 | Doesn't build on Xcode 27.1, with or without this package | Not tested |

`peerDependencies` covers 0.85 to 0.88. Older versions may work, but they aren't claimed. If you try one, please open an issue with the result.

## Development

```sh
npm test
```

## License

MIT
