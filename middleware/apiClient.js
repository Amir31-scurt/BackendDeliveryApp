const axios = require("axios");

// Create an Axios instance
const apiClient = axios.create({
  baseURL: "/admin",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a request interceptor to attach the token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

module.exports = apiClient;
module.exports.default = apiClient;
