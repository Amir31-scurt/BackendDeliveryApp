const fetch = require("node-fetch");

const GRAPHQL_API_URL = process.env.GRAPHQL_API_URL;

/**
 * Executes a GraphQL request
 * @param {string} query - The GraphQL query string
 * @param {object} variables - Variables for the query
 * @param {string} token - Admin token for authentication
 * @returns {Promise<object>} - The response data
 */
const graphqlRequest = async (query, variables = {}, token = null) => {
  try {
    const headers = {
      "Content-Type": "application/json",
    };

    // Add token to headers if provided
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(GRAPHQL_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return result.data;
  } catch (error) {
    throw error;
  }
};

module.exports = { graphqlRequest };
module.exports.graphqlRequest = graphqlRequest;
