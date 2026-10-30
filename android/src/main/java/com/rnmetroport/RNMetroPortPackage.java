package com.rnmetroport;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import java.util.Collections;
import java.util.List;

/**
 * Autolinking only links a library that has a ReactPackage, and the generated
 * PackageList names this class in every build type. It does nothing: the work is done
 * by RNMetroPortProvider, which exists in debug builds only.
 */
public class RNMetroPortPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }

  // A raw List because the parameterized return type differs between RN versions.
  @Override
  @SuppressWarnings("rawtypes")
  public List createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
