export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return new Response("Chia Games is alive!");
    }

    return new Response("OK");
  }
};
