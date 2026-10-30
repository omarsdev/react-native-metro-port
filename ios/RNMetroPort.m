#if DEBUG

#import <Foundation/Foundation.h>
#import <React/RCTBundleURLProvider.h>

#if __has_include("RNMetroPortConfig.h")
#import "RNMetroPortConfig.h"
#endif

/**
 * React Native's default Metro port is a compile-time constant. With prebuilt React
 * Core that constant was fixed at 8081 when the framework was built, so the
 * RCT_METRO_PORT a build passes along can't reach it.
 *
 * jsLocation is the public setting behind the dev menu's "Configure Bundler", and it
 * takes priority over the default. Every consumer of the bundler address reads it,
 * so the bundle, Fast Refresh and the terminal's reload command all follow it.
 */
@interface RNMetroPort : NSObject
@end

@implementation RNMetroPort

// Remembers what this class wrote, because jsLocation persists in NSUserDefaults.
// That's how a location set by hand is told apart from one to update or clear.
static NSString *const kManagedLocationKey = @"RNMetroPort_managedLocation";

+ (void)load
{
  NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
  RCTBundleURLProvider *settings = [RCTBundleURLProvider sharedSettings];

  NSString *managedLocation = [defaults stringForKey:kManagedLocationKey];
  NSString *currentLocation = settings.jsLocation;
  if (currentLocation.length > 0 && ![currentLocation isEqualToString:managedLocation]) {
    return;
  }

#ifdef RN_METRO_PORT_RESOLVED
  NSString *location =
      [NSString stringWithFormat:@"%@:%d", [self packagerHost], RN_METRO_PORT_RESOLVED];
  settings.jsLocation = location;
  [defaults setObject:location forKey:kManagedLocationKey];
#else
  if (managedLocation != nil) {
    settings.jsLocation = nil;
    [defaults removeObjectForKey:kManagedLocationKey];
  }
#endif
}

#ifdef RN_METRO_PORT_RESOLVED
// React Native's build script records the Mac's IP in ip.txt for device builds. A
// simulator has no such file and shares the Mac's localhost.
+ (NSString *)packagerHost
{
  NSString *path = [[NSBundle mainBundle] pathForResource:@"ip" ofType:@"txt"];
  NSString *contents = path ? [NSString stringWithContentsOfFile:path
                                                        encoding:NSUTF8StringEncoding
                                                           error:nil]
                            : nil;
  NSString *host = [contents
      stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  return host.length > 0 ? host : @"localhost";
}
#endif

@end

#endif
