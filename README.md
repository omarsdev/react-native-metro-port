# react-native-metro-port

[![npm version](https://img.shields.io/npm/v/react-native-metro-port)](https://www.npmjs.com/package/react-native-metro-port)
[![license](https://img.shields.io/npm/l/react-native-metro-port)](./LICENSE)
[![tests](https://github.com/omarsdev/react-native-metro-port/actions/workflows/test.yml/badge.svg)](https://github.com/omarsdev/react-native-metro-port/actions/workflows/test.yml)

**Your React Native debug build connects to the right Metro, on iOS and Android. Nothing to configure.**

![Animation. Without this package, an app for Project B connects to port 8081, loads Project A's JavaScript and shows a "has not been registered" error. With this package, the build asks each Metro which project it belongs to, finds Project B's Metro on port 8082, and the app connects to it.](https://raw.githubusercontent.com/omarsdev/react-native-metro-port/main/docs/how-it-works.gif)

## In short

- **The problem:** when you run two React Native projects at once, the second project's Metro moves to another port, such as 8082. The app often still connects to 8081, so it loads the wrong project's JavaScript or finds no Metro at all.
- **The fix:** during a debug build, this package finds the Metro that belongs to your project and points the app at it.
- **The cost:** one small dev dependency. It has no dependencies of its own, needs no code changes, and adds no network calls at launch.

## Quick start

```sh
yarn add --dev react-native-metro-port
# or: npm install --save-dev react-native-metro-port

cd ios && bundle exec pod install
```

That's all. Android needs no extra step. Start Metro first, then build the way you always do:

```sh
yarn ios
yarn android
```

Xcode's Run button and Android Studio's Run button work too.

## Set a fixed port (optional)

Give each project its own port once, instead of passing `--port` every time. Put this line at the top of `react-native.config.js` in your project root:

```js
process.env.RCT_METRO_PORT = '8088';

module.exports = {};
```

If the file already exists, add just the first line and keep your `module.exports`.

Now `yarn start`, `yarn ios`, `yarn android`, Xcode and Android Studio all use port 8088, and Metro no longer has to be running before you build. Commit the file and your team gets the same port.

- **Keep it a plain number on its own line.** Xcode and Android Studio builds read this line as text. If the port is computed in code, they search for your Metro instead.
- **`--port` still wins** when you pass it.
- **If another project's Metro is on that port,** the package looks for yours instead.
- **Release builds ignore it.** A Release app has its JavaScript built in and doesn't use Metro.

## Do you need this?

You probably do if you've seen any of these while working on more than one project:

| What you see | What's really happening |
| --- | --- |
| `"MyApp" has not been registered` | The app loaded another project's JavaScript. |
| Errors from a library your app doesn't use | Same cause. That library is in the other project. |
| `Unable to load script` | The app is looking for Metro on the wrong port. |
| `yarn start` fails with `EADDRINUSE` | Another project's Metro holds 8081. [Set a fixed port](#set-a-fixed-port-optional). |
| It works from the terminal but not from Android Studio or Xcode | Those builds aren't given your Metro's port. |
| You accepted "use another port?" and it still fails | CLI versions before 20.2 keep the old port. |

## What it saves you

- **Editing native code** to change the port.
- **Setting the address by hand** in the dev menu on every device.
- **Passing `--port` every time,** or keeping it in your `package.json` scripts.
- **Running `adb reverse` yourself** after building from Android Studio.
- **Stopping your other project** just to free up port 8081.
- **Debugging errors that have nothing to do with your code.**

## How it works

1. **It finds your Metro during the build.** It starts with the port you chose, from `--port` or your fixed port. If that Metro is yours, or nothing is running there yet, it uses that port. Otherwise it asks each Metro on ports 8081–8090 which project it belongs to, using the `X-React-Native-Project-Root` header.
2. **On Android, it connects USB devices.** It runs `adb reverse` for that port on every connected device.
3. **It tells the app at launch.** A small debug-only hook writes the port to the same setting the dev menu uses: `jsLocation` on iOS and `debug_http_host` on Android. The bundle, Fast Refresh and the terminal's reload command all follow it.

If your Metro is on 8081, or no Metro is found, nothing is set and React Native behaves as it always does.

## Check that it worked

The Xcode build log, or the Gradle output for `:react-native-metro-port:resolveMetroPort`, shows one of these:

```
note: react-native-metro-port: this build will use Metro on port 8082
note: react-native-metro-port: no custom port, leaving React Native's default in place
```

## What it won't touch

- **Release builds.** The port search and the startup hook only run in debug builds. On iOS the pod isn't linked into Release. On Android a release app contains one empty class, because autolinking requires it, and that class does nothing.
- **App launch.** It makes no network calls at launch. The port is decided during the build.
- **Your dev menu choice.** An address you set by hand stays in place. Clear it to hand control back.

## Limitations

- **Start Metro before you build from Xcode or Android Studio,** unless you've set a fixed port. Without one, the build can only find a Metro that's already running.
- **The port is fixed at build time.** If Metro moves, rebuild.
- **Before React Native 0.73, Metro doesn't say which project it belongs to.** Builds from Xcode and Android Studio then keep the default port, though ports passed by the CLI still work.
- **Android needs `bash` and `curl`.** Without them, as on most Windows machines, the build carries on and the app keeps the default port. Windows hasn't been tested.
- **Custom Android build types get nothing.** Only the `debug` variant has the hook.
- **Custom iOS debug configurations must be listed.** If yours isn't named `Debug`, add it in your app's `react-native.config.js`:

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

## Compatibility

`peerDependencies` covers React Native 0.85 to 0.88. Older versions may work, but they aren't claimed.

| React Native | iOS | Android |
| --- | --- | --- |
| 0.88.1 | ✅ Simulator | ✅ Emulator, and a physical phone from Android Studio's Run button |
| 0.87.1 | ✅ Simulator | Not tested |
| 0.86.3 | ✅ Simulator | ✅ Emulator, with 0.86.2 native files |
| 0.85.3 | ✅ Simulator | Not tested |
| 0.74 to 0.84 | Not tested | Not tested |
| 0.73.11 | Not tested | ✅ Emulator |
| 0.72.17 | Not tested | ⚠️ `--port` works, but Android Studio builds keep the default port |
| 0.71.19 | ❌ Doesn't build on Xcode 27.1, with or without this package | Not tested |

✅ means the app was launched and the bundle was confirmed to come from the project's own Metro, with another project's Metro on 8081. Tested with Xcode 27.1, CocoaPods 1.15.2 and Node 24.21. The physical iPhone test was on version 0.1.0 with React Native 0.88.0-rc.2.

The fixed port was tested with real builds on 0.88.1, on a simulator and a physical Android phone. On 0.85 to 0.87 only the CLI commands were checked, not full builds.

If you try another version, please [open an issue](https://github.com/omarsdev/react-native-metro-port/issues) with the result.

## Why this happens

**iOS.** The default port is a compile-time constant, `kRCTBundleURLProviderDefaultPort`. The CLI passes your port as `RCT_METRO_PORT`, but that only takes effect when React Core is compiled from source. Prebuilt React Core was compiled with 8081 before your build started.

**Android.** The port is stored in app resources, and `run-android --port` sets it correctly. But only the CLI passes a port. Android Studio's Run button doesn't, and it doesn't run `adb reverse` either.

**Both, before CLI 20.2.** If you accept the "use another port?" prompt, the CLI starts Metro on the new port but still builds the app with the old one. That's React Native 0.86 and earlier with their default CLI.

## Development

```sh
npm test
node docs/render-animation.js   # rebuilds docs/how-it-works.gif, needs Chrome and ffmpeg
```

## License

MIT
