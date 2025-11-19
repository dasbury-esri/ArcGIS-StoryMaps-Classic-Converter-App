const fetch = require('node-fetch'); // Netlify supports node-fetch v2

exports.handler = async function(event, context) {
  const imageUrl = event.queryStringParameters.url;
  if (!imageUrl) {
    return {
      statusCode: 400,
      body: 'Missing url parameter'
    };
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: 'Failed to fetch image'
      };
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.buffer();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: 'Error fetching image'
    };
  }
};