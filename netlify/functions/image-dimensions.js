// netlify/functions/image-dimensions.js
const fetch = require('node-fetch');
const sizeOf = require('image-size');

exports.handler = async function(event) {
  const imageUrl = event.queryStringParameters.url;
  if (!imageUrl) return { statusCode: 400, body: 'Missing url parameter' };
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return { statusCode: response.status, body: 'Failed to fetch image' };
    const buffer = await response.buffer();
    const dimensions = sizeOf(buffer);
    return {
      statusCode: 200,
      body: JSON.stringify(dimensions),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    };
  } catch (err) {
    return { statusCode: 500, body: 'Error fetching image or reading dimensions' };
  }
};