module.exports = {
  async redirects() {
    return [
      { source: '/single-quotes', destination: '/dest-a', permanent: true },
      { destination: '/dest-b', source: '/reversed-order', permanent: false },
      { source: "/double-quotes", destination: "/dest-c" },
    ];
  },
};
