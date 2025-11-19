// filepath: netlify/functions/proxy-feature.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const url = event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, body: 'Missing url parameter' };
  }
  const response = await fetch(url);
  const data = await response.text();
  return {
    statusCode: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
    body: data
  };
};