exports.handler = async (event) => {
  // Simple shim to verify function registration
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ ok: true, shim: true })
  };
};
