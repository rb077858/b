export default {
  async fetch() {
    return new Response("hello world", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
