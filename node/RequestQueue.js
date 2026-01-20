const axios = require('axios');

class RequestQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    // maps request_id to Promise resolvers
    this.requestMap = new Map();
  }

  async addRequest(endpoint, code) {
    const request_id = Date.now() + '-' +
      Math.random().toString(36).substring(2, 11);
    const requestPromise = new Promise((resolve, reject) => {
      this.requestMap.set(request_id, { resolve, reject });
    });
    this.queue.push({ request_id, endpoint, code });
    this.processQueue();
    return requestPromise;
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    const { request_id, endpoint, code } = this.queue.shift();
    try {
      console.log(`Processing request ${request_id} with endpoint ${endpoint}`);
      const response = await axios.post('http://cadquery:5000/' + endpoint, {
        code: code
      }, {
        responseType: (endpoint === 'stl' || endpoint === 'step') ? 'arraybuffer' : 'json',
        timeout: 120000 // allow CadQuery some time for complex models
      });
      const resolver = this.requestMap.get(request_id);
      if (resolver) {
        // Resolve with the full axios response object so caller can forward headers/binary
        resolver.resolve(response);
        this.requestMap.delete(request_id);
      }
    } catch (error) {
      console.log('[ERROR] ', error.response?.data?.message
        || error.response?.data || error.message);
      const resolver = this.requestMap.get(request_id);
      if (resolver) {
        if (error.response) {
          resolver.reject({
            status: error.response.status,
            data: error.response.data,
            headers: error.response.headers
          });
        } else {
          resolver.reject(error);
        }
        this.requestMap.delete(request_id);
      }
    }
    this.isProcessing = false;
    // process next
    this.processQueue();
  }
}

module.exports = RequestQueue;