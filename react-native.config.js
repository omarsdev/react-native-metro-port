module.exports = {
  dependency: {
    platforms: {
      // Debug only, so the pod is never linked into a Release build.
      ios: { configurations: ['Debug'] },
      // `run-android --port` already works: the port is written to app resources
      // at build time and read at runtime, so there is nothing to fix there.
      android: null,
    },
  },
};
