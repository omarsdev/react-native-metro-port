module.exports = {
  dependency: {
    platforms: {
      // Debug only, so the pod is never linked into a Release build.
      ios: { configurations: ['Debug'] },
    },
  },
};
