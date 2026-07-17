export default {
  async redirects() {
    return [{ source: "/old-guide", destination: "/guide", permanent: true }];
  },
};
