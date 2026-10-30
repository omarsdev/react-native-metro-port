# react-native-metro-port

Makes iOS debug builds connect to the Metro port your project is really using, even with prebuilt React Core.

Install it as a dev dependency. There is nothing to configure and no native code to edit.

## The problem

You have two React Native projects open. The first one's Metro holds port 8081, so `react-native run-ios` offers 8082 for the second. You accept, Metro starts on 8082, and the app still connects to 8081:

- If nothing is on 8081, the app can't find Metro.
- If another project's Metro is on 8081, the app **loads that project's JavaScript**, which usually shows up as confusing errors, not as a connection failure.

`--port 8082` doesn't help either.

### Why it happens

React Native's default Metro port is a compile-time constant:

```objc
const NSUInteger kRCTBundleURLProviderDefaultPort = RCT_METRO_PORT;
```

The CLI passes your port to `xcodebuild` as `RCT_METRO_PORT`, and that value only takes effect when React Core is compiled from source. Prebuilt React Core ships as a finished `React.xcframework`, so the constant was fixed at 8081 before your build started. The CLI is doing its job; the value has nowhere to go.

Android isn't affected, because there the port is stored in app resources and read at runtime.

## Install

```sh
yarn add --dev react-native-metro-port
cd ios && bundle exec pod install
```

Then build as usual:

```sh
yarn ios
# or, to choose the port yourself
yarn ios --port 8082
```

## How it works

**At build time, on your Mac**, a script phase picks the port:

1. `RCT_METRO_PORT`, if the CLI passed one.
2. Otherwise, the Metro on ports 8081–8090 that reports this project as its root, through the `X-React-Native-Project-Root` header. This covers building from Xcode, and it means another project's Metro is never mistaken for yours.

**At launch**, a small hook sets `RCTBundleURLProvider`'s `jsLocation` to that port. It's the same public setting the dev menu's **Configure Bundler** writes, so the bundle, Fast Refresh and the terminal's reload command all follow it.

If the port is 8081, or no Metro is found, nothing is set and React Native behaves as it always does.

## What it won't touch

- **Release builds.** The pod is linked in the `Debug` configuration only, and its code is wrapped in `#if DEBUG`.
- **Launch performance.** There are no network calls at launch. The port is decided during the build.
- **Your choice in the dev menu.** An address you set by hand in Configure Bundler stays in place. Use **Reset to Default** there to hand control back.

## Limitations

- **The port is fixed at build time.** If Metro moves to another port, rebuild, or set it once through Configure Bundler.
- **From Xcode, start Metro first.** The script can only find a Metro that's already running when you build.
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

The Xcode build log shows one of these for the `react-native-metro-port` target:

```
note: react-native-metro-port: this build will use Metro on port 8082
note: react-native-metro-port: no custom port, leaving React Native's default in place
```

## Compatibility

Tested on React Native 0.88.0-rc.2 with prebuilt React Core, CocoaPods 1.15.2 and `use_frameworks! :linkage => :dynamic`. Other versions should work, because it relies only on the public `jsLocation` setting, but they haven't been tested. If you try one, please open an issue with the result.

## Development

```sh
npm test
```

## License

MIT
