package com.rnmetroport;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import com.facebook.react.modules.systeminfo.AndroidInfoHelpers;

/**
 * Android bakes the Metro port into app resources, but only `react-native run-android`
 * passes one in. A build from Android Studio always gets 8081, which may be another
 * project's Metro.
 *
 * debug_http_host is the setting behind the dev menu's "Change Bundle Location", and
 * it takes priority over that resource. Every consumer of the bundler address reads
 * it, so the bundle, Fast Refresh and the terminal's reload command all follow it.
 *
 * A ContentProvider because the system creates it before Application.onCreate, so this
 * runs before React Native reads the setting, with nothing to add to the app's code.
 */
public class RNMetroPortProvider extends ContentProvider {
  private static final String HOST_KEY = "debug_http_host";

  // Remembers what this class wrote, because debug_http_host persists. That's how a
  // host set by hand is told apart from one to update or clear.
  private static final String MANAGED_HOST_KEY = "rn_metro_port_managed_host";

  @Override
  public boolean onCreate() {
    Context context = getContext();
    // The file React Native's PreferenceManager.getDefaultSharedPreferences opens.
    SharedPreferences preferences =
        context.getSharedPreferences(context.getPackageName() + "_preferences", Context.MODE_PRIVATE);

    String managedHost = preferences.getString(MANAGED_HOST_KEY, null);
    String currentHost = preferences.getString(HOST_KEY, "");
    if (!currentHost.isEmpty() && !currentHost.equals(managedHost)) {
      return true;
    }

    int port = context.getResources().getInteger(R.integer.rn_metro_port);
    if (port > 0) {
      String host = AndroidInfoHelpers.getServerHost(port);
      preferences.edit().putString(HOST_KEY, host).putString(MANAGED_HOST_KEY, host).apply();
    } else if (managedHost != null) {
      preferences.edit().remove(HOST_KEY).remove(MANAGED_HOST_KEY).apply();
    }
    return true;
  }

  @Override
  public Cursor query(
      Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
    return null;
  }

  @Override
  public String getType(Uri uri) {
    return null;
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    return null;
  }

  @Override
  public int delete(Uri uri, String selection, String[] selectionArgs) {
    return 0;
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
    return 0;
  }
}
